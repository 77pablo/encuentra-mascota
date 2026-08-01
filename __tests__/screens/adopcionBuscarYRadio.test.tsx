import React from 'react';
import { act, create } from 'react-test-renderer';
import AdopcionFeedScreen from '../../src/screens/AdopcionFeedScreen';
import { Chip, Input } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// ADOPCIÓN A LA PAR DEL RESTO DE LA APP (tanda 11, tarea 4).
//
// Tres agujeros que se tapan acá:
//
//  1. EL RADIO QUE EXISTÍA Y NO SE USABA. `busquedaAdopciones.ts` acepta
//     `radioKm` desde la 0030 y esta pantalla mandaba SIEMPRE `null`. Había
//     código muerto sosteniendo un filtro que nadie podía tocar.
//  2. NO HABÍA BUSCADOR DE TEXTO. Era la única superficie de búsqueda del
//     producto sin uno: se podía filtrar por especie y tamaño, pero no escribir
//     "cachorro negro".
//  3. LA EDAD SE MOSTRABA Y NO FILTRABA. La columna existe desde la 0030 y la
//     tarjeta la imprime en la línea de meta; no había forma de filtrar por ella.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

// El hook se espía: lo que importa es QUÉ FILTROS le baja la pantalla.
const mockFiltrosVistos: any[] = [];
let mockEstadoHook = {
  adopciones: [] as any[],
  cargando: false,
  cargandoMas: false,
  error: null as string | null,
  hayMas: false,
};
jest.mock('../../src/hooks/useBusquedaAdopciones', () => ({
  useBusquedaAdopciones: (filtros: any) => {
    mockFiltrosVistos.push(filtros);
    return { ...mockEstadoHook, recargar: jest.fn(), cargarMas: jest.fn() };
  },
}));

let mockCoords: any = null;
const mockRequest = jest.fn();
jest.mock('../../src/hooks/useMyLocation', () => ({
  useMyLocation: () => ({ coords: mockCoords, status: 'idle', request: mockRequest }),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'yo' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useUnread', () => ({
  useUnread: () => ({ count: 0, refresh: jest.fn() }),
}));
jest.mock('../../src/context/AdoptionSavesProvider', () => ({
  useAdoptionSaves: () => ({ estaGuardada: () => false, alternar: jest.fn() }),
}));
jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

const montados: any[] = [];

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <AdopcionFeedScreen navigation={{ navigate: (...a: any[]) => mockNavigate(...a) }} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

/** Los últimos filtros que la pantalla le bajó al hook. */
const ultimosFiltros = () => mockFiltrosVistos[mockFiltrosVistos.length - 1];

function chips(arbol: any): any[] {
  return arbol.root.findAllByType(Chip);
}

function chip(arbol: any, patron: RegExp): any {
  return chips(arbol).find((c: any) => patron.test(String(c.props.label ?? '')));
}

async function tocar(arbol: any, patron: RegExp) {
  const c = chip(arbol, patron);
  expect({ buscado: String(patron), encontrado: !!c }).toEqual({
    buscado: String(patron),
    encontrado: true,
  });
  await act(async () => c.props.onPress());
}

/** Escribe en el buscador y espera a que pase el rebote del tipeo. */
async function escribir(arbol: any, texto: string) {
  const input = arbol.root.findAllByType(Input)[0];
  expect(input).toBeTruthy();
  await act(async () => input.props.onChangeText(texto));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });
}

beforeEach(() => {
  mockFiltrosVistos.length = 0;
  mockNavigate.mockReset();
  mockRequest.mockReset();
  mockCoords = null;
  mockEstadoHook = { adopciones: [], cargando: false, cargandoMas: false, error: null, hayMas: false };
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('el radio deja de estar clavado en null', () => {
  it('sin "cerca de mí" no se ofrece radio: sin centro no hay círculo', async () => {
    const arbol = await montar();
    expect(chip(arbol, /km$/)).toBeUndefined();
  });

  it('con "cerca de mí" aparecen los botones de radio', async () => {
    mockCoords = { lat: -33.4, lng: -70.6 };
    const arbol = await montar();
    await tocar(arbol, /cerca de mí/i);
    expect(chip(arbol, /^5 km$/)).toBeTruthy();
    expect(chip(arbol, /^50 km$/)).toBeTruthy();
  });

  it('elegir 5 km baja radioKm = 5 al buscador (antes iba SIEMPRE null)', async () => {
    mockCoords = { lat: -33.4, lng: -70.6 };
    const arbol = await montar();
    await tocar(arbol, /cerca de mí/i);
    await tocar(arbol, /^5 km$/);
    expect(ultimosFiltros().radioKm).toBe(5);
    // y el centro viaja con él: un radio sin punto no filtra nada
    expect(ultimosFiltros().lat).toBe(-33.4);
    expect(ultimosFiltros().orden).toBe('cerca');
  });

  it('arranca en "todo Chile", que es lo que la pantalla ya hacía', async () => {
    // Poner un radio por defecto le vaciaría el feed a quien vive donde todavía
    // no publica nadie: hoy "cerca de mí" ORDENA por distancia sin recortar, y
    // cablear el filtro no puede cambiarle la pantalla a quien no la tocó.
    mockCoords = { lat: -33.4, lng: -70.6 };
    const arbol = await montar();
    await tocar(arbol, /cerca de mí/i);
    expect(ultimosFiltros().radioKm).toBeNull();
  });

  it('se puede volver a todo Chile después de acotar', async () => {
    mockCoords = { lat: -33.4, lng: -70.6 };
    const arbol = await montar();
    await tocar(arbol, /cerca de mí/i);
    await tocar(arbol, /^5 km$/);
    await tocar(arbol, /todo chile/i);
    expect(ultimosFiltros().radioKm).toBeNull();
  });

  it('soltar "cerca de mí" también suelta el radio', async () => {
    // Un radio sin centro le pediría a la base un círculo alrededor de nada.
    mockCoords = { lat: -33.4, lng: -70.6 };
    const arbol = await montar();
    await tocar(arbol, /cerca de mí/i);
    await tocar(arbol, /^5 km$/);
    await tocar(arbol, /^Recientes$/);
    expect(ultimosFiltros().radioKm).toBeNull();
    expect(ultimosFiltros().lat).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('buscar por texto', () => {
  it('lo que se escribe llega al buscador del servidor', async () => {
    const arbol = await montar();
    await escribir(arbol, 'cachorro negro');
    expect(ultimosFiltros().texto).toBe('cachorro negro');
  });

  it('sin escribir nada, el texto no viaja', async () => {
    // El servicio manda `p_texto` SOLO cuando hay algo: es lo que deja andar el
    // feed contra una base sin la 0052 aplicada.
    const arbol = await montar();
    expect(ultimosFiltros().texto ?? '').toBe('');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('filtrar por edad', () => {
  it('la edad que la tarjeta ya mostraba ahora se puede filtrar', async () => {
    const arbol = await montar();
    await tocar(arbol, /^Cachorro$/);
    expect(ultimosFiltros().edad).toBe('cachorro');
  });

  it('están las tres edades de la 0030', async () => {
    const arbol = await montar();
    for (const label of [/^Cachorro$/, /^Adulto$/, /^Senior$/]) {
      expect({ label: String(label), hay: !!chip(arbol, label) }).toEqual({
        label: String(label),
        hay: true,
      });
    }
  });

  it('volver a "todas" suelta el filtro', async () => {
    const arbol = await montar();
    await tocar(arbol, /^Senior$/);
    expect(ultimosFiltros().edad).toBe('senior');
    const todas = chips(arbol).filter((c: any) => /^Todas$/.test(String(c.props.label)));
    // Hay dos "Todas" (especie y edad): la de edad es la última en pantalla.
    await act(async () => todas[todas.length - 1].props.onPress());
    expect(ultimosFiltros().edad).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('el error no puede dejar a la persona encerrada', () => {
  it('con el feed en error, los filtros siguen ahí para poder soltarlos', async () => {
    // Es el caso real de la degradación: con la 0052 sin aplicar, escribir en el
    // buscador devuelve error. Si la pantalla se reemplaza entera por el cartel
    // de error, el texto escrito queda inalcanzable y la única salida es cerrar
    // la app. El listado SÍ funciona sin ese filtro: hay que poder soltarlo.
    mockEstadoHook = {
      adopciones: [],
      cargando: false,
      cargandoMas: false,
      error: 'Todavía no podemos buscar por texto ni por edad acá.',
      hayMas: false,
    };
    const arbol = await montar();
    expect(arbol.root.findAllByType(Input).length).toBeGreaterThan(0);
    expect(chip(arbol, /^Cachorro$/)).toBeTruthy();
  });

  it('mientras busca, el buscador NO desaparece', async () => {
    // Cada tecleo dispara una búsqueda. Con la pantalla vacía (que es
    // justamente cuando estás buscando otra cosa), el spinner a pantalla
    // completa desmontaba el Input: se perdía el foco y lo escrito quedaba
    // fuera de alcance a mitad de la palabra.
    const arbol = await montar(); // primera carga completada
    mockEstadoHook = {
      adopciones: [],
      cargando: true,
      cargandoMas: false,
      error: null,
      hayMas: false,
    };
    await tocar(arbol, /^Cachorro$/); // re-render con la búsqueda en curso
    expect(arbol.root.findAllByType(Input).length).toBeGreaterThan(0);
  });

  it('la primera carga sí es una pantalla de espera entera', async () => {
    mockEstadoHook = {
      adopciones: [],
      cargando: true,
      cargandoMas: false,
      error: null,
      hayMas: false,
    };
    const arbol = await montar();
    expect(arbol.root.findAllByType(Input).length).toBe(0);
  });

  it('y el mensaje de error se muestra igual', async () => {
    mockEstadoHook = {
      adopciones: [],
      cargando: false,
      cargandoMas: false,
      error: 'Se cayó la red',
      hayMas: false,
    };
    const arbol = await montar();
    const textos = arbol.root
      .findAll((n: any) => typeof n.type === 'string')
      .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
      .join(' | ');
    expect(textos).toContain('Se cayó la red');
  });
});

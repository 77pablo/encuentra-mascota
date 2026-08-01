import React from 'react';
import { act, create } from 'react-test-renderer';
import ReportesLista from '../../src/components/ReportesLista';
import { Button, EmptyState, Title } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// EL VACÍO NO PUEDE ECHARLE LA CULPA AL USUARIO NUEVO.
//
// `hayFiltros()` contaba la comuna y las coordenadas como "filtro", así que a
// alguien que abrió la app en Ñuñoa y todavía no tiene vecinos publicando le
// salía "No encontramos nada así · soltá algún filtro". No soltó ningún filtro
// de más: su barrio todavía no tiene a nadie. Y el vacío no podía ofrecer una
// salida porque `EmptyState` no aceptaba ninguna acción.
//
// Se prueban las dos mitades: que `EmptyState` sepa llevar una acción, y que la
// lista elija el vacío correcto según qué tipo de filtro hay puesto.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

// La lista real pide a la base; acá interesa el VACÍO, así que devuelve vacío.
jest.mock('../../src/hooks/useBusquedaReportes', () => ({
  useBusquedaReportes: () => ({
    reportes: [],
    cargando: false,
    cargandoMas: false,
    error: null,
    hayMas: false,
    recargar: jest.fn(),
    cargarMas: jest.fn(),
  }),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'yo' }, session: {}, loading: false }),
}));
jest.mock('../../src/services/comunasSeguidas', () => ({
  getComunasSeguidas: () => Promise.resolve([]),
  seguirComuna: () => Promise.resolve(),
  dejarDeSeguirComuna: () => Promise.resolve(),
}));
jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

function textoDe(nodo: any): string {
  const hijos = Array.isArray(nodo.props.children) ? nodo.props.children : [nodo.props.children];
  return hijos.filter((c: any) => typeof c === 'string').join('');
}

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

function titulos(arbol: any): string[] {
  return arbol.root.findAllByType(Title).map(textoDe);
}

function botones(arbol: any): any[] {
  return arbol.root.findAllByType(Button);
}

// Los árboles montados, para desmontarlos al terminar cada test: el FlatList
// agenda trabajo que, si el árbol sigue vivo, cae DESPUÉS del test y jest lo
// reporta como "Cannot log after tests are done" ensuciando toda la corrida.
const montados: any[] = [];

async function montarLista(filtros: any, props: any = {}) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <ReportesLista
          filtros={filtros}
          navigation={{ navigate: (...a: any[]) => mockNavigate(...a) }}
          {...props}
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

beforeEach(() => {
  mockNavigate.mockReset();
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('EmptyState sabe llevar una acción', () => {
  it('sin acción se ve igual que siempre', async () => {
    let arbol: any;
    await act(async () => {
      arbol = create(
        <ThemeProvider>
          <EmptyState title="Nada por acá" subtitle="Ojalá siga así." />
        </ThemeProvider>,
      );
    });
    expect(botones(arbol)).toHaveLength(0);
    expect(textos(arbol)).toContain('Nada por acá');
  });

  it('con acción, la acción se renderiza y funciona', async () => {
    const tocado = jest.fn();
    let arbol: any;
    await act(async () => {
      arbol = create(
        <ThemeProvider>
          <EmptyState
            title="Nada por acá"
            action={<Button title="Publicar el primero" onPress={tocado} />}
          />
        </ThemeProvider>,
      );
    });
    const boton = botones(arbol).find((b: any) => b.props.title === 'Publicar el primero');
    expect(boton).toBeTruthy();
    await act(async () => {
      boton.props.onPress();
    });
    expect(tocado).toHaveBeenCalled();
  });
});

describe('el vacío de una comuna sin datos', () => {
  it('no dice que buscaste mal', async () => {
    const arbol = await montarLista({ comuna: 'Ñuñoa' });
    expect(textos(arbol)).not.toContain('No encontramos nada así');
  });

  it('nombra la comuna, para que se entienda qué está vacío', async () => {
    const arbol = await montarLista({ comuna: 'Ñuñoa' });
    expect(titulos(arbol).join(' | ')).toContain('Ñuñoa');
  });

  it('ofrece seguir la comuna (que es lo que hace que le avisen)', async () => {
    const arbol = await montarLista({ comuna: 'Ñuñoa' });
    const seguir = botones(arbol).find((b: any) => /Ñuñoa/.test(b.props.title));
    expect(seguir).toBeTruthy();
  });

  it('no repite el botón de seguir si arriba ya hay uno', async () => {
    // El panel de filtros de Explorar ya muestra "Avisarme de Ñuñoa" cuando hay
    // comuna elegida. Verificado en pantalla: con el panel abierto salía dos
    // veces el mismo botón, uno encima del otro.
    const arbol = await montarLista({ comuna: 'Ñuñoa' }, { ofrecerSeguirComuna: false });
    expect(botones(arbol).filter((b: any) => /Ñuñoa/.test(b.props.title))).toHaveLength(0);
    // Pero el vacío no se queda sin salida.
    expect(botones(arbol).find((b: any) => /publicar/i.test(b.props.title))).toBeTruthy();
  });

  it('ofrece publicar, y publicar lleva a Publicar', async () => {
    const arbol = await montarLista({ comuna: 'Ñuñoa' });
    const publicar = botones(arbol).find((b: any) => /publicar/i.test(b.props.title));
    expect(publicar).toBeTruthy();
    await act(async () => {
      publicar.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Publicar');
  });

  it('si hay cómo ampliar, lo ofrece y lo llama', async () => {
    const ampliar = jest.fn();
    const arbol = await montarLista({ comuna: 'Ñuñoa' }, { onAmpliarBusqueda: ampliar });
    const boton = botones(arbol).find((b: any) => /todo chile/i.test(b.props.title));
    expect(boton).toBeTruthy();
    await act(async () => {
      boton.props.onPress();
    });
    expect(ampliar).toHaveBeenCalled();
  });

  it('sin cómo ampliar, no ofrece un botón que no hace nada', async () => {
    const arbol = await montarLista({ comuna: 'Ñuñoa' });
    expect(botones(arbol).find((b: any) => /todo chile/i.test(b.props.title))).toBeUndefined();
  });
});

describe('el vacío de "cerca de mí" sin datos', () => {
  it('tampoco culpa al usuario', async () => {
    const arbol = await montarLista({ lat: -33.45, lng: -70.66, radioKm: 5 });
    expect(textos(arbol)).not.toContain('No encontramos nada así');
  });

  it('ofrece ampliar la búsqueda cuando se puede', async () => {
    const ampliar = jest.fn();
    const arbol = await montarLista(
      { lat: -33.45, lng: -70.66, radioKm: 5 },
      { onAmpliarBusqueda: ampliar },
    );
    const boton = botones(arbol).find((b: any) => /todo chile/i.test(b.props.title));
    expect(boton).toBeTruthy();
    await act(async () => {
      boton.props.onPress();
    });
    expect(ampliar).toHaveBeenCalled();
  });
});

describe('cuando la culpa SÍ es de los filtros, se dice', () => {
  it('con texto buscado, el vacío sigue siendo "no encontramos nada así"', async () => {
    const arbol = await montarLista({ texto: 'pelusa' });
    expect(textos(arbol)).toContain('No encontramos nada así');
  });

  it('comuna + una especie elegida es un filtro de verdad, no un barrio vacío', async () => {
    const arbol = await montarLista({ comuna: 'Ñuñoa', especie: 'gato' });
    expect(textos(arbol)).toContain('No encontramos nada así');
  });

  it('con recompensa, o con rango de fechas, también', async () => {
    const conRecompensa = await montarLista({ conRecompensa: true });
    expect(textos(conRecompensa)).toContain('No encontramos nada así');
    const conFecha = await montarLista({ desde: new Date('2026-07-01T00:00:00Z') });
    expect(textos(conFecha)).toContain('No encontramos nada así');
  });
});

describe('sin ningún filtro no cambia lo que ya estaba bien', () => {
  it('sigue el texto cálido de siempre', async () => {
    const arbol = await montarLista({});
    expect(textos(arbol)).toContain('Por ahora, nada por acá');
  });
});

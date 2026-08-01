import React from 'react';
import { act, create } from 'react-test-renderer';
import HomeScreen from '../../src/screens/HomeScreen';
import { filtrosDesdeRuta } from '../../src/lib/petFilters';
import { Button, Chip, Title } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// INICIO NO PUEDE PROMETER LO QUE NO ESTÁ CUMPLIENDO.
//
// La sección se titulaba "Cerca de ti" y la consulta que la llena era
// `buscarReportes({}, null, 6)`: sin punto de referencia, o sea todo Chile
// ordenado por fecha. Alguien en Punta Arenas veía reportes de Arica bajo ese
// título. Y como la base todavía está casi vacía, eso es lo que ve el 100% de
// la gente que entra.
//
// Los cuatro chips de arriba eran el mismo tipo de mentira en chico: los cuatro
// navegaban a Explorar SIN parámetros y el activo estaba clavado en el primero.
//
// Estos tests miran el cableado (con qué se llama a la búsqueda, con qué se
// navega), no el texto por el texto: lo único que se exige del texto es que no
// diga "cerca" cuando no hay con qué saberlo.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  // Fuera de un navigator no existe: acá se comporta como el de verdad, que
  // vuelve a correr el callback cuando cambia su identidad.
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, [cb]);
  },
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

const mockPedirUbicacion = jest.fn();
let mockCoords: { lat: number; lng: number } | null = null;
let mockEstadoUbicacion = 'idle';
jest.mock('../../src/hooks/useMyLocation', () => ({
  useMyLocation: () => ({
    coords: mockCoords,
    status: mockEstadoUbicacion,
    request: mockPedirUbicacion,
  }),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
jest.mock('../../src/hooks/useFavorites', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggle: jest.fn() }),
}));
jest.mock('../../src/hooks/useUnread', () => ({
  useUnread: () => ({ count: 0, refresh: jest.fn() }),
}));
jest.mock('../../src/hooks/useZoneAlert', () => ({
  useZoneAlert: () => ({ count: 0, dismiss: jest.fn() }),
}));

const mockBuscarReportes = jest.fn();
jest.mock('../../src/services/busqueda', () => ({
  buscarReportes: (...a: any[]) => mockBuscarReportes(...a),
  contarReportesEnComuna: () => Promise.resolve(0),
}));
jest.mock('../../src/services/pets', () => ({ countReunidas: () => Promise.resolve(0) }));
jest.mock('../../src/services/reunions', () => ({ listFinalesFelices: () => Promise.resolve([]) }));
jest.mock('../../src/services/profile', () => ({ getMyProfile: () => Promise.resolve(null) }));
let mockImpacto: any = null;
jest.mock('../../src/services/impacto', () => ({ getImpacto: () => Promise.resolve(mockImpacto) }));
jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

// Un punto en Punta Arenas: si la consulta lo ignora, lo que vuelve es Chile
// entero por fecha.
const PUNTA_ARENAS = { lat: -53.16, lng: -70.91 };

function textoDe(nodo: any): string {
  const hijos = Array.isArray(nodo.props.children) ? nodo.props.children : [nodo.props.children];
  return hijos.filter((c: any) => typeof c === 'string').join('');
}

/** Los títulos de sección (los `Title`), que son los que hacen la promesa. */
function titulos(arbol: any): string[] {
  return arbol.root.findAllByType(Title).map(textoDe);
}

function chips(arbol: any): any[] {
  return arbol.root.findAllByType(Chip);
}

function botones(arbol: any): any[] {
  return arbol.root.findAllByType(Button);
}

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <HomeScreen navigation={{ navigate: (...a: any[]) => mockNavigate(...a) }} />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 40 && titulos(arbol).length === 0; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  return arbol;
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockPedirUbicacion.mockReset();
  mockBuscarReportes.mockReset().mockResolvedValue({ reportes: [], cursor: null });
  mockCoords = null;
  mockEstadoUbicacion = 'idle';
  mockImpacto = null;
});

/** Todo el texto renderizado de la pantalla, aplanado. */
function todoElTexto(arbol: any): string {
  return JSON.stringify(arbol.toJSON());
}

afterEach(async () => {
  await act(async () => {});
});

// Pablo lo vio en producción: la tarjeta decía "1 mascotas buscando", y peor,
// "1 encontraron familia" — un verbo en plural con un solo sujeto. Las cuatro
// etiquetas estaban escritas fijas en plural.
describe('la tarjeta de impacto concuerda en número', () => {
  it('con 1 usa el singular en las cuatro etiquetas', async () => {
    mockImpacto = { reencuentros: 1, buscando: 1, adopciones: 1, aportes: 1 };
    const t = todoElTexto(await montar());

    expect(t).toContain('mascota buscando');
    expect(t).not.toContain('mascotas buscando');
    expect(t).toContain('encontró familia');
    expect(t).not.toContain('encontraron familia');
    expect(t).toContain('aporte de un vecino');
    // "reencuentro" es prefijo de "reencuentros", asi que se comprueba al reves.
    expect(t).not.toContain('reencuentros');
  });

  it('con 0 usa el PLURAL, que es lo correcto en español', async () => {
    // Mixto a propósito: con TODO en cero la tarjeta no se renderiza (`hasImpacto`
    // exige que algún número sea > 0), así que un caso todo-en-cero no probaría
    // nada. Acá los ceros conviven con números reales.
    mockImpacto = { reencuentros: 0, buscando: 5, adopciones: 0, aportes: 2 };
    const t = todoElTexto(await montar());

    expect(t).toContain('reencuentros'); // "0 reencuentros", no "0 reencuentro"
    expect(t).toContain('encontraron familia');
    expect(t).toContain('mascotas buscando');
    expect(t).toContain('aportes de vecinos');
  });

  it('con todo en cero la tarjeta ni se muestra', async () => {
    mockImpacto = { reencuentros: 0, buscando: 0, adopciones: 0, aportes: 0 };
    expect(todoElTexto(await montar())).not.toContain('Lo que logramos juntos');
  });

  it('con varios usa el plural', async () => {
    mockImpacto = { reencuentros: 12, buscando: 7, adopciones: 3, aportes: 40 };
    const t = todoElTexto(await montar());

    expect(t).toContain('mascotas buscando');
    expect(t).toContain('encontraron familia');
    expect(t).toContain('aportes de vecinos');
  });
});

describe('la sección de reportes de Inicio', () => {
  it('con ubicación, la consulta lleva el punto y pide por cercanía', async () => {
    mockCoords = PUNTA_ARENAS;
    mockEstadoUbicacion = 'granted';
    await montar();

    expect(mockBuscarReportes).toHaveBeenCalled();
    // Inicio hace DOS consultas y no da lo mismo cuál se mire: la primera es la
    // tira de "Cerca de ti", la segunda alimenta el aviso de zona de alerta.
    const [filtros] = mockBuscarReportes.mock.calls[0];
    expect(filtros.lat).toBe(PUNTA_ARENAS.lat);
    expect(filtros.lng).toBe(PUNTA_ARENAS.lng);
    expect(filtros.orden).toBe('cerca');
    // El radio también, porque el texto del vacío promete literalmente "a menos
    // de 25 km tuyo": si alguien lo saca, el texto miente.
    expect(filtros.radioKm).toBe(25);
  });

  it('el aviso de zona NO se alimenta de la consulta por cercanía', async () => {
    // Este es el bug que se cayó entre dos tareas. `ZoneAlertBanner` recibía la
    // misma lista que la tira, y esa lista pasó a estar acotada a 25 km del
    // TELÉFONO y ordenada por distancia. La zona de alerta es un lugar FIJO
    // (la casa) y lo que importa ahí es lo más NUEVO: quien abría la app desde
    // el trabajo dejaba de recibir el aviso de un reporte publicado al lado de
    // su casa, y aun estando cerca, lo recién publicado podía quedar fuera de
    // las 6 filas por estar un poco más lejos.
    mockCoords = PUNTA_ARENAS;
    mockEstadoUbicacion = 'granted';
    await montar();

    expect(mockBuscarReportes.mock.calls.length).toBeGreaterThanOrEqual(2);
    const [filtrosZona] = mockBuscarReportes.mock.calls[1];
    expect(filtrosZona.radioKm).toBeUndefined();
    expect(filtrosZona.lat).toBeUndefined();
    expect(filtrosZona.orden).not.toBe('cerca');
  });

  it('con ubicación sí puede decir "Cerca de ti"', async () => {
    mockCoords = PUNTA_ARENAS;
    mockEstadoUbicacion = 'granted';
    const arbol = await montar();
    expect(titulos(arbol).some((t) => /cerca de ti/i.test(t))).toBe(true);
  });

  it('sin ubicación, ningún título promete cercanía', async () => {
    const arbol = await montar();
    // El bug exacto: título "Cerca de ti" sobre una consulta de todo Chile.
    const prometedores = titulos(arbol).filter((t) => /cerca/i.test(t));
    expect(prometedores).toEqual([]);
  });

  it('sin ubicación, la sección igual tiene título (no queda muda)', async () => {
    const arbol = await montar();
    expect(titulos(arbol).length).toBeGreaterThan(0);
  });

  it('sin ubicación, se ofrece activarla y el botón la pide de verdad', async () => {
    const arbol = await montar();
    const boton = botones(arbol).find((b: any) => /ubicaci/i.test(b.props.title));
    expect(boton).toBeTruthy();

    await act(async () => {
      boton.props.onPress();
    });
    expect(mockPedirUbicacion).toHaveBeenCalled();
  });

  it('con ubicación, ese botón ya no molesta', async () => {
    mockCoords = PUNTA_ARENAS;
    mockEstadoUbicacion = 'granted';
    const arbol = await montar();
    expect(botones(arbol).find((b: any) => /ubicaci/i.test(b.props.title))).toBeUndefined();
  });
});

describe('los chips de Inicio', () => {
  it('ninguno navega pelado: todos llevan un filtro que Explorar entiende', async () => {
    const arbol = await montar();
    const accesos = chips(arbol);
    expect(accesos.length).toBeGreaterThan(0);

    for (const chip of accesos) {
      mockNavigate.mockReset();
      await act(async () => {
        chip.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      const [destino, args] = mockNavigate.mock.calls[0];
      expect(destino).toBe('Explorar');
      // Forma anidada: los parámetros tienen que aterrizar en la PANTALLA
      // Explorar, no en el navigator de la pestaña.
      expect(args?.screen).toBe('Explorar');
      const leido = filtrosDesdeRuta(args?.params);
      expect(`${chip.props.label} → ${leido ? 'con filtro' : 'SIN filtro'}`).toBe(
        `${chip.props.label} → con filtro`,
      );
    }
  });

  it('sin ubicación ninguno aparece activo (nada está filtrado todavía)', async () => {
    const arbol = await montar();
    // El activo estaba clavado en `i === 0`: decía "estás viendo lo cercano"
    // justo cuando la app no sabe dónde estás.
    expect(chips(arbol).filter((c: any) => c.props.active)).toHaveLength(0);
  });

  it('con ubicación, el activo es el que describe lo que se está mostrando', async () => {
    mockCoords = PUNTA_ARENAS;
    mockEstadoUbicacion = 'granted';
    const arbol = await montar();
    const activos = chips(arbol).filter((c: any) => c.props.active);
    expect(activos).toHaveLength(1);
    expect(activos[0].props.label).toMatch(/cerca/i);
  });
});

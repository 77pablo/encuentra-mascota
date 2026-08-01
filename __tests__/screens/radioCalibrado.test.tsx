import React from 'react';
import { act, create } from 'react-test-renderer';
import ExplorarScreen from '../../src/screens/ExplorarScreen';
import ReportesLista from '../../src/components/ReportesLista';
import { Chip } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// EL RADIO POR DEFECTO DE "CERCA DE MÍ" NO PUEDE SER EL MISMO PARA UN GATO QUE
// PARA UN PERRO.
//
// Explorar traía 20 km fijos para todo el mundo. Según el estudio de Queensland
// (n=1.232), un gato aparece a una mediana de 315 m: un reporte de gato a 20 km
// no es tu gato y vos no podés ayudar con él. Un perro, en cambio, camina
// kilómetros — ahí los 20 km están bien y achicárselos sería romper una
// búsqueda que anda.
//
// Lo que se mira acá es el `radioKm` con el que la lista termina pidiéndole a
// la base, no el texto de un chip: es lo único que cambia lo que ve la persona.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

// `react-native-maps` necesita el módulo nativo y revienta al importarse en
// jest. Acá se prueba la vista de LISTA (la de por defecto).
jest.mock('../../src/components/ReportesMapa', () => ({
  __esModule: true,
  default: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

// Con coords de verdad: sin ubicación, `cerca` es false y el radio nunca llega
// a los filtros, así que el test no probaría nada.
const mockPedirUbicacion = jest.fn();
jest.mock('../../src/hooks/useMyLocation', () => ({
  useMyLocation: () => ({
    coords: { lat: -33.45, lng: -70.66 },
    status: 'ready',
    request: mockPedirUbicacion,
  }),
}));

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
jest.mock('../../src/hooks/useUnread', () => ({
  useUnread: () => ({ count: 0, refresh: jest.fn() }),
}));
jest.mock('../../src/services/comunasSeguidas', () => ({
  getComunasSeguidas: () => Promise.resolve([]),
  seguirComuna: () => Promise.resolve(),
  dejarDeSeguirComuna: () => Promise.resolve(),
}));
jest.mock('../../src/services/busquedasGuardadas', () => ({
  listBusquedas: () => Promise.resolve([]),
  guardarBusqueda: () => Promise.resolve(),
  borrarBusqueda: () => Promise.resolve(),
}));
jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

const montados: any[] = [];

async function montar(params?: any) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <ExplorarScreen
          navigation={{ navigate: (...a: any[]) => mockNavigate(...a) }}
          route={{ params }}
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

function filtrosDeLaLista(arbol: any): any {
  return arbol.root.findByType(ReportesLista).props.filtros;
}

/** Toca el chip cuya etiqueta es exactamente `label`. */
async function tocarChip(arbol: any, label: string) {
  const chips = arbol.root.findAllByType(Chip).filter((c: any) => c.props.label === label);
  expect(chips).toHaveLength(1);
  await act(async () => {
    chips[0].props.onPress();
  });
  await act(async () => {});
}

function etiquetasDeChips(arbol: any): string[] {
  return arbol.root.findAllByType(Chip).map((c: any) => c.props.label);
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockPedirUbicacion.mockReset();
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('el radio por defecto de "cerca de mí" se calibra por especie', () => {
  it('con el filtro en GATO, el radio arranca más chico que 20 km', async () => {
    const arbol = await montar({ cerca: true, especie: 'gato' });
    const f = filtrosDeLaLista(arbol);
    expect(f.especie).toBe('gato');
    expect(f.radioKm).toBeLessThan(20);
    expect(f.radioKm).toBeGreaterThan(0);
  });

  it('con el filtro en PERRO, el radio NO cambia: siguen siendo 20 km', async () => {
    const arbol = await montar({ cerca: true, especie: 'perro' });
    expect(filtrosDeLaLista(arbol).radioKm).toBe(20);
  });

  it('sin filtro de especie tampoco cambia nada', async () => {
    // En la lista hay gatos, perros y todo lo demás mezclado: no hay nada que
    // calibrar y achicar acá sería vaciar la pantalla de entrada.
    const arbol = await montar({ cerca: true });
    expect(filtrosDeLaLista(arbol).radioKm).toBe(20);
  });

  it('ofrece un radio caminable para poder achicar todavía más', async () => {
    // Sin un botón por debajo de 5 km, el dueño de un gato de interior no tiene
    // forma de pedir la manzana de al lado.
    const arbol = await montar({ cerca: true, especie: 'gato' });
    expect(etiquetasDeChips(arbol)).toContain('1 km');
  });
});

describe('lo que la persona eligió a mano manda', () => {
  it('cambiar de especie NO pisa el radio que ya se tocó', async () => {
    // Sugerir está bien; imponer no. Si alguien puso 50 km a propósito y después
    // filtra por gato, dejarle la búsqueda en 5 km es sacarle de la pantalla lo
    // que estaba mirando.
    const arbol = await montar({ cerca: true, especie: 'perro' });
    await tocarChip(arbol, '50 km');
    expect(filtrosDeLaLista(arbol).radioKm).toBe(50);
    await tocarChip(arbol, 'Gato');
    expect(filtrosDeLaLista(arbol).especie).toBe('gato');
    expect(filtrosDeLaLista(arbol).radioKm).toBe(50);
  });

  it('"Todo Chile" sigue siendo una opción y tampoco se pisa', async () => {
    const arbol = await montar({ cerca: true, especie: 'perro' });
    await tocarChip(arbol, 'Todo Chile');
    expect(filtrosDeLaLista(arbol).radioKm).toBeNull();
    await tocarChip(arbol, 'Gato');
    expect(filtrosDeLaLista(arbol).radioKm).toBeNull();
  });
});

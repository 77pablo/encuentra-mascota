import React from 'react';
import { act, create } from 'react-test-renderer';
import ExplorarScreen from '../../src/screens/ExplorarScreen';
import ReportesLista from '../../src/components/ReportesLista';
import { Chip } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LA OTRA MITAD DE LOS ACCESOS DE INICIO: QUE EXPLORAR LOS APLIQUE.
//
// De poco sirve que los chips de Inicio viajen con un filtro si al llegar nadie
// lo lee. Acá se mira el resultado que importa: con qué `filtros` termina la
// lista, que es exactamente lo que se le pide a la base.
//
// El caso "sin parámetros" no sobra: es el que impide que este cableado se
// convierta en un reseteador que pise los filtros que la persona eligió a mano.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

// El mapa arrastra `react-native-maps`, que necesita el módulo nativo
// 'RNMapsAirModule' y revienta al importarse en jest. Acá se prueba la vista de
// LISTA (la que está por defecto), así que el mapa no aporta nada.
jest.mock('../../src/components/ReportesMapa', () => ({
  __esModule: true,
  default: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

const mockPedirUbicacion = jest.fn();
jest.mock('../../src/hooks/useMyLocation', () => ({
  useMyLocation: () => ({ coords: null, status: 'idle', request: mockPedirUbicacion }),
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

// Los árboles montados, para desmontarlos al terminar cada test: el FlatList de
// la lista agenda trabajo que, si el árbol sigue vivo, cae DESPUÉS del test y
// jest lo reporta como "Cannot log after tests are done".
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

/** Los filtros con los que la lista termina pidiéndole a la base. */
function filtrosDeLaLista(arbol: any): any {
  return arbol.root.findByType(ReportesLista).props.filtros;
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

describe('Explorar aplica los filtros con los que se llega', () => {
  it('«Perros» llega como especie perro', async () => {
    const arbol = await montar({ especie: 'perro' });
    expect(filtrosDeLaLista(arbol).especie).toBe('perro');
  });

  it('«Gatos» llega como especie gato', async () => {
    const arbol = await montar({ especie: 'gato' });
    expect(filtrosDeLaLista(arbol).especie).toBe('gato');
  });

  it('«Perdidos» llega como estado perdida', async () => {
    const arbol = await montar({ estado: 'perdida' });
    expect(filtrosDeLaLista(arbol).estado).toBe('perdida');
  });

  it('la tarjeta "En tu comuna" llega como comuna', async () => {
    const arbol = await montar({ comuna: 'Ñuñoa' });
    expect(filtrosDeLaLista(arbol).comuna).toBe('Ñuñoa');
  });

  it('«Cerca de ti» pide la ubicación (sin ella no hay cercanía posible)', async () => {
    await montar({ cerca: true });
    expect(mockPedirUbicacion).toHaveBeenCalled();
  });

  it('el filtro aplicado queda a la vista para poder soltarlo', async () => {
    // Los filtros arrancan plegados: uno que se aplicó solo y no se ve es tan
    // confuso como uno que no se aplicó.
    const arbol = await montar({ comuna: 'Ñuñoa' });
    expect(etiquetasDeChips(arbol).join(' | ')).toContain('Ñuñoa');
  });
});

describe('sin parámetros no se pisa nada', () => {
  it('entrar por la pestaña deja los filtros en neutro', async () => {
    const arbol = await montar(undefined);
    const f = filtrosDeLaLista(arbol);
    expect(f.especie).toBeNull();
    expect(f.estado).toBeNull();
    expect(f.comuna).toBeNull();
    expect(mockPedirUbicacion).not.toHaveBeenCalled();
  });

  it('un parámetro ajeno (p. ej. un id) tampoco resetea nada', async () => {
    const arbol = await montar({ id: 'p-123' });
    const f = filtrosDeLaLista(arbol);
    expect(f.especie).toBeNull();
    expect(f.estado).toBeNull();
    expect(f.comuna).toBeNull();
  });
});

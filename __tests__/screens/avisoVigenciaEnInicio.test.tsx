import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import HomeScreen from '../../src/screens/HomeScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { DIAS_SEGUNDO_NUDGE, DIAS_VENCIMIENTO } from '../../src/lib/cicloVida';

// QUE EL DUEÑO SE ENTERE SIN ABRIR LA FICHA.
//
// El nudge de vigencia solo se pinta dentro del propio reporte. El que lleva 40
// días buscando ya no entra todos los días a su ficha, y a los 45 el reporte
// sale de las búsquedas y del motor de coincidencias sin que nadie le diga
// nada. Este test monta INICIO —la pantalla donde la persona sí está— y
// comprueba que el aviso aparece ahí y lleva a donde se reactiva.

const DIA = 24 * 60 * 60 * 1000;
const haceDias = (d: number) => new Date(Date.now() - d * DIA).toISOString();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (_props: any) => null,
  MaterialCommunityIcons: (_props: any) => null,
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: any) => React.useEffect(() => cb(), [cb]),
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  };
});

jest.mock('../../src/hooks/useAuth', () => {
  const estado = { user: { id: 'yo', email: 'yo@x.cl' }, session: {}, loading: false };
  return { useAuth: () => estado };
});
jest.mock('../../src/hooks/useMyLocation', () => {
  const estado = { coords: null, loading: false, error: null };
  return { useMyLocation: () => estado };
});
jest.mock('../../src/hooks/useFavorites', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggle: jest.fn() }),
}));

const mockListMyReports = jest.fn();
jest.mock('../../src/services/pets', () => ({
  countReunidas: jest.fn(() => Promise.resolve(0)),
  listMyReports: (...a: any[]) => mockListMyReports(...a),
}));
jest.mock('../../src/services/busqueda', () => ({
  buscarReportes: jest.fn(() => Promise.resolve({ reportes: [], siguiente: null })),
  contarReportesEnComuna: jest.fn(() => Promise.resolve(0)),
}));
jest.mock('../../src/services/reunions', () => ({
  listFinalesFelices: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../src/services/profile', () => ({
  getMyProfile: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../src/services/impacto', () => ({
  getImpacto: jest.fn(() => Promise.resolve(null)),
}));

// Piezas de Inicio que no tienen nada que ver con lo que se prueba acá.
jest.mock('../../src/components/ZoneAlertBanner', () => ({ ZoneAlertBanner: () => null }));
jest.mock('../../src/components/RecordatoriosBanner', () => ({ RecordatoriosBanner: () => null }));
jest.mock('../../src/components/InstalarAppCard', () => ({ InstalarAppCard: () => null }));
jest.mock('../../src/components/MensajesButton', () => ({ __esModule: true, default: () => null }));

function reporte(dias: number, over: Record<string, any> = {}) {
  return {
    id: `r-${dias}`,
    user_id: 'yo',
    estado: 'perdida',
    especie: 'perro',
    nombre: 'Rocco',
    raza: null,
    descripcion: 'x',
    fotos: [],
    lat: -33.4,
    lng: -70.6,
    recompensa: null,
    creado_en: haceDias(dias),
    renovado_en: haceDias(dias),
    activo: true,
    reunida_en: null,
    ...over,
  };
}

const navigation = { navigate: jest.fn(), push: jest.fn() };

function textoDe(nodo: any): string {
  return nodo
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

async function montarInicio() {
  let tree: any;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <HomeScreen navigation={navigation} />
      </ThemeProvider>,
    );
  });
  return tree;
}

beforeEach(() => {
  mockListMyReports.mockReset();
  navigation.navigate.mockReset();
});

describe('Inicio — aviso de vigencia sin abrir la ficha', () => {
  it('un reporte propio recién publicado no ensucia Inicio', async () => {
    mockListMyReports.mockResolvedValue([reporte(1)]);
    const tree = await montarInicio();
    expect(textoDe(tree.root)).not.toMatch(/vencer|en pausa|de búsqueda/i);
    await act(async () => tree.unmount());
  }, 60000);

  it('a partir del segundo umbral el aviso se ve en Inicio y lleva al Perfil', async () => {
    mockListMyReports.mockResolvedValue([reporte(DIAS_SEGUNDO_NUDGE + 1)]);
    const tree = await montarInicio();

    // Se pidieron los reportes ACTIVOS del usuario, no otra cosa.
    expect(mockListMyReports).toHaveBeenCalledWith('yo', true);

    const texto = textoDe(tree.root);
    expect(texto).toContain('Rocco');
    expect(texto).toMatch(/de búsqueda/);
    expect(texto).toMatch(/sale de las búsquedas/);

    // Y toca a donde se reactiva.
    const banner = tree.root
      .findAllByType(TouchableOpacity)
      .find((n: any) => /le quedan|le queda|en pausa/i.test(String(n.props.accessibilityLabel ?? '')));
    expect(banner).toBeTruthy();
    await act(async () => {
      banner.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('Perfil');

    await act(async () => tree.unmount());
  }, 60000);

  it('ya vencido, Inicio dice que el reporte está apagado', async () => {
    mockListMyReports.mockResolvedValue([reporte(DIAS_VENCIMIENTO + 2)]);
    const tree = await montarInicio();
    const texto = textoDe(tree.root);
    expect(texto).toContain('en pausa');
    expect(texto).toMatch(/salió de las búsquedas/);
    await act(async () => tree.unmount());
  }, 60000);

  it('si no se pueden leer los reportes, Inicio no se rompe ni inventa un aviso', async () => {
    mockListMyReports.mockRejectedValue({ message: 'Failed to fetch' });
    const tree = await montarInicio();
    expect(textoDe(tree.root)).not.toMatch(/vencer|en pausa/i);
    await act(async () => tree.unmount());
  }, 60000);
});

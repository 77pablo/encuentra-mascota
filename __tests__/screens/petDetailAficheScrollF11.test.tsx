import React from 'react';
import { ScrollView } from 'react-native';
import { act, create } from 'react-test-renderer';

// F11 (revisión adversarial final): la entrada por "Plan de búsqueda" deja el
// segundo toque (Descargar afiche, dentro de AficheOpciones) fuera de
// pantalla: el plan está arriba de la ficha y la hoja se monta cientos de px
// más abajo, sin scroll-to. Este test cubre el arreglo — un ref al
// ScrollView + el `onLayout` de la propia hoja — sin depender de que
// react-test-renderer dispare `onLayout` solo (no lo hace: no hay layout
// engine real), así que se invoca el handler a mano con un `nativeEvent`
// simulado, tal como lo llamaría React Native de verdad.

jest.setTimeout(30000);

const mem: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => {
    mem[k] = v;
  },
  removeItem: (k: string) => {
    delete mem[k];
  },
};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => (k in mem ? mem[k] : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mem[k] = v;
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('../../src/ui/Confetti', () => ({ Confetti: () => null }));
jest.mock('../../src/components/PlatformMap', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = (props: any) => React.createElement(View, null, props.children);
  return { __esModule: true, default: MapView, Marker: () => null };
});
jest.mock('../../src/components/AficheGenerator', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/TarjetaGenerador', () => ({ __esModule: true, default: () => null }));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));
jest.mock('../../src/lib/share', () => ({ shareReport: jest.fn() }));
jest.mock('../../src/lib/pickImage', () => ({ pickFromLibrary: jest.fn(), takePhoto: jest.fn() }));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-dueno' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({ useRequireAuth: () => () => true }));

const mockGetPet = jest.fn();
jest.mock('../../src/services/pets', () => ({
  getPet: (...args: any[]) => mockGetPet(...args),
  archivarReporte: jest.fn(),
  renovarReporte: jest.fn(),
}));
jest.mock('../../src/services/busqueda', () => ({ buscarCoincidencias: () => Promise.resolve([]) }));
jest.mock('../../src/services/reunions', () => ({ markReunited: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/services/moderation', () => ({
  MOTIVOS_DENUNCIA: ['Spam'],
  denunciarPista: jest.fn(),
  denunciarAvistamiento: jest.fn(),
  denunciarReporte: jest.fn(),
}));
jest.mock('../../src/services/petUpdates', () => ({
  listUpdates: () => Promise.resolve([]),
  addUpdate: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({ uploadPetPhoto: jest.fn() }));
jest.mock('../../src/services/profile', () => ({
  getMyProfile: jest.fn(() => Promise.resolve({ id: 'u-dueno', telefono: '+56911111111' })),
  getNombrePublico: () => Promise.resolve('Dueño'),
  getAutorPublico: jest.fn(() => Promise.resolve({ nombre: 'Dueño', institucion: null })),
}));
jest.mock('../../src/services/sightings', () => ({ listSightings: () => Promise.resolve([]) }));
jest.mock('../../src/services/tips', () => ({
  listarTips: () => Promise.resolve([]),
  crearTip: jest.fn(),
  borrarTip: jest.fn(),
}));

import AficheOpciones from '../../src/components/AficheOpciones';
import PetDetailScreen from '../../src/screens/PetDetailScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

const PERDIDA_PROPIA = {
  id: 'pet-1',
  user_id: 'u-dueno',
  estado: 'perdida',
  especie: 'perro',
  raza: null,
  nombre: 'Cholo',
  descripcion: 'Perro café',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  activo: true,
  oculto: false,
  creado_en: new Date(Date.now() - 3600 * 1000).toISOString(),
  reunida_en: null,
  final_feliz: null,
  final_foto: null,
};

function botonPorTitulo(arbol: any, titulo: string): any {
  return arbol.root.findAll(
    (n: any) => n.props && n.props.title === titulo && typeof n.props.onPress === 'function',
  )[0];
}

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

const route = { params: { id: 'pet-1' } };
const navigation = { navigate: jest.fn(), push: jest.fn(), addListener: () => () => {} };

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
  mockGetPet.mockReset().mockResolvedValue(PERDIDA_PROPIA);
});

afterEach(async () => {
  await act(async () => {});
});

it('al abrirse la hoja de opciones del afiche, scrollea el ScrollView hasta su posición', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PetDetailScreen route={route} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 40 && !textos(arbol).includes('Crear afiche'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }

  await act(async () => {
    botonPorTitulo(arbol, 'Crear afiche').props.onPress();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

  // La hoja está montada.
  const opciones = arbol.root.findByType(AficheOpciones);
  expect(opciones).toBeTruthy();

  // Sin layout engine real, react-test-renderer no dispara `onLayout` solo:
  // se invoca a mano el handler del wrapper directo de la hoja, tal como lo
  // llamaría React Native con la posición medida de verdad.
  const wrapper = opciones.parent;
  expect(typeof wrapper.props.onLayout).toBe('function');
  await act(async () => {
    wrapper.props.onLayout({ nativeEvent: { layout: { x: 0, y: 842, width: 300, height: 260 } } });
  });

  expect(scrollTo).toHaveBeenCalledWith({ y: 842, animated: true });
  scrollTo.mockRestore();
});

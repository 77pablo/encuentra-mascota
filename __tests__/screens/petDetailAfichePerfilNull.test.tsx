import React from 'react';
import { act, create } from 'react-test-renderer';

// F9 (revisión adversarial final): la hoja de opciones del afiche promete
// generar igual sin WhatsApp cargado (afiche solo con QR), pero
// PetDetailScreen exigía `perfil` truthy para montar el generador. Con
// `getMyProfile()` devolviendo null (falla de red, RPC vieja en la ventana de
// despliegue), la hoja decía "Generando…" y el spinner quedaba eterno: el
// generador nunca se montaba, así que `onDone` nunca llegaba.

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

// EL CORAZÓN DEL TEST: un espía que registra si (y con qué `profile`) se
// montó, en vez de mockearlo a `() => null` como hacen otras suites de esta
// pantalla — acá lo que importa es justamente SI se monta.
const montajesAficheGenerator: Array<{ profile: unknown }> = [];
jest.mock('../../src/components/AficheGenerator', () => ({
  __esModule: true,
  default: (props: any) => {
    montajesAficheGenerator.push({ profile: props.profile });
    return null;
  },
}));
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
// `getMyProfile` resuelve null A PROPÓSITO: es exactamente el escenario de F9.
jest.mock('../../src/services/profile', () => ({
  getMyProfile: jest.fn(() => Promise.resolve(null)),
  getNombrePublico: () => Promise.resolve('Dueño'),
  getAutorPublico: jest.fn(() => Promise.resolve({ nombre: 'Dueño', institucion: null })),
}));
jest.mock('../../src/services/sightings', () => ({ listSightings: () => Promise.resolve([]) }));
jest.mock('../../src/services/tips', () => ({
  listarTips: () => Promise.resolve([]),
  crearTip: jest.fn(),
  borrarTip: jest.fn(),
}));

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
  montajesAficheGenerator.length = 0;
});

afterEach(async () => {
  await act(async () => {});
});

it('con getMyProfile() devolviendo null, el generador se monta igual (afiche solo con QR)', async () => {
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

  // 1er toque: "Crear afiche" carga el perfil (null) y abre la hoja de opciones.
  await act(async () => {
    botonPorTitulo(arbol, 'Crear afiche').props.onPress();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  expect(textos(arbol)).toContain('solo con el QR');

  // 2do toque: "Descargar afiche" dispara la generación.
  await act(async () => {
    botonPorTitulo(arbol, 'Descargar afiche').props.onPress();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

  // El punto del bug: ANTES, el generador nunca se montaba sin perfil.
  expect(montajesAficheGenerator.length).toBeGreaterThan(0);
  expect(montajesAficheGenerator[montajesAficheGenerator.length - 1].profile).toBeNull();
});

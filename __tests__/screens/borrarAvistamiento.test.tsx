import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PetDetailScreen from '../../src/screens/PetDetailScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// UNA PISTA FALSA EN MI PROPIO REPORTE.
//
// `deleteSighting` existía en el servicio y la RLS de la 0007 ya se lo permitía
// al dueño del reporte desde el principio… pero no la llamaba NADIE. Lo único
// que el dueño podía hacer con un avistamiento falso en SU reporte era
// denunciarlo y esperar a que una persona lo mirara a mano.

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (_props: any) => null,
  MaterialCommunityIcons: (_props: any) => null,
}));

jest.mock('../../src/components/PlatformMap', () => ({
  __esModule: true,
  default: ({ children }: any) => children ?? null,
  Marker: (_props: any) => null,
}));
jest.mock('../../src/components/AficheGenerator', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/TarjetaGenerador', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/PetCard', () => ({ __esModule: true, default: () => null }));

// Quién está mirando la ficha. Cada caso lo pisa antes de montar.
let mockUsuarioActual = 'la-dueña';
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: mockUsuarioActual }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({ useRequireAuth: () => () => true }));

const PET = {
  id: 'pet-1',
  user_id: 'la-dueña',
  estado: 'perdida',
  especie: 'perro',
  nombre: 'Rocco',
  raza: null,
  descripcion: 'Marrón, collar rojo.',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  creado_en: '2026-07-25T10:00:00Z',
  renovado_en: '2026-07-25T10:00:00Z',
  activo: true,
  reunida_en: null,
};

const AVISTAMIENTO_AJENO = {
  id: 'av-falso',
  pet_id: 'pet-1',
  user_id: 'un-vecino',
  lat: -33.41,
  lng: -70.61,
  nota: 'Lo vi en la playa de Arica',
  foto: null,
  creado_en: '2026-07-28T10:00:00Z',
};

const mockDeleteSighting = jest.fn();
const mockListSightings = jest.fn();
jest.mock('../../src/services/sightings', () => ({
  listSightings: (...a: any[]) => mockListSightings(...a),
  deleteSighting: (...a: any[]) => mockDeleteSighting(...a),
}));

jest.mock('../../src/services/pets', () => ({
  getPet: jest.fn(() => Promise.resolve(PET)),
  archivarReporte: jest.fn(() => Promise.resolve()),
  renovarReporte: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/busqueda', () => ({
  buscarCoincidencias: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../src/services/reunions', () => ({ markReunited: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/services/petUpdates', () => ({
  listUpdates: jest.fn(() => Promise.resolve([])),
  addUpdate: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/tips', () => ({
  listarTips: jest.fn(() => Promise.resolve([])),
  crearTip: jest.fn(() => Promise.resolve()),
  borrarTip: jest.fn(() => Promise.resolve()),
}));
// La cuadrilla (0048) se lee en una consulta aparte desde la ficha. Se mockea
// para que este test no salga a la red: su fallo es silencioso y no cambia nada
// de lo que se prueba acá, pero una llamada real lo haría lento y frágil.
jest.mock('../../src/services/cuadrilla', () => ({
  estadoDeCuadrilla: jest.fn(() => Promise.resolve({ tipo: 'no-disponible' })),
}));
// El tablero de difusión (A4, migración 0063) vive en esta misma ficha. Esta
// suite prueba borrar un avistamiento falso, no el tablero: se lo degrada a
// "no disponible" para que la ficha quede EXACTAMENTE como antes y el test no
// salga a la red (mismo mock que petDetailCuadrilla.test.tsx).
jest.mock('../../src/services/difusion', () => ({
  listarDestinos: jest.fn(() => Promise.resolve({ tipo: 'no-disponible' })),
  lugaresCerca: jest.fn(() => Promise.resolve([])),
  agregarPersona: jest.fn(),
  agregarLugar: jest.fn(),
  marcarAvisado: jest.fn(),
  borrarDestino: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({ uploadPetPhoto: jest.fn() }));
jest.mock('../../src/services/profile', () => ({
  getMyProfile: jest.fn(() => Promise.resolve(null)),
  getNombrePublico: jest.fn(() => Promise.resolve('Ana')),
  // [0057] La ficha pasó a leer al autor con `getAutorPublico`, que trae el
  // nombre Y la institución verificada en una sola consulta. Sin esta clave
  // el mock devuelve undefined y la pantalla revienta al montarse.
  getAutorPublico: jest.fn(() => Promise.resolve({ nombre: 'Ana', institucion: null })),
}));
jest.mock('../../src/services/moderation', () => ({
  ...jest.requireActual('../../src/services/moderation'),
  denunciarReporte: jest.fn(() => Promise.resolve()),
  denunciarPista: jest.fn(() => Promise.resolve()),
  denunciarAvistamiento: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/lib/pickImage', () => ({
  pickFromLibrary: jest.fn(() => Promise.resolve([])),
  takePhoto: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../src/lib/share', () => ({ shareReport: jest.fn() }));

const mockNotify = jest.fn();
const mockConfirmAction = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: (...a: any[]) => mockConfirmAction(...a),
}));

const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

function textoDe(nodo: any): string {
  return nodo
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

function botonBorrarAvistamiento(tree: any) {
  return tree.root
    .findAllByType(TouchableOpacity)
    .find((n: any) => n.props.accessibilityLabel === 'Borrar este avistamiento');
}

async function montar() {
  let tree: any;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <PetDetailScreen route={{ params: { id: 'pet-1' } }} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  return tree;
}

beforeEach(() => {
  mockUsuarioActual = 'la-dueña';
  mockListSightings.mockReset().mockResolvedValue([AVISTAMIENTO_AJENO]);
  mockDeleteSighting.mockReset().mockResolvedValue(undefined);
  mockNotify.mockReset();
  mockConfirmAction.mockReset().mockResolvedValue(true);
  navigation.navigate.mockReset();
});

describe('PetDetail — borrar un avistamiento del propio reporte', () => {
  it('la dueña puede borrar una pista falsa y desaparece del rastro', async () => {
    const tree = await montar();
    expect(textoDe(tree.root)).toContain('Lo vi en la playa de Arica');

    const borrar = botonBorrarAvistamiento(tree);
    expect(borrar).toBeTruthy();

    await act(async () => {
      borrar.props.onPress();
    });

    // Con confirmación: el rastro es parte de la historia del caso.
    expect(mockConfirmAction).toHaveBeenCalledTimes(1);
    expect(mockDeleteSighting).toHaveBeenCalledWith('av-falso');
    expect(textoDe(tree.root)).not.toContain('Lo vi en la playa de Arica');

    await act(async () => tree.unmount());
  }, 60000);

  it('si se arrepiente en la confirmación, no se borra nada', async () => {
    mockConfirmAction.mockResolvedValue(false);
    const tree = await montar();

    await act(async () => {
      botonBorrarAvistamiento(tree).props.onPress();
    });

    expect(mockDeleteSighting).not.toHaveBeenCalled();
    expect(textoDe(tree.root)).toContain('Lo vi en la playa de Arica');

    await act(async () => tree.unmount());
  }, 60000);

  it('un vecino cualquiera NO puede borrar avistamientos ajenos', async () => {
    mockUsuarioActual = 'otro-vecino-mas';
    const tree = await montar();

    expect(textoDe(tree.root)).toContain('Lo vi en la playa de Arica');
    expect(botonBorrarAvistamiento(tree)).toBeUndefined();

    await act(async () => tree.unmount());
  }, 60000);

  it('quien dejó el avistamiento sí puede borrar el suyo', async () => {
    mockUsuarioActual = 'un-vecino';
    const tree = await montar();

    expect(botonBorrarAvistamiento(tree)).toBeTruthy();

    await act(async () => tree.unmount());
  }, 60000);

  it('si el borrado falla, se avisa y el avistamiento sigue ahí', async () => {
    mockDeleteSighting.mockRejectedValue({ message: 'Failed to fetch' });
    const tree = await montar();

    await act(async () => {
      botonBorrarAvistamiento(tree).props.onPress();
    });

    expect(mockNotify).toHaveBeenCalledWith('No se pudo borrar', expect.stringMatching(/internet/i));
    expect(textoDe(tree.root)).toContain('Lo vi en la playa de Arica');

    await act(async () => tree.unmount());
  }, 60000);
});

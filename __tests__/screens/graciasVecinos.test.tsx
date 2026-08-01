import React from 'react';
import { act, create } from 'react-test-renderer';
import { GraciasVecinos } from '../../src/components/GraciasVecinos';
import PetDetailScreen from '../../src/screens/PetDetailScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// B5.1 — CERRAR EL CÍRCULO: AGRADECER A QUIEN AYUDÓ.
//
// Después de marcar el reencuentro, lo único que pasaba era que se ofrecía la
// tarjeta compartible. Quien dejó una pista o marcó un avistamiento en ese
// reporte ayudó de verdad y no quedaba ni una línea que lo dijera: la historia
// terminaba bien y el barrio no se enteraba de su parte.
//
// El gesto es en pantalla y con datos que la ficha YA tiene cargados (las
// pistas y los avistamientos): no hace falta ninguna columna ni tabla nueva.

jest.setTimeout(30000);

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

const PET_REUNIDA = {
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
  activo: false,
  oculto: false,
  creado_en: '2026-07-01T10:00:00Z',
  reunida_en: '2026-07-28T10:00:00Z',
  final_feliz: null,
  final_foto: null,
};

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
  getMyProfile: () => Promise.resolve(null),
  getNombrePublico: () => Promise.resolve('Dueño'),
}));

const mockListSightings = jest.fn();
jest.mock('../../src/services/sightings', () => ({
  listSightings: (...args: any[]) => mockListSightings(...args),
}));

const mockListarTips = jest.fn();
jest.mock('../../src/services/tips', () => ({
  listarTips: (...args: any[]) => mockListarTips(...args),
  crearTip: jest.fn(),
  borrarTip: jest.fn(),
}));

const PISTA_DE_ANA = {
  id: 't1',
  petId: 'pet-1',
  userId: 'u-ana',
  texto: 'La vi cruzando la plaza',
  creadoEn: '2026-07-10T10:00:00Z',
  autorNombre: 'Ana',
  autorEliminadoEn: null,
};

const AVISTAMIENTO_DE_BETO = {
  id: 's1',
  pet_id: 'pet-1',
  user_id: 'u-beto',
  lat: -33.41,
  lng: -70.61,
  nota: 'Estaba por acá',
  foto: null,
  creado_en: '2026-07-11T10:00:00Z',
};

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

async function montarComponente(props: any) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <GraciasVecinos {...props} />
      </ThemeProvider>,
    );
  });
  return arbol;
}

describe('el bloque de agradecimiento', () => {
  it('nombra a quien dejó una pista firmada', async () => {
    const arbol = await montarComponente({
      pistas: [PISTA_DE_ANA],
      avistamientos: [],
      duenoId: 'u-dueno',
    });
    expect(textos(arbol)).toContain('Gracias a Ana por ayudar a que volviera a casa.');
  });

  it('cuenta a quien solo marcó un avistamiento, sin inventarle nombre', async () => {
    const arbol = await montarComponente({
      pistas: [],
      avistamientos: [AVISTAMIENTO_DE_BETO],
      duenoId: 'u-dueno',
    });
    expect(textos(arbol)).toContain('Gracias al vecino que ayudó a que volviera a casa.');
  });

  it('si no ayudó nadie, no dibuja un bloque vacío', async () => {
    const arbol = await montarComponente({ pistas: [], avistamientos: [], duenoId: 'u-dueno' });
    expect(arbol.toJSON()).toBeNull();
  });

  it('el dueño hablando solo en su propio reporte no genera un agradecimiento', async () => {
    const arbol = await montarComponente({
      pistas: [{ ...PISTA_DE_ANA, userId: 'u-dueno', autorNombre: 'Yo mismo' }],
      avistamientos: [],
      duenoId: 'u-dueno',
    });
    expect(arbol.toJSON()).toBeNull();
  });
});

// ─── y que de verdad esté en la ficha del reporte ───────────────────────────

const route = { params: { id: 'pet-1' } };
const navigation = { navigate: jest.fn(), push: jest.fn(), addListener: () => () => {} };

async function montarFicha() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PetDetailScreen route={route} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 40 && !textos(arbol).includes('Historia'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(textos(arbol)).toContain('Historia');
  return arbol;
}

beforeEach(() => {
  mockGetPet.mockReset().mockResolvedValue(PET_REUNIDA);
  mockListSightings.mockReset().mockResolvedValue([]);
  mockListarTips.mockReset().mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => {});
});

describe('en la ficha de un reporte con final feliz', () => {
  it('el agradecimiento aparece junto al final feliz', async () => {
    mockListarTips.mockResolvedValue([PISTA_DE_ANA]);
    mockListSightings.mockResolvedValue([AVISTAMIENTO_DE_BETO]);
    const arbol = await montarFicha();

    const t = textos(arbol);
    expect(t).toContain('FINAL FELIZ');
    expect(t).toContain('Gracias a Ana y 1 vecino más por ayudar a que volviera a casa.');
  });

  it('sin nadie que haya ayudado, no se agradece al aire', async () => {
    const arbol = await montarFicha();
    expect(textos(arbol)).not.toContain('por ayudar a que volviera a casa');
  });

  it('en un reporte que sigue abierto todavía no se agradece nada', async () => {
    mockGetPet.mockResolvedValue({ ...PET_REUNIDA, activo: true, reunida_en: null });
    mockListarTips.mockResolvedValue([PISTA_DE_ANA]);
    const arbol = await montarFicha();

    expect(textos(arbol)).not.toContain('Gracias a Ana');
  });
});

import React from 'react';
import { act, create } from 'react-test-renderer';

// DÓNDE APARECE EL PLAN DE BÚSQUEDA.
//
// Sirve para quien está buscando: el dueño de un reporte de mascota PERDIDA que
// todavía no volvió. En el reporte de otra persona no corresponde (no es quien
// busca), en uno de mascota ENCONTRADA tampoco (ahí el que busca es el dueño,
// que no publicó eso), y después de un final feliz sería cruel.

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
  getMyProfile: () => Promise.resolve(null),
  getNombrePublico: () => Promise.resolve('Dueño'),
  // [0057] La ficha pasó a leer al autor con `getAutorPublico`, que trae el
  // nombre Y la institución verificada en una sola consulta. Sin esta clave
  // el mock devuelve undefined y la pantalla revienta al montarse.
  getAutorPublico: jest.fn(() => Promise.resolve({ nombre: 'Dueño', institucion: null })),
}));
jest.mock('../../src/services/sightings', () => ({ listSightings: () => Promise.resolve([]) }));
jest.mock('../../src/services/tips', () => ({
  listarTips: () => Promise.resolve([]),
  crearTip: jest.fn(),
  borrarTip: jest.fn(),
}));
// El tablero de difusión (A4, migración 0063) necesita responder "listo" (no
// "no disponible") para que el guardián de orden de más abajo pueda comprobar
// DÓNDE queda, en vez de comprobar que quedó ausente.
jest.mock('../../src/services/difusion', () => ({
  listarDestinos: jest.fn(() => Promise.resolve({ tipo: 'listo', destinos: [] })),
  lugaresCerca: jest.fn(() => Promise.resolve([])),
  agregarPersona: jest.fn(),
  agregarLugar: jest.fn(),
  marcarAvisado: jest.fn(),
  borrarDestino: jest.fn(),
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

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

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
  for (const k of Object.keys(mem)) delete mem[k];
  mockGetPet.mockReset().mockResolvedValue(PERDIDA_PROPIA);
});

afterEach(async () => {
  await act(async () => {});
});

describe('el plan de búsqueda en la ficha', () => {
  it('está en el reporte propio de una mascota perdida', async () => {
    const t = textos(await montarFicha());
    expect(t).toContain('Plan de búsqueda');
    // y con el contenido que importa a la vista, no un cartel vacío
    expect(t).toContain('No lo persigas');
  });

  it('no está en el reporte de otra persona', async () => {
    mockGetPet.mockResolvedValue({ ...PERDIDA_PROPIA, user_id: 'u-otra-persona' });
    expect(textos(await montarFicha())).not.toContain('Plan de búsqueda');
  });

  it('no está en un reporte de mascota encontrada', async () => {
    mockGetPet.mockResolvedValue({ ...PERDIDA_PROPIA, estado: 'encontrada' });
    expect(textos(await montarFicha())).not.toContain('Plan de búsqueda');
  });

  it('desaparece cuando la mascota ya volvió a casa', async () => {
    mockGetPet.mockResolvedValue({
      ...PERDIDA_PROPIA,
      reunida_en: '2026-07-28T10:00:00Z',
      activo: false,
    });
    const t = textos(await montarFicha());
    expect(t).toContain('FINAL FELIZ');
    expect(t).not.toContain('Plan de búsqueda');
  });
});

describe('el orden del tablero de difusión y el plan de búsqueda en la ficha', () => {
  // Guardián de la deuda anotada en la tanda 10: la cuadrilla —lo que más
  // reencuentros consigue— quedó enterrada debajo de todo el plan y nadie se
  // enteró porque nada lo comprobaba. El brief de A4 pide el tablero de
  // difusión ARRIBA del plan a propósito (mismo motivo). Sin este test, que
  // el orden esté bien hoy es pura casualidad: nada se pone rojo si mañana
  // alguien mueve un bloque de JSX en PetDetailScreen.tsx.
  it('el tablero de difusión aparece ANTES que el plan de búsqueda', async () => {
    const arbol = await montarFicha();
    const textoPlano = arbol.root
      .findAll((n: any) => typeof n.type === 'string')
      .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'));

    const iTablero = textoPlano.indexOf('Tablero de difusión');
    const iPlan = textoPlano.indexOf('Plan de búsqueda');

    // Si cualquiera de los dos no aparece, el test no está comprobando nada:
    // que fallen acá con un mensaje claro en vez de con un -1 vs -1 mudo.
    expect(iTablero).toBeGreaterThanOrEqual(0);
    expect(iPlan).toBeGreaterThanOrEqual(0);
    expect(iTablero).toBeLessThan(iPlan);
  });
});

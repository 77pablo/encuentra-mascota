import React from 'react';
import { act, create } from 'react-test-renderer';
import ProfileScreen from '../../src/screens/ProfileScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { bandeja } from '../../src/services/moderacionAdmin';

// LA FILA MODERACIÓN CUENTA LO PENDIENTE (tarea C3, tanda 13).
//
// Hasta acá la fila decía "Moderación" a secas: para saber si había algo
// esperando, el admin tenía que entrar a mirar. Con la 0060 encolando un
// aviso por cada denuncia nueva, el número puede salir sin abrir la bandeja
// a mano — el mismo trato que ya tiene "Tus avisos".
//
// Andamiaje calcado de perfilPropioInstitucion.test.tsx.

jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));
jest.mock('../../src/ui/Confetti', () => ({ Confetti: () => null }));

jest.mock('@react-navigation/native', () => ({
  // A diferencia del mock de deps `[]` que usan otras suites de Perfil, acá
  // hace falta `[cb]`: `profile` (y por lo tanto `esAdmin`) llega DESPUÉS del
  // primer render, y `useDenunciasPendientes` recién sabe si tiene que llamar
  // a la bandeja cuando ese segundo valor de `esAdmin` le llega a través de un
  // nuevo `cb` (el `useCallback` con `[esAdmin]` de adentro del hook). Con
  // deps `[]` este efecto corre una sola vez, con `esAdmin` todavía en false.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
}));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

jest.mock('../../src/hooks/useAuth', () => {
  // Estable ENTRE RENDERS a propósito: `cargar` (en ProfileScreen) depende de
  // `user` por identidad. Con un objeto literal nuevo en cada llamada, el
  // mock de `useFocusEffect` de arriba (que sí reacciona a que el callback
  // cambie, a diferencia del `[]` fijo de otras suites) lo tomaba como un
  // cambio real y volvía a disparar `cargar` en cada render — bucle infinito.
  const usuario = { id: 'u-yo', email: 'admin@ejemplo.cl' };
  return {
    useAuth: () => ({
      user: usuario,
      session: {},
      loading: false,
      signOut: jest.fn(),
    }),
  };
});

jest.mock('../../src/services/pets', () => ({
  listMyReports: jest.fn(() => Promise.resolve([])),
  closePet: jest.fn(),
  deletePet: jest.fn(() => Promise.resolve()),
  renovarReporte: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/reunions', () => ({ markReunited: jest.fn() }));

const mockGetMyProfile = jest.fn();
jest.mock('../../src/services/profile', () => ({
  getMyProfile: (...a: any[]) => mockGetMyProfile(...a),
  updateMyProfile: jest.fn(() => Promise.resolve()),
  camposDeContactoParaGuardar: () => ({}),
}));

jest.mock('../../src/services/perfilPublico', () => ({
  getPerfilPublico: jest.fn(() =>
    Promise.resolve({
      id: 'u-yo',
      nombre: 'Admin',
      foto_perfil: null,
      red_social: null,
      creado_en: '2026-01-01T00:00:00Z',
      reencuentros: 0,
      reportes: 0,
      aportes: 0,
      adopciones: 0,
      institucion: null,
    }),
  ),
}));

jest.mock('../../src/services/storage', () => ({ uploadPetPhoto: jest.fn() }));
jest.mock('../../src/lib/pickImage', () => ({ pickFromLibrary: jest.fn(), takePhoto: jest.fn() }));

jest.mock('../../src/services/moderacionAdmin', () => ({
  bandeja: jest.fn(),
}));

const BASE = { id: 'u-yo', nombre: 'Admin', telefono: null, red_social: null, foto_perfil: null };
const ADMIN = { ...BASE, es_admin: true };

const navigation = { navigate: jest.fn() };
const montados: any[] = [];

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <ProfileScreen navigation={navigation} />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 40 && !textos(arbol).includes('Mis reportes activos'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(textos(arbol)).toContain('Mis reportes activos');
  montados.push(arbol);
  return arbol;
}

async function montarComoUsuarioComun() {
  mockGetMyProfile.mockResolvedValue(BASE);
  return montar();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyProfile.mockResolvedValue(BASE);
  (bandeja as jest.Mock).mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('la fila Moderación del Perfil avisa lo pendiente sin abrir la bandeja', () => {
  it('la fila Moderación cuenta lo pendiente', async () => {
    mockGetMyProfile.mockResolvedValue(ADMIN);
    (bandeja as jest.Mock).mockResolvedValue([{ id: '1' }, { id: '2' }, { id: '3' }]);
    const arbol = await montar();
    // `montar` solo espera "Mis reportes activos" (viene de otro hook); el
    // conteo de `useDenunciasPendientes` resuelve en un microtask aparte, así
    // que hace falta esperarlo por separado antes de leer el texto.
    for (let i = 0; i < 40 && !textos(arbol).includes('Moderación ·'); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }
    // `textos` ya devuelve un string unido (andamiaje calcado de
    // perfilPropioInstitucion.test.tsx): no hace falta `.join` de nuevo.
    expect(textos(arbol)).toContain('Moderación · 3 pendientes');
  });

  it('sin es_admin no se llama a la bandeja (la RPC lanzaría "no autorizado")', async () => {
    await montarComoUsuarioComun();
    expect(bandeja).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import ProfileScreen from '../../src/screens/ProfileScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// EL DUEÑO DE LA CUENTA TIENE QUE VER SU PROPIA VERIFICACIÓN (migración 0057).
//
// No es decoración. Como la insignia la otorga la moderación a mano (RPC
// `institucion_otorgar`, solo admin), la veterinaria no tiene NINGUNA otra
// forma de saber si el trámite quedó hecho: escribiría por segunda vez para
// preguntar. Verlo en su perfil es el acuse de recibo.
//
// Y es lo que explica que la pantalla de Publicar le ofrezca cargar en lote:
// sin esto, esa oferta aparecería "porque sí".

jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));
jest.mock('../../src/ui/Confetti', () => ({ Confetti: () => null }));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-yo', email: 'vet@ejemplo.cl' },
    session: {},
    loading: false,
    signOut: jest.fn(),
  }),
}));

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
      nombre: 'Vet Ñuñoa',
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

const BASE = { id: 'u-yo', nombre: 'Vet Ñuñoa', telefono: null, red_social: null, foto_perfil: null };
const VERIFICADA = {
  ...BASE,
  institucion: {
    tipo: 'veterinaria',
    nombre: 'Clínica Veterinaria Ñuñoa',
    comuna: 'Ñuñoa',
    contacto: '+56 9 1234 5678',
  },
};

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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyProfile.mockResolvedValue(BASE);
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('mi propio perfil dice si soy una cuenta institucional', () => {
  it('una cuenta verificada ve el sello y sus datos', async () => {
    mockGetMyProfile.mockResolvedValue(VERIFICADA);
    const t = textos(await montar());
    expect(t).toContain('Veterinaria verificada');
    expect(t).toContain('Clínica Veterinaria Ñuñoa');
  });

  it('una cuenta común no ve nada de esto', async () => {
    mockGetMyProfile.mockResolvedValue({ ...BASE, institucion: null });
    expect(textos(await montar())).not.toContain('verificad');
  });

  it('sin la 0057, la clave ni siquiera viene y el perfil se ve igual que ayer', async () => {
    mockGetMyProfile.mockResolvedValue(BASE);
    const t = textos(await montar());
    expect(t).not.toContain('verificad');
    expect(t).toContain('Mis reportes activos');
  });

  it('si el perfil no se pudo leer, no se inventa una insignia', async () => {
    // `getMyProfile` puede devolver null (error que no fue PGRST202). En ese
    // caso la pantalla ya se dibuja degradada; lo que no puede hacer es afirmar
    // algo sobre la verificación.
    mockGetMyProfile.mockResolvedValue(null);
    expect(textos(await montar())).not.toContain('verificad');
  });
});

describe('el correo propio en el Perfil se muestra tapado hasta que lo tocás', () => {
  it('el correo propio sale enmascarado hasta que lo tocás', async () => {
    const arbol = await montar();
    expect(textos(arbol)).toContain('v***@ejemplo.cl');
    expect(textos(arbol)).not.toContain('vet@ejemplo.cl');
  });
});

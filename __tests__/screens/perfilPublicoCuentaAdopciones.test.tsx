import React from 'react';
import { act, create } from 'react-test-renderer';
import PublicProfileScreen from '../../src/screens/PublicProfileScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// UN REFUGIO CON 40 ANIMALES PUBLICADOS NO PUEDE VERSE COMO SI NO TUVIERA NADA.
//
// `perfil_publico` (0019) suma `pets`, `sightings` y `pet_tips`. `adoptions` no
// aparecía por ningún lado, así que quien vive de publicar en adopción —los
// refugios, o sea la gente que más publica— entraba a su perfil público y veía
// todo en cero y "No tiene reportes activos". La 0052 suma la cuenta.
//
// La degradación tiene test propio y no es un detalle: mientras el SQL no esté
// aplicado la RPC vieja no devuelve la columna, y ahí `adopciones` vale `null`.
// Dibujar un "0 · En adopción" sería exactamente el mismo bug que estamos
// arreglando, escrito de otra forma.

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
  const estado = { user: { id: 'yo' }, session: {}, loading: false };
  return { useAuth: () => estado };
});

jest.mock('../../src/services/bloqueos', () => ({
  bloqueEmitido: jest.fn(() => Promise.resolve(false)),
  bloquear: jest.fn(() => Promise.resolve()),
  desbloquear: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: jest.fn(() => Promise.resolve(false)),
}));

const mockGetPerfil = jest.fn();
jest.mock('../../src/services/perfilPublico', () => ({
  getPerfilPublico: (...a: any[]) => mockGetPerfil(...a),
  listReportesPublicos: jest.fn(() => Promise.resolve([])),
  listReencuentrosPublicos: jest.fn(() => Promise.resolve([])),
}));

const PERFIL = {
  id: 'refugio',
  nombre: 'Refugio Ñuñoa',
  foto_perfil: null,
  red_social: null,
  creado_en: '2026-01-01T00:00:00Z',
  reencuentros: 0,
  reportes: 0,
  aportes: 0,
  adopciones: null as number | null,
};

const montados: any[] = [];

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PublicProfileScreen
          route={{ params: { userId: 'refugio' } }}
          navigation={{ navigate: jest.fn(), goBack: jest.fn() }}
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

beforeEach(() => {
  mockGetPerfil.mockReset();
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('el perfil público cuenta las adopciones', () => {
  it('muestra la cuenta cuando la 0052 está aplicada', async () => {
    mockGetPerfil.mockResolvedValue({ ...PERFIL, adopciones: 40 });
    const t = textos(await montar());
    expect(t).toContain('40');
    expect(t.toLowerCase()).toContain('adopción');
  });

  it('sin la 0052 NO inventa un cero: la baldosa no se dibuja', async () => {
    mockGetPerfil.mockResolvedValue({ ...PERFIL, adopciones: null });
    const t = textos(await montar());
    expect(t.toLowerCase()).not.toContain('en adopción');
  });

  it('un cero de verdad sí se muestra', async () => {
    // Quien realmente no publicó ninguna ve su cero, igual que en reportes.
    mockGetPerfil.mockResolvedValue({ ...PERFIL, adopciones: 0 });
    expect(textos(await montar()).toLowerCase()).toContain('en adopción');
  });

  it('con publicaciones en adopción, "no tiene reportes activos" deja de mentir', async () => {
    // El texto viejo hablaba por TODA la persona. Con 40 animales publicados,
    // leerlo es entender que no tiene nada — que es justo lo contrario.
    mockGetPerfil.mockResolvedValue({ ...PERFIL, adopciones: 40 });
    const t = textos(await montar());
    expect(t).not.toContain('No tiene reportes activos.');
    expect(t.toLowerCase()).toMatch(/mascota[s]? perdida|no perdió|reportes de/);
  });

  it('sin adopciones, el texto de siempre queda como estaba', async () => {
    mockGetPerfil.mockResolvedValue({ ...PERFIL, adopciones: 0 });
    expect(textos(await montar())).toContain('No tiene reportes activos.');
  });
});

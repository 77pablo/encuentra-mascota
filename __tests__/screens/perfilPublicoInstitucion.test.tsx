import React from 'react';
import { act, create } from 'react-test-renderer';
import PublicProfileScreen from '../../src/screens/PublicProfileScreen';
import InsigniaInstitucion from '../../src/components/InsigniaInstitucion';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// QUE SE NOTE QUE ES UNA VETERINARIA (migración 0057).
//
// Una insignia SOBRIA, no un cartel: es un sello de confianza, y un sello que
// grita deja de parecer un sello. Pero tiene que estar, porque es la única
// diferencia visible entre "alguien publicó esto" y "lo publicó el refugio de
// la comuna" — que es exactamente lo que una institución viene a buscar cuando
// evalúa si le sirve la herramienta.
//
// Y la regla que no se negocia: SIN verificación, NO hay insignia. Ni media.

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
  id: 'vet',
  nombre: 'Vet Ñuñoa',
  foto_perfil: null,
  red_social: null,
  creado_en: '2026-01-01T00:00:00Z',
  reencuentros: 0,
  reportes: 0,
  aportes: 0,
  adopciones: 0,
  institucion: null as any,
};

const VETERINARIA = {
  tipo: 'veterinaria' as const,
  nombre: 'Clínica Veterinaria Ñuñoa',
  comuna: 'Ñuñoa',
  contacto: '+56 9 1234 5678',
};

const montados: any[] = [];

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PublicProfileScreen
          route={{ params: { userId: 'vet' } }}
          navigation={{ navigate: jest.fn(), goBack: jest.fn() }}
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

/** Todo el texto plano de un árbol (o de un subárbol, pasando `arbol.root.findByType(...)`). */
function textos(arbol: any): string {
  return (arbol.root ?? arbol)
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

beforeEach(() => mockGetPerfil.mockReset());

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('el perfil público de una institución dice qué es', () => {
  it('muestra la insignia con el tipo y el nombre de la institución', async () => {
    mockGetPerfil.mockResolvedValue({ ...PERFIL, institucion: VETERINARIA });
    const t = textos(await montar());
    expect(t).toContain('Veterinaria verificada');
    expect(t).toContain('Clínica Veterinaria Ñuñoa');
  });

  it('muestra su comuna y su contacto (para eso publican)', async () => {
    // El contacto de una veterinaria es su cartel en la vereda, no el teléfono
    // privado que cerró la 0018. Lo escribe la moderación al verificar.
    mockGetPerfil.mockResolvedValue({ ...PERFIL, institucion: VETERINARIA });
    const t = textos(await montar());
    expect(t).toContain('Ñuñoa');
    expect(t).toContain('+56 9 1234 5678');
  });

  it('un refugio dice "Refugio verificado", no "verificada"', async () => {
    mockGetPerfil.mockResolvedValue({
      ...PERFIL,
      institucion: { tipo: 'refugio', nombre: 'Refugio Los Andes', comuna: null, contacto: null },
    });
    expect(textos(await montar())).toContain('Refugio verificado');
  });

  it('una PERSONA no muestra nada de esto', async () => {
    mockGetPerfil.mockResolvedValue({ ...PERFIL, institucion: null });
    const t = textos(await montar());
    expect(t).not.toContain('verificad');
    expect(t).not.toContain('Institución');
  });

  it('sin la 0057 aplicada la pantalla se ve exactamente igual que ayer', async () => {
    // La app sube antes que el SQL. En esa ventana `institucion` ni siquiera
    // viene como clave, y la pantalla más pública que tenemos no puede cambiar.
    const { institucion, ...sinLaClave } = PERFIL;
    mockGetPerfil.mockResolvedValue(sinLaClave);
    const t = textos(await montar());
    expect(t).not.toContain('verificad');
    // y lo de siempre sigue ahí
    expect(t).toContain('Vet Ñuñoa');
    expect(t).toContain('Reportes');
  });

  it('la insignia va sin emojis: es un sello, no un cartel', async () => {
    // Regla visual del proyecto (íconos de línea, nada de emojis a color en la
    // UI). Un 🏥 al lado del nombre de un municipio lo abarata. Se mira SOLO el
    // subárbol de la insignia: el resto de la pantalla tiene "Reencuentros 🎉"
    // desde siempre y no es asunto de este test.
    mockGetPerfil.mockResolvedValue({ ...PERFIL, institucion: VETERINARIA });
    const arbol = await montar();
    const contenido = textos(arbol.root.findByType(InsigniaInstitucion));
    expect(contenido).toContain('Veterinaria verificada');
    expect(contenido).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u);
  });
});

describe('InsigniaInstitucion suelta', () => {
  function render(props: any) {
    let arbol: any;
    act(() => {
      arbol = create(
        <ThemeProvider>
          <InsigniaInstitucion {...props} />
        </ThemeProvider>,
      );
    });
    montados.push(arbol);
    return arbol;
  }

  it('sin institución no dibuja nada (null, no un hueco)', () => {
    // La usan tres pantallas y todas le pasan algo que puede ser null. Si
    // devolviera un <View/> vacío, dejaría un espacio raro en cada ficha.
    expect(render({ institucion: null }).toJSON()).toBeNull();
  });

  it('en modo compacto muestra el tipo pero no repite el nombre', () => {
    // En la ficha de un reporte el nombre ya está en "Publicado por Vet Ñuñoa":
    // repetirlo al lado sería decirlo dos veces en la misma línea.
    const t = JSON.stringify(render({ institucion: VETERINARIA, compacta: true }).toJSON());
    expect(t).toContain('Veterinaria verificada');
    expect(t).not.toContain('Clínica Veterinaria Ñuñoa');
  });
});

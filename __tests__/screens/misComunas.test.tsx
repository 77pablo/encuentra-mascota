import React from 'react';
import { act, create } from 'react-test-renderer';
import MisComunasScreen from '../../src/screens/MisComunasScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { resolverDestinatarios, type Contexto, type EventoAviso } from '../../src/lib/notifyTargets';

// A10 — SEGUIR UNA COMUNA NO TENÍA VUELTA ATRÁS.
//
// `services/comunasSeguidas` solo se consumía desde `SeguirComunaButton`, que
// se monta únicamente en Explorar, DENTRO del panel de filtros (que arranca
// colapsado) y solo si ya elegiste comuna. O sea: no había ninguna pantalla
// donde ver qué comunas seguís ni dónde sacarlas, aunque te generen avisos.
//
// A19 — y encima esos avisos SALTEAN el interruptor de tipo (`zona`). Es
// deliberado —seguir es un opt-in explícito— pero no estaba dicho en ningún
// lado y `NotificationPrefsScreen` ni menciona las comunas. Acá se dice, y el
// último test comprueba contra el targeting REAL que lo que se dice es verdad:
// si algún día se cambia la regla, la advertencia queda mintiendo y el test se
// pone rojo.

jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));

const mockNotify = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...args: any[]) => mockNotify(...args),
  confirmAction: (...args: any[]) => mockConfirm(...args),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-yo' }, session: {}, loading: false }),
}));

const mockGetComunas = jest.fn();
const mockDejarDeSeguir = jest.fn();
jest.mock('../../src/services/comunasSeguidas', () => ({
  getComunasSeguidas: (...args: any[]) => mockGetComunas(...args),
  dejarDeSeguirComuna: (...args: any[]) => mockDejarDeSeguir(...args),
  seguirComuna: jest.fn(),
}));

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

function botones(arbol: any, title: string): any[] {
  return arbol.root.findAll((n: any) => typeof n.type !== 'string' && n.props?.title === title);
}

function porEtiqueta(arbol: any, label: string): any[] {
  return arbol.root.findAll((n: any) => n.props?.accessibilityLabel === label);
}

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <MisComunasScreen />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 40 && !textos(arbol).includes('Mis comunas'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(textos(arbol)).toContain('Mis comunas');
  return arbol;
}

beforeEach(() => {
  mockNotify.mockReset();
  mockConfirm.mockReset().mockResolvedValue(true);
  mockGetComunas.mockReset().mockResolvedValue(['Ñuñoa', 'Maipú']);
  mockDejarDeSeguir.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {});
});

describe('ver las comunas que sigo', () => {
  it('las lista', async () => {
    const arbol = await montar();
    const t = textos(arbol);
    expect(t).toContain('Ñuñoa');
    expect(t).toContain('Maipú');
  });

  it('sin ninguna, lo dice y explica dónde se sigue una', async () => {
    mockGetComunas.mockResolvedValue([]);
    const arbol = await montar();
    const t = textos(arbol);
    expect(t).toContain('Todavía no seguís ninguna comuna');
    expect(t).toContain('Explorar');
  });
});

describe('dejar de seguir', () => {
  it('llama al servicio con mi id y la comuna', async () => {
    const arbol = await montar();

    await act(async () => {
      await porEtiqueta(arbol, 'Dejar de seguir Ñuñoa')[0].props.onPress();
    });

    expect(mockDejarDeSeguir).toHaveBeenCalledWith('u-yo', 'Ñuñoa');
  });

  it('la comuna desaparece de la lista', async () => {
    const arbol = await montar();

    await act(async () => {
      await porEtiqueta(arbol, 'Dejar de seguir Ñuñoa')[0].props.onPress();
    });

    const t = textos(arbol);
    expect(t).not.toContain('Ñuñoa');
    expect(t).toContain('Maipú');
  });

  it('si se cancela la confirmación, no se toca nada', async () => {
    mockConfirm.mockResolvedValue(false);
    const arbol = await montar();

    await act(async () => {
      await porEtiqueta(arbol, 'Dejar de seguir Ñuñoa')[0].props.onPress();
    });

    expect(mockDejarDeSeguir).not.toHaveBeenCalled();
    expect(textos(arbol)).toContain('Ñuñoa');
  });

  it('si el guardado falla, avisa y la comuna SIGUE en la lista', async () => {
    // Sacarla de la pantalla sin haberla sacado de la base sería peor que el
    // bug original: creerías que dejaste de recibir avisos y seguirían llegando.
    mockDejarDeSeguir.mockRejectedValue({ message: 'se cayó la red' });
    const arbol = await montar();

    await act(async () => {
      await porEtiqueta(arbol, 'Dejar de seguir Ñuñoa')[0].props.onPress();
    });

    expect(mockNotify).toHaveBeenCalled();
    expect(textos(arbol)).toContain('Ñuñoa');
  });
});

describe('no pudimos leerlo ≠ no seguís ninguna', () => {
  it('muestra el fallo y NO el vacío', async () => {
    mockGetComunas.mockRejectedValue({ message: 'se cayó la red' });
    const arbol = await montar();

    const t = textos(arbol);
    expect(t).not.toContain('Todavía no seguís ninguna comuna');
    expect(t).toContain('No pudimos leer tus comunas');
  });

  it('ofrece reintentar, y el reintento vuelve a preguntar', async () => {
    mockGetComunas.mockRejectedValue({ message: 'se cayó la red' });
    const arbol = await montar();
    const antes = mockGetComunas.mock.calls.length;

    const btn = botones(arbol, 'Reintentar');
    expect(btn.length).toBeGreaterThan(0);
    mockGetComunas.mockResolvedValue(['Ñuñoa']);
    await act(async () => {
      await btn[0].props.onPress();
    });

    expect(mockGetComunas.mock.calls.length).toBeGreaterThan(antes);
    expect(textos(arbol)).toContain('Ñuñoa');
  });
});

describe('A19 — la pantalla avisa que estos avisos saltean el interruptor', () => {
  it('lo dice con todas las letras, y dice cómo se cortan', async () => {
    const arbol = await montar();
    const t = textos(arbol);
    // Que nombre el interruptor real de la pantalla de Avisos, no una vaguedad.
    expect(t).toContain('Reportes en mi zona');
    expect(t).toContain('aunque');
    expect(t).toContain('dejar de seguir');
  });

  it('y esa advertencia es VERDAD según el targeting real', () => {
    // Sin este test, el de arriba solo comprueba que un texto está escrito.
    // Acá se corre `resolverDestinatarios` de verdad: quien sigue la comuna
    // recibe el reporte nuevo aunque tenga `zona: false`; quien no la sigue y
    // tiene `zona: false`, no.
    const evento: EventoAviso = {
      id: 'ev-1',
      tipo: 'reporte_nuevo',
      petId: 'pet-1',
      actorId: 'u-quien-publica',
      datos: { lat: -33.45, lng: -70.65, comuna: 'Ñuñoa' },
    };
    const apagado = {
      zona: false,
      avistamientos: true,
      pistas: true,
      coincidencias: true,
      canalEmail: true,
      canalPush: true,
    };
    const ctx: Contexto = {
      duenoPetId: 'u-quien-publica',
      nombrePet: 'Cholo',
      // La zona de u-vecino cubre el punto, pero tiene `zona` apagado.
      zonas: [{ userId: 'u-vecino', lat: -33.45, lng: -70.65, radioKm: 5 }],
      prefs: {
        'u-sigue-comuna': { userId: 'u-sigue-comuna', ...apagado },
        'u-vecino': { userId: 'u-vecino', ...apagado },
      },
      seguidoresComuna: ['u-sigue-comuna'],
    };

    const ids = resolverDestinatarios(evento, ctx).map((d) => d.userId);
    expect(ids).toContain('u-sigue-comuna');
    expect(ids).not.toContain('u-vecino');
  });
});

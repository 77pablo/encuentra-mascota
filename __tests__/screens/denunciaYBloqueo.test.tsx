import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PublicProfileScreen from '../../src/screens/PublicProfileScreen';
import ChatScreen from '../../src/screens/ChatScreen';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// UNA DENUNCIA QUE SÍ SE REGISTRÓ NO PUEDE INFORMARSE COMO FALLIDA.
//
// Denunciar y bloquear son dos operaciones distintas encadenadas por un
// diálogo. Estaban dentro del MISMO `try`, así que si la denuncia salía bien y
// el bloqueo fallaba (la red se cae justo ahí, un 42501), el `catch` decía
// "No se pudo denunciar". Quien denuncia vuelve a denunciar lo mismo: ruido
// para moderación y, peor, la sensación de que la app no la escuchó.
//
// El mismo bug estaba duplicado en el chat, con un `goBack()` mudo encima.

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

// OJO: el estado tiene que ser el MISMO objeto en cada render. `cargar` es un
// `useCallback` que depende de `user`, y `useFocusEffect` lo vuelve a correr
// cuando cambia: devolver un objeto nuevo por render es un bucle infinito.
jest.mock('../../src/hooks/useAuth', () => {
  const estado = { user: { id: 'yo' }, session: {}, loading: false };
  return { useAuth: () => estado };
});

const mockDenunciarUsuario = jest.fn();
const mockBloquear = jest.fn();
const mockNotify = jest.fn();
const mockConfirmAction = jest.fn();

jest.mock('../../src/services/moderation', () => ({
  ...jest.requireActual('../../src/services/moderation'),
  denunciarUsuario: (...a: any[]) => mockDenunciarUsuario(...a),
  denunciarMensaje: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/bloqueos', () => ({
  bloqueEmitido: jest.fn(() => Promise.resolve(false)),
  bloquear: (...a: any[]) => mockBloquear(...a),
  desbloquear: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: (...a: any[]) => mockConfirmAction(...a),
}));

// ── PublicProfileScreen ────────────────────────────────────────────────────
jest.mock('../../src/services/perfilPublico', () => ({
  getPerfilPublico: jest.fn(() =>
    Promise.resolve({
      id: 'otro',
      nombre: 'Quien Sea',
      foto_perfil: null,
      red_social: null,
      creado_en: '2026-01-01T00:00:00Z',
      reencuentros: 0,
      reportes: 0,
      aportes: 0,
    }),
  ),
  listReportesPublicos: jest.fn(() => Promise.resolve([])),
  listReencuentrosPublicos: jest.fn(() => Promise.resolve([])),
}));

// ── ChatScreen ─────────────────────────────────────────────────────────────
jest.mock('../../src/hooks/useRealtimeMessages', () => ({ useRealtimeMessages: () => [] }));
jest.mock('../../src/hooks/useUnread', () => ({
  useUnread: () => ({ refresh: jest.fn(), unread: 0 }),
}));
jest.mock('../../src/services/messages', () => ({
  ...jest.requireActual('../../src/services/messages'),
  markThreadRead: jest.fn(() => Promise.resolve()),
  sendMessage: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/adoptions', () => ({
  getAdoption: jest.fn(() => Promise.resolve({ nombre: 'x' })),
}));
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { nombre: 'Ana', eliminado_en: null } }),
        }),
      }),
    }),
    functions: { invoke: jest.fn(() => Promise.resolve({ data: null, error: null })) },
  },
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

function botonPorTitulo(tree: any, re: RegExp) {
  return tree.root.findAllByType(Button).find((b: any) => re.test(b.props.title));
}

/** Todo lo que se le pasó a `notify`, aplanado, para buscar por texto. */
function loNotificado(): string {
  return mockNotify.mock.calls.map((c) => c.join(' ')).join(' | ');
}

beforeEach(() => {
  mockDenunciarUsuario.mockReset().mockResolvedValue(undefined);
  mockBloquear.mockReset();
  mockNotify.mockReset();
  mockConfirmAction.mockReset().mockResolvedValue(true);
  navigation.navigate.mockReset();
  navigation.goBack.mockReset();
});

function textoDe(nodo: any): string {
  return nodo
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

/** Abre el selector de motivos (con `abrir`) y elige el primero. */
async function denunciarPrimerMotivo(tree: any, pasos: ((tree: any) => void)[]) {
  for (const paso of pasos) {
    await act(async () => {
      paso(tree);
    });
  }
  const motivo = botonPorTitulo(tree, /Estafa o pedido de dinero/i);
  expect(motivo).toBeTruthy();
  await act(async () => {
    motivo.props.onPress();
  });
}

// El perfil público abre los motivos con un Button "Denunciar"; el chat, con
// el ítem "Denunciar conversación" del menú ⋯.
const abrirEnPerfil = (tree: any) => botonPorTitulo(tree, /^Denunciar$/).props.onPress();
const abrirEnChat = (tree: any) => {
  const trespuntos = tree.root
    .findAllByType(TouchableOpacity)
    .find((n: any) => n.props.accessibilityLabel === 'Más opciones de esta conversación');
  if (!trespuntos) throw new Error('no se encontró el ⋯ de la conversación');
  trespuntos.props.onPress();
};

/** Segundo paso del chat: el menú ya está abierto. */
const elegirDenunciarConversacion = (tree: any) => {
  const item = tree.root
    .findAllByType(TouchableOpacity)
    .find((n: any) => textoDe(n).includes('Denunciar conversación'));
  if (!item) throw new Error('no se encontró "Denunciar conversación" en el menú del chat');
  item.props.onPress();
};

describe('PublicProfileScreen — denunciar y después bloquear', () => {
  async function montar() {
    let tree: any;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <PublicProfileScreen route={{ params: { userId: 'otro' } }} navigation={navigation} />
        </ThemeProvider>,
      );
    });
    return tree;
  }

  it('si el BLOQUEO falla, no dice que la denuncia falló', async () => {
    mockBloquear.mockRejectedValue({ message: 'Failed to fetch' });
    const tree = await montar();
    await denunciarPrimerMotivo(tree, [abrirEnPerfil]);

    expect(mockDenunciarUsuario).toHaveBeenCalledTimes(1);
    expect(mockBloquear).toHaveBeenCalledTimes(1);

    const dicho = loNotificado();
    expect(dicho).not.toContain('No se pudo denunciar');
    // Y se le dice explícitamente que no repita la denuncia.
    expect(dicho).toContain('quedó registrada');

    await act(async () => {
      tree.unmount();
    });
  }, 60000);

  it('si el bloqueo sale bien, la rama feliz TAMBIÉN avisa', async () => {
    mockBloquear.mockResolvedValue(undefined);
    const tree = await montar();
    await denunciarPrimerMotivo(tree, [abrirEnPerfil]);

    expect(loNotificado()).toMatch(/bloquead/i);

    await act(async () => {
      tree.unmount();
    });
  }, 60000);

  it('si falla LA DENUNCIA, ahí sí se dice que no se pudo denunciar', async () => {
    mockDenunciarUsuario.mockRejectedValue({ message: 'Failed to fetch' });
    const tree = await montar();
    await denunciarPrimerMotivo(tree, [abrirEnPerfil]);

    expect(loNotificado()).toContain('No se pudo denunciar');
    expect(mockBloquear).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  }, 60000);
});

describe('ChatScreen — denunciar y después bloquear', () => {
  async function montar() {
    let tree: any;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <ChatScreen
            route={{ params: { petId: 'p1', otherUserId: 'otro' } }}
            navigation={navigation}
          />
        </ThemeProvider>,
      );
    });
    return tree;
  }

  it('si el BLOQUEO falla, no dice que la denuncia falló', async () => {
    mockBloquear.mockRejectedValue({ message: 'Failed to fetch' });
    const tree = await montar();
    await denunciarPrimerMotivo(tree, [abrirEnChat, elegirDenunciarConversacion]);

    expect(mockDenunciarUsuario).toHaveBeenCalledTimes(1);
    const dicho = loNotificado();
    expect(dicho).not.toContain('No se pudo denunciar');
    expect(dicho).toContain('quedó registrada');
    // Y no se sale del chat: el bloqueo no llegó a aplicarse.
    expect(navigation.goBack).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  }, 60000);

  it('si el bloqueo sale bien, avisa ANTES de cerrar el chat', async () => {
    mockBloquear.mockResolvedValue(undefined);
    const tree = await montar();
    await denunciarPrimerMotivo(tree, [abrirEnChat, elegirDenunciarConversacion]);

    expect(loNotificado()).toMatch(/bloquead/i);
    expect(navigation.goBack).toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  }, 60000);
});

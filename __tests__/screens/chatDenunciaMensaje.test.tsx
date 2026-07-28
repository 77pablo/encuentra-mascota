import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import ChatScreen from '../../src/screens/ChatScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// DENUNCIAR UN MENSAJE PUNTUAL (pulsación larga sobre la burbuja).
//
// Es la pantalla donde mira quien revisa una denuncia, así que interesa probar
// el cableado de verdad —que la pulsación larga termine llamando a
// `denunciarMensaje` con el id correcto— y no que el archivo contenga la
// palabra "onLongPress".

// `@expo/vector-icons` arrastra `expo-font` → `expo-asset`, que no está en el
// node_modules compartido de este repo (y no se puede instalar nada). Los íconos
// no aportan nada a lo que se prueba acá: se reemplazan por un componente hueco.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: any) => null,
  MaterialCommunityIcons: (props: any) => null,
}));

const mockDenunciarMensaje = jest.fn();
const mockNotify = jest.fn();

// Mensajes del hilo: uno mío y uno de la otra persona.
const MENSAJES = [
  {
    id: 'm-mio', pet_id: 'p1', adoption_id: null, from_user: 'yo', to_user: 'otro',
    texto: 'hola', imagen_url: null, leido: true, creado_en: '2026-07-01T10:00:00Z',
  },
  {
    id: 'm-ajeno', pet_id: 'p1', adoption_id: null, from_user: 'otro', to_user: 'yo',
    texto: 'dame plata', imagen_url: null, leido: false, creado_en: '2026-07-01T10:01:00Z',
  },
  {
    id: 'm-ajeno-foto', pet_id: 'p1', adoption_id: null, from_user: 'otro', to_user: 'yo',
    texto: null, imagen_url: 'https://ejemplo.com/f.jpg', leido: false,
    creado_en: '2026-07-01T10:02:00Z',
  },
];

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'yo' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRealtimeMessages', () => ({
  useRealtimeMessages: () => MENSAJES,
}));
jest.mock('../../src/hooks/useUnread', () => ({
  useUnread: () => ({ refresh: jest.fn(), unread: 0 }),
}));
jest.mock('../../src/services/messages', () => ({
  ...jest.requireActual('../../src/services/messages'),
  markThreadRead: jest.fn(() => Promise.resolve()),
  sendMessage: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/bloqueos', () => ({
  bloqueEmitido: jest.fn(() => Promise.resolve(false)),
  bloquear: jest.fn(() => Promise.resolve()),
  desbloquear: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/moderation', () => ({
  ...jest.requireActual('../../src/services/moderation'),
  denunciarMensaje: (...args: any[]) => mockDenunciarMensaje(...args),
  denunciarUsuario: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/adoptions', () => ({
  getAdoption: jest.fn(() => Promise.resolve({ nombre: 'x' })),
}));
jest.mock('../../src/lib/notify', () => ({
  notify: (...args: any[]) => mockNotify(...args),
  confirmAction: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { nombre: 'Ana', eliminado_en: null } }) }) }),
    }),
    functions: { invoke: jest.fn(() => Promise.resolve({ data: null, error: null })) },
  },
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const route = { params: { petId: 'p1', otherUserId: 'otro' } };

async function montar() {
  let tree: any;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <ChatScreen route={route} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  return tree;
}

// Los `TouchableOpacity` que tienen `onLongPress` cableado, en orden de render.
function tactilesConPulsacionLarga(tree: any) {
  return tree.root
    .findAllByType(TouchableOpacity)
    .filter((n: any) => typeof n.props.onLongPress === 'function');
}

// Texto visible dentro de un nodo. `JSON.stringify(props.children)` no sirve:
// el árbol de react-test-renderer tiene referencias circulares (los Provider).
function textoDe(nodo: any): string {
  return nodo
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

beforeEach(() => {
  mockDenunciarMensaje.mockReset();
  mockDenunciarMensaje.mockResolvedValue(undefined);
  mockNotify.mockReset();
});

describe('ChatScreen — denunciar un mensaje con pulsación larga', () => {
  it('la burbuja de un mensaje AJENO acepta pulsación larga y la propia no', async () => {
    const tree = await montar();
    // Hay 3 mensajes: el mío no debe ofrecer denuncia; los dos ajenos sí (y el
    // de solo-foto suma su propio tactil interno para que la foto no se coma la
    // pulsación larga).
    const conLarga = tactilesConPulsacionLarga(tree);
    expect(conLarga.length).toBeGreaterThanOrEqual(3);
    const etiquetas = tree.root
      .findAllByType(TouchableOpacity)
      .map((n: any) => n.props.accessibilityLabel)
      .filter(Boolean);
    expect(etiquetas.filter((e: string) => e === 'Denunciar este mensaje')).toHaveLength(2);
    await act(async () => {
      tree.unmount();
    });
    // Timeout explícito: montar ChatScreen entero (con su ThemeProvider y toda
    // la UI) tarda ~10s con las 79 suites en paralelo. Mismo criterio que
    // TarjetaCompartir.test.tsx.
  }, 30000);

  it('la pulsación larga abre los motivos y denuncia ESE mensaje', async () => {
    const tree = await montar();
    const burbujaAjena = tree.root
      .findAllByType(TouchableOpacity)
      .find((n: any) => n.props.accessibilityLabel === 'Denunciar este mensaje');
    expect(burbujaAjena).toBeTruthy();

    await act(async () => {
      burbujaAjena.props.onLongPress();
    });

    // La hoja de motivos ya está en pantalla.
    const textoPantalla = textoDe(tree.root);
    expect(textoPantalla).toContain('Denunciar este mensaje');
    expect(textoPantalla).toContain('Estafa o pedido de dinero');

    // Se elige un motivo: el táctil más chico que muestra ese texto (el botón
    // de la hoja, no el contenedor que lo envuelve).
    const candidatos = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n: any) => textoDe(n).includes('Estafa o pedido de dinero'));
    expect(candidatos.length).toBeGreaterThan(0);
    const boton = candidatos[candidatos.length - 1];
    await act(async () => {
      boton.props.onPress();
    });

    expect(mockDenunciarMensaje).toHaveBeenCalledTimes(1);
    // id del mensaje ajeno + mi id + el motivo de la lista cerrada.
    expect(mockDenunciarMensaje).toHaveBeenCalledWith('m-ajeno', 'yo', 'Estafa o pedido de dinero');
    expect(mockNotify).toHaveBeenCalledWith(
      'Denuncia recibida',
      expect.stringContaining('24 horas'),
    );

    await act(async () => {
      tree.unmount();
    });
  }, 30000);
});

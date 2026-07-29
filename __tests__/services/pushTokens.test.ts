// El permiso de notificaciones se pide UNA sola vez en la vida.
//
// Si alguien contesta "bloquear", ni el navegador ni el sistema vuelven a
// preguntar, y `webPush.ts` lo da por perdido para siempre
// (`if (Notification.permission === 'denied') return 'denegada'`). O sea que
// `registerPushToken` maneja una decisión IRREVERSIBLE del usuario, y por eso
// se prueba CUÁNDO pregunta, no solo qué devuelve.
//
// Los dos bugs que motivan este archivo, los dos verificados en producción:
//   1. corría también en WEB, así que el cartel del navegador saltaba solo al
//      iniciar sesión (0 pedidos antes de entrar, 1 justo después). Quien
//      apretaba "bloquear" por reflejo dejaba muerto el botón de Avisos —
//      justo la función que el cartel pretendía habilitar.
//   2. pedía el permiso ANTES de mirar si había `projectId`. Como
//      EAS_PROJECT_ID no está configurado, el camino real era siempre:
//      preguntar y abandonar dos líneas después. La respuesta del usuario se
//      gastaba a cambio de nada.

const mockRequest = jest.fn();
const mockGetToken = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn((..._a: any[]) => ({ upsert: (...a: any[]) => mockUpsert(...a) }));

let mockPlataforma = 'ios';
let mockProjectId: string | undefined = 'proj-123';

jest.mock('react-native', () => ({
  get Platform() {
    return { OS: mockPlataforma };
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return { expoConfig: { extra: { eas: { projectId: mockProjectId } } }, easConfig: null };
  },
}));
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: (...a: any[]) => mockRequest(...a),
  getExpoPushTokenAsync: (...a: any[]) => mockGetToken(...a),
}));
jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...a: any[]) => mockFrom(...a) },
}));

import { registerPushToken } from '../../src/services/pushTokens';

beforeEach(() => {
  mockPlataforma = 'ios';
  mockProjectId = 'proj-123';
  mockRequest.mockReset().mockResolvedValue({ status: 'granted' });
  mockGetToken.mockReset().mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('registerPushToken — no gasta la única respuesta del usuario', () => {
  it('en WEB no pide permiso: ahí el push se activa con un botón explícito', async () => {
    mockPlataforma = 'web';
    await registerPushToken('u1');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('sin projectId NO pregunta nada (antes preguntaba y abandonaba después)', async () => {
    mockProjectId = undefined;
    await registerPushToken('u1');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('con projectId y en nativo sí pregunta, y guarda el token', async () => {
    // El control: las guardas de arriba no pueden estar apagando el camino real.
    await registerPushToken('u1');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', token: 'ExponentPushToken[abc]' },
      { onConflict: 'token' },
    );
  });

  it('si dice que no, no es un error: no guarda nada y no grita', async () => {
    mockRequest.mockResolvedValue({ status: 'denied' });
    await expect(registerPushToken('u1')).resolves.toBeUndefined();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('registerPushToken — el rechazo de la base no se traga', () => {
  it('un error del upsert se registra y se propaga', async () => {
    // supabase-js NO lanza cuando la base rechaza: devuelve `{ error }`. Un
    // `await` sin mirarlo deja a la persona sin push y sin un solo rastro —
    // el mismo modo de fallo que tuvo `send-push` durante semanas.
    mockUpsert.mockResolvedValue({ error: { message: 'new row violates row-level security' } });
    await expect(registerPushToken('u1')).rejects.toMatchObject({
      message: expect.stringContaining('row-level security'),
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('token de push'),
      expect.stringContaining('row-level security'),
    );
  });
});

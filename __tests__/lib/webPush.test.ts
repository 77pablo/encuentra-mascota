jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../../src/lib/env', () => ({ env: { vapidPublicKey: 'fake-vapid-key' } }));

// Builder falso encadenable (mismo patrón que bloqueos.test.ts / alertZones.test.ts).
function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: any = {
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

import { urlBase64ToUint8Array, desactivarWebPush } from '../../src/lib/webPush';

describe('urlBase64ToUint8Array', () => {
  it('convierte base64url a Uint8Array de la longitud correcta', () => {
    // 8 caracteres (%4 === 0, sin padding que agregar): forma válida de
    // base64url. NOTA: una muestra de longitud %4===1 (p. ej. "BFooBar_-",
    // 9 chars) NO es base64 válido — nunca puede ocurrir en datos reales
    // (agregarle 3 "=" de padding sigue siendo inválido) y tanto el `atob`
    // nativo como su polyfill lo rechazan con "InvalidCharacterError". Se
    // evita a propósito acá.
    const out = urlBase64ToUint8Array('Zm9vYmFy'); // "foobar" en base64
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(6);
  });

  it('decodifica una llave VAPID típica (65 bytes, formato P-256 sin comprimir)', () => {
    // Llave de ejemplo con forma real: 87 caracteres (como las que genera
    // `web-push.generateVAPIDKeys()`), empieza en 0x04 (punto sin comprimir
    // de una curva P-256) y mide 65 bytes una vez decodificada. No es una
    // llave real, solo respeta el formato para probar el largo esperado.
    const b64 =
      'BEl68dGzSOtblAxRXfCq8W83TT6ehH8jUXcPy6xUj0oJhthdRJqTV1uFqjabpqxq7yQhk9CqQKb8HkK1MCK4hCk';
    const out = urlBase64ToUint8Array(b64);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(65);
    expect(out[0]).toBe(0x04);
  });

  it('produce el mismo resultado sin importar si el input trae "-"/"_" o "+"/"/"', () => {
    const conGuionYSubrayado = 'Zm9-_9v';
    const conMasYBarra = 'Zm9+/9v';
    expect(urlBase64ToUint8Array(conGuionYSubrayado)).toEqual(
      urlBase64ToUint8Array(conMasYBarra),
    );
  });
});

describe('desactivarWebPush', () => {
  const mockUnsubscribe = jest.fn();
  const mockGetSubscription = jest.fn();

  beforeEach(() => {
    mockFrom.mockReset();
    mockUnsubscribe.mockReset().mockResolvedValue(true);
    mockGetSubscription.mockReset();

    // Simula un navegador con soporte Web Push (Platform.OS='web' y
    // env.vapidPublicKey van mockeados arriba del archivo).
    (globalThis as any).navigator = {
      serviceWorker: {
        ready: Promise.resolve({ pushManager: { getSubscription: mockGetSubscription } }),
      },
    };
    (globalThis as any).window = { PushManager: function PushManager() {} };
  });

  afterEach(() => {
    delete (globalThis as any).navigator;
    delete (globalThis as any).window;
  });

  it('no hace nada si no hay suscripción activa en el navegador', async () => {
    mockGetSubscription.mockResolvedValue(null);

    await expect(desactivarWebPush()).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it('resuelve sin lanzar y desuscribe cuando el borrado en la base funciona', async () => {
    mockGetSubscription.mockResolvedValue({ endpoint: 'https://push.example/abc', unsubscribe: mockUnsubscribe });
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: null }));

    await expect(desactivarWebPush()).resolves.toBeUndefined();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('propaga el error si el borrado en la base falla, pero igual desuscribe al navegador', async () => {
    // Central: antes de este arreglo, el error del `.delete()` se ignoraba
    // en silencio y la función siempre "resolvía bien" aunque la fila
    // quedara viva en `web_push_subscriptions`. Ahora quien llama se entera.
    mockGetSubscription.mockResolvedValue({ endpoint: 'https://push.example/abc', unsubscribe: mockUnsubscribe });
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'boom de la base' } }));

    await expect(desactivarWebPush()).rejects.toMatchObject({ message: 'boom de la base' });

    // El navegador se desuscribe igual: mejor no seguir recibiendo pushes
    // aunque la fila en la base no se haya podido borrar.
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

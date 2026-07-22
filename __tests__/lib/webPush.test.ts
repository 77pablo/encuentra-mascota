import { urlBase64ToUint8Array } from '../../src/lib/webPush';

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

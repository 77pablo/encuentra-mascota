import { DatosTarjeta } from './tarjeta';

// Solo lo que compartirTarjeta.ts toca de react-native: `Platform.OS`. Se fija
// en 'web' para poder ejercer la rama de la Web Share API sin pasar por el
// `import('expo-sharing')` dinámico de la rama nativa, que en este entorno de
// test (jest-expo sin --experimental-vm-modules) no se puede invocar.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('./aficheImage', () => ({
  capturarAfiche: jest.fn(async () => 'data:image/png;base64,aG9sYQ=='),
}));
jest.mock('./notify', () => ({
  notify: jest.fn(),
}));

import { compartirTarjeta, dataUriAFile } from './compartirTarjeta';
import { notify } from './notify';

// `nombreArchivo` ya no es una función propia de este módulo: llega armado
// dentro de `DatosTarjeta` (ver `datosDeReporte`/`datosDeAdopcion`/
// `datosDeFinalFeliz` en `./tarjeta.ts`, con sus propios tests).
function datos(over: Partial<DatosTarjeta> = {}): DatosTarjeta {
  return {
    banda: 'PERDIDA EN MAIPÚ',
    bandaColor: '#C62828',
    titulo: 'Luna',
    subtitulo: 'Perro · Quiltro',
    fotoUrl: null,
    qrUrl: 'https://encuentratumascota.app/mascota/pet-1',
    nombreArchivo: 'mascota-pet-1.png',
    ...over,
  };
}

describe('dataUriAFile', () => {
  it('arma un File con el nombre pedido, el mime del data-uri y su contenido', () => {
    // "hola" en base64 es "aG9sYQ=="
    const file = dataUriAFile('data:image/png;base64,aG9sYQ==', 'mascota-1.png');
    expect(file.name).toBe('mascota-1.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(4); // "hola" son 4 bytes
  });

  it('respeta un mime distinto de image/png si viene en el data-uri', () => {
    const file = dataUriAFile('data:image/jpeg;base64,aG9sYQ==', 'x.jpg');
    expect(file.type).toBe('image/jpeg');
  });
});

describe('compartirTarjeta — cancelación del share sheet', () => {
  const originalShare = (navigator as any).share;
  const originalCanShare = (navigator as any).canShare;

  afterEach(() => {
    jest.clearAllMocks();
    (navigator as any).share = originalShare;
    (navigator as any).canShare = originalCanShare;
  });

  it('si el usuario cancela (AbortError de navigator.share), no avisa error y devuelve "cancelada"', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(async () => {
      throw Object.assign(new Error('cancelado'), { name: 'AbortError' });
    });

    const resultado = await compartirTarjeta({}, datos());

    expect(resultado).toBe('cancelada');
    expect(notify).not.toHaveBeenCalled();
  });

  it('un error real sigue avisando "No se pudo compartir" y devuelve "error"', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(async () => {
      throw new Error('boom');
    });

    const resultado = await compartirTarjeta({}, datos());

    expect(resultado).toBe('error');
    expect(notify).toHaveBeenCalledWith('No se pudo compartir', 'Probá de nuevo en un momento.');
  });

  it('cuando todo sale bien, comparte sin avisar nada', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(async () => undefined);

    const resultado = await compartirTarjeta({}, datos());

    expect(resultado).toBe('compartida');
    expect(notify).not.toHaveBeenCalled();
  });
});

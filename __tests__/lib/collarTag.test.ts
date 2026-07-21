import {
  armarEtiquetaCollar,
  armarNombreArchivoCollar,
  collarUrl,
} from '../../src/lib/collarTag';

describe('collarUrl', () => {
  const original = process.env.EXPO_PUBLIC_WEB_URL;
  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = original;
  });

  it('arma WEB_URL + /collar/<token>', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://mascotas.app';
    expect(collarUrl('abc123')).toBe('https://mascotas.app/collar/abc123');
  });

  it('quita la barra final de la base antes de concatenar', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://mascotas.app/';
    expect(collarUrl('tok')).toBe('https://mascotas.app/collar/tok');
  });

  it('es null si no hay base configurada', () => {
    process.env.EXPO_PUBLIC_WEB_URL = '';
    expect(collarUrl('tok')).toBeNull();
  });
});

describe('armarEtiquetaCollar', () => {
  const original = process.env.EXPO_PUBLIC_WEB_URL;
  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = original;
  });

  it('arma nombre, mensaje y la URL del collar', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://mascotas.app';
    const c = armarEtiquetaCollar({ nombre: 'Pelusa', especie: 'perro', collar_token: 'tok9' });
    expect(c.nombre).toBe('Pelusa');
    expect(c.url).toBe('https://mascotas.app/collar/tok9');
    expect(c.mensaje.length).toBeGreaterThan(0);
  });

  it('url es null si no hay base configurada', () => {
    process.env.EXPO_PUBLIC_WEB_URL = '';
    const c = armarEtiquetaCollar({ nombre: 'Sol', especie: 'gato', collar_token: 'tok' });
    expect(c.url).toBeNull();
  });
});

describe('armarNombreArchivoCollar', () => {
  it('usa el nombre en slug y termina en .png', () => {
    expect(armarNombreArchivoCollar({ nombre: 'Firulais Ñandú' })).toBe('collar-firulais-nandu.png');
  });

  it('cae a "mascota" si el nombre no deja caracteres válidos', () => {
    expect(armarNombreArchivoCollar({ nombre: '🐾' })).toBe('collar-mascota.png');
  });
});

import { petUrl } from '../../src/lib/links';

describe('petUrl', () => {
  const original = process.env.EXPO_PUBLIC_WEB_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = original;
  });

  it('devuelve null si no hay EXPO_PUBLIC_WEB_URL configurada (fuera de web)', () => {
    process.env.EXPO_PUBLIC_WEB_URL = '';
    expect(petUrl('abc-123')).toBeNull();
  });

  it('arma la url del reporte a partir de EXPO_PUBLIC_WEB_URL', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://encuentra-mascota.netlify.app';
    expect(petUrl('abc-123')).toBe('https://encuentra-mascota.netlify.app/mascota/abc-123');
  });

  it('quita la barra final de EXPO_PUBLIC_WEB_URL si viene incluida', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://encuentra-mascota.netlify.app/';
    expect(petUrl('abc-123')).toBe('https://encuentra-mascota.netlify.app/mascota/abc-123');
  });
});

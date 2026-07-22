import { urlBusquedaMapa } from '../../src/lib/mapas';

describe('urlBusquedaMapa', () => {
  it('arma la URL de Google Maps con el query codificado', () => {
    const u = urlBusquedaMapa('veterinaria urgencia 24 horas');
    expect(u.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
    expect(u).toContain(encodeURIComponent('veterinaria urgencia 24 horas'));
    // Los espacios quedan codificados (no debe haber espacios crudos en la URL).
    expect(u).not.toContain(' ');
  });

  it('codifica caracteres especiales', () => {
    expect(urlBusquedaMapa('refugio & rescate')).toContain(encodeURIComponent('refugio & rescate'));
  });
});

const leer = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'PuntosCartel.tsx'),
    'utf8',
  );

describe('aviso de multas en la sección de carteles', () => {
  it('advierte la multa y da la salida (comercios / municipalidad)', () => {
    const s = leer();
    expect(s).toMatch(/puede tener multa/);
    expect(s).toMatch(/comercio/i);
    expect(s).toMatch(/municipalidad/i);
  });

  it('el aviso vive FUERA de las ramas éxito/error (se ve siempre)', () => {
    // Si Overpass falla, el consejo genérico sigue empujando a pegar carteles
    // y la advertencia igual aplica: tiene que renderizarse incondicional,
    // DESPUÉS del último bloque condicionado por `estado.fase`.
    const s = leer();
    const idxAviso = s.indexOf('puede tener multa');
    expect(idxAviso).toBeGreaterThan(-1);
    expect(s.lastIndexOf('estado.fase')).toBeLessThan(idxAviso);
  });
});

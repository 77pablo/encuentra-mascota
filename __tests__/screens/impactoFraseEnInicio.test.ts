const leer = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'screens', 'HomeScreen.tsx'),
    'utf8',
  );

describe('frase de impacto en Inicio', () => {
  it('la tarjeta usa fraseImpacto (no arma el texto a mano)', () => {
    expect(leer()).toMatch(/fraseImpacto\(/);
    expect(leer()).toMatch(/from '\.\.\/lib\/impactoFrase'/);
  });

  it('se renderiza condicional (null = no mostrar nada)', () => {
    expect(leer()).toMatch(/fraseImpactoTexto\s*\?/);
  });
});

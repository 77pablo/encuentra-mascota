const leer = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'public', 'impacto', 'index.html'),
    'utf8',
  );

describe('public/impacto/index.html', () => {
  it('NO lleva noindex (es material de prensa; el widget SÍ lo lleva)', () => {
    expect(leer()).not.toMatch(/noindex/);
    expect(leer()).toMatch(/<title>/);
    expect(leer()).toMatch(/og:title/);
  });

  it('escapa el texto de usuario (comuna) antes de inyectarlo', () => {
    expect(leer()).toMatch(/function escapar\(/);
    expect(leer()).toMatch(/escapar\(f\.comuna\)/);
  });

  it('espeja los umbrales de lib/impactoFrase (guard del espejo)', () => {
    const { MIN_PERDIDAS, MIN_REENCUENTROS } = require('../../src/lib/impactoFrase');
    expect(leer()).toContain(`var MIN_REENCUENTROS = ${MIN_REENCUENTROS};`);
    expect(leer()).toContain(`var MIN_PERDIDAS = ${MIN_PERDIDAS};`);
  });

  it('llama a las DOS RPCs como anon', () => {
    expect(leer()).toMatch(/rpc\/impacto_comunidad/);
    expect(leer()).toMatch(/rpc\/impacto_por_comuna/);
  });
});

import { armarCodigoEmbed, urlWidget } from '../../src/lib/widgetInstitucion';

describe('urlWidget', () => {
  it('arma la URL del widget con la comuna escapada', () => {
    const u = urlWidget('https://encuentras-mascota.pages.dev', 'Ñuñoa');
    expect(u).toContain('/widget/?comuna=');
    expect(u).toContain(encodeURIComponent('Ñuñoa'));
  });

  it('incluye el límite cuando se pasa', () => {
    expect(urlWidget('https://x.cl', 'Maipú', 6)).toMatch(/limite=6/);
  });

  it('una comuna con caracteres raros no rompe la query', () => {
    const u = urlWidget('https://x.cl', 'Villa "El Sol" & Co');
    expect(u).not.toContain('"');
    expect(u).not.toContain(' & ');
  });
});

describe('armarCodigoEmbed', () => {
  it('genera un iframe con la URL del widget', () => {
    const code = armarCodigoEmbed('https://encuentras-mascota.pages.dev', 'Ñuñoa');
    expect(code).toMatch(/^<iframe/);
    expect(code).toContain('/widget/?comuna=');
    expect(code).toContain(encodeURIComponent('Ñuñoa'));
    expect(code).toMatch(/<\/iframe>$/);
  });

  it('el iframe declara dimensiones y título accesible', () => {
    const code = armarCodigoEmbed('https://x.cl', 'Maipú');
    expect(code).toMatch(/width=/);
    expect(code).toMatch(/height=/);
    expect(code).toMatch(/title=/);
  });
});

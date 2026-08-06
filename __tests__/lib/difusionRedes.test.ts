import { armarTextoDifusion } from '../../src/lib/difusionRedes';

const base = {
  especie: 'perro',
  estado: 'perdida',
  comuna: 'Ñuñoa',
  nombre: 'Pelusa',
  descripcion: 'café, collar rojo',
  recompensa: 'sí',
};
const URL = 'https://encuentras-mascota.pages.dev/mascota/abc';

describe('armarTextoDifusion', () => {
  it('incluye nombre, comuna, señas y el link', () => {
    const t = armarTextoDifusion(base, URL);
    expect(t).toContain('Pelusa');
    expect(t).toContain('Ñuñoa');
    expect(t).toContain('café, collar rojo');
    expect(t).toContain(URL);
  });

  it('dice "Hay recompensa" pero NUNCA un monto', () => {
    const t = armarTextoDifusion({ ...base, recompensa: '$50.000' }, URL);
    expect(t).toMatch(/recompensa/i);
    expect(t).not.toContain('50.000');
    expect(t).not.toContain('$');
  });

  it('sin recompensa no la menciona', () => {
    expect(armarTextoDifusion({ ...base, recompensa: null }, URL)).not.toMatch(/recompensa/i);
  });

  it('nunca afirma identidad ni incluye teléfono', () => {
    const t = armarTextoDifusion(base, URL);
    expect(t).not.toMatch(/\+?56\s?9|tel[eé]fono|whatsapp/i);
    expect(t).not.toMatch(/es tu mascota|seguro que/i);
  });

  it('degrada sin nombre ni comuna sin romper', () => {
    const t = armarTextoDifusion({ especie: 'gato', estado: 'perdida' }, URL);
    expect(t).toContain(URL);
    expect(t).toMatch(/gato/i);
  });

  it('un reporte "encontrada" usa el mensaje espejo', () => {
    const t = armarTextoDifusion({ especie: 'gato', estado: 'encontrada', comuna: 'Maipú' }, URL);
    expect(t).toMatch(/encontr/i);
    expect(t).toContain('Maipú');
  });
});

import { GRUPOS, gruposSugeridos } from '../../src/data/gruposDifusion';

describe('gruposDifusion', () => {
  it('todos los grupos tienen forma válida (link real, nombre, red)', () => {
    expect(GRUPOS.length).toBeGreaterThan(0);
    for (const g of GRUPOS) {
      expect(g.url).toMatch(/^https:\/\//);
      expect(g.nombre.trim().length).toBeGreaterThan(0);
      expect(['facebook', 'whatsapp']).toContain(g.red);
    }
  });

  it('los de la comuna van primero, después los nacionales', () => {
    const sugeridos = gruposSugeridos('nacional-inexistente');
    expect(sugeridos.every((g) => g.alcance === 'nacional')).toBe(true);
    expect(sugeridos.length).toBe(GRUPOS.filter((g) => g.alcance === 'nacional').length);
  });

  it('sin comuna devuelve solo los nacionales', () => {
    expect(gruposSugeridos(null).every((g) => g.alcance === 'nacional')).toBe(true);
  });
});

import { insigniasDe } from '../../src/lib/insignias';

describe('insigniasDe', () => {
  it('sin nada alcanzado, no da insignias', () => {
    expect(insigniasDe({ reencuentros: 0, reportes: 0, aportes: 0 })).toEqual([]);
  });

  it('publicar reportes por sí solo NO da insignia', () => {
    expect(insigniasDe({ reencuentros: 0, reportes: 10, aportes: 4 })).toEqual([]);
  });

  it('1 a 4 reencuentros → "Reencuentros logrados"', () => {
    const uno = insigniasDe({ reencuentros: 1, reportes: 0, aportes: 0 });
    expect(uno).toHaveLength(1);
    expect(uno[0]).toMatchObject({ clave: 'reencuentros', icono: 'home-outline', titulo: 'Reencuentros logrados' });

    expect(insigniasDe({ reencuentros: 4, reportes: 0, aportes: 0 })[0].titulo).toBe('Reencuentros logrados');
  });

  it('5+ reencuentros → sube a "Vecino de confianza"', () => {
    const cinco = insigniasDe({ reencuentros: 5, reportes: 0, aportes: 0 });
    expect(cinco).toHaveLength(1);
    expect(cinco[0]).toMatchObject({
      clave: 'reencuentros',
      icono: 'shield-checkmark-outline',
      titulo: 'Vecino de confianza',
    });
  });

  it('5 a 19 aportes → "Colabora con el barrio"', () => {
    const cinco = insigniasDe({ reencuentros: 0, reportes: 0, aportes: 5 });
    expect(cinco).toHaveLength(1);
    expect(cinco[0]).toMatchObject({ clave: 'aportes', icono: 'people-outline', titulo: 'Colabora con el barrio' });

    expect(insigniasDe({ reencuentros: 0, reportes: 0, aportes: 19 })[0].titulo).toBe('Colabora con el barrio');
  });

  it('20+ aportes → sube a "Colaborador constante"', () => {
    const veinte = insigniasDe({ reencuentros: 0, reportes: 0, aportes: 20 });
    expect(veinte).toHaveLength(1);
    expect(veinte[0]).toMatchObject({
      clave: 'aportes',
      icono: 'ribbon-outline',
      titulo: 'Colaborador constante',
    });
  });

  it('con varias familias, reencuentros va primero y aportes después', () => {
    const ins = insigniasDe({ reencuentros: 5, reportes: 3, aportes: 20 });
    expect(ins.map((i) => i.clave)).toEqual(['reencuentros', 'aportes']);
  });

  it('cada insignia trae descripción no vacía', () => {
    const ins = insigniasDe({ reencuentros: 1, reportes: 0, aportes: 5 });
    for (const i of ins) expect(i.descripcion.length).toBeGreaterThan(0);
  });
});

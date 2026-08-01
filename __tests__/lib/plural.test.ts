// La tarjeta de impacto de Inicio mostraba "1 mascotas buscando", y peor,
// "1 encontraron familia" — un verbo en plural con un solo sujeto. Se veía en
// producción, que es donde lo pescó Pablo.
//
// El caso raro no es el 1, es el 0: en español "0 reencuentros" va en PLURAL
// (a diferencia del inglés). Por eso la regla no es "n > 1", es "n === 1".

import { pluralizar } from '../../src/lib/plural';

describe('pluralizar', () => {
  it('con 1 usa el singular', () => {
    expect(pluralizar(1, 'reencuentro', 'reencuentros')).toBe('reencuentro');
  });

  it('con 0 usa el PLURAL (en español "0 reencuentros", no "0 reencuentro")', () => {
    expect(pluralizar(0, 'reencuentro', 'reencuentros')).toBe('reencuentros');
  });

  it('con más de 1 usa el plural', () => {
    expect(pluralizar(2, 'reencuentro', 'reencuentros')).toBe('reencuentros');
    expect(pluralizar(147, 'reencuentro', 'reencuentros')).toBe('reencuentros');
  });

  it('sirve para etiquetas con verbo, que es donde peor se veía', () => {
    expect(pluralizar(1, 'encontró familia', 'encontraron familia')).toBe('encontró familia');
    expect(pluralizar(3, 'encontró familia', 'encontraron familia')).toBe('encontraron familia');
  });

  it('-1 también es singular (no deberia pasar, pero no inventa una tercera forma)', () => {
    expect(pluralizar(-1, 'aporte', 'aportes')).toBe('aporte');
  });
});

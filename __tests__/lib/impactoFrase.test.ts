import { fraseImpacto, MIN_PERDIDAS, MIN_REENCUENTROS } from '../../src/lib/impactoFrase';

describe('fraseImpacto', () => {
  it('null si la RPC es vieja (sin perdidasHistoricas)', () => {
    expect(fraseImpacto({ reencuentros: 10 })).toBeNull();
  });

  it('null bajo los umbrales (pocos datos = no decir nada)', () => {
    expect(fraseImpacto({ reencuentros: 2, perdidasHistoricas: 100, medianaDias: 3 })).toBeNull();
    expect(fraseImpacto({ reencuentros: 4, perdidasHistoricas: 4, medianaDias: 3 })).toBeNull();
  });

  it('frase completa con tasa y mediana', () => {
    expect(fraseImpacto({ reencuentros: 6, perdidasHistoricas: 10, medianaDias: 4.4 })).toBe(
      'De cada 10 perdidas, 6 ya volvieron · la mitad vuelve en ~4 días',
    );
  });

  it('sin mediana (null en SQL) muestra solo la tasa', () => {
    expect(fraseImpacto({ reencuentros: 5, perdidasHistoricas: 10, medianaDias: null })).toBe(
      'De cada 10 perdidas, 5 ya volvieron',
    );
  });

  it('con tasa que redondea a 0 muestra solo la mediana (no "0 ya volvieron")', () => {
    expect(fraseImpacto({ reencuentros: 3, perdidasHistoricas: 100, medianaDias: 6 })).toBe(
      'la mitad vuelve en ~6 días',
    );
  });

  it('la mediana nunca baja de ~1 día', () => {
    expect(fraseImpacto({ reencuentros: 5, perdidasHistoricas: 10, medianaDias: 0.2 })).toContain('~1 día');
  });

  it('umbrales exportados (los usa también /impacto)', () => {
    expect(MIN_REENCUENTROS).toBe(3);
    expect(MIN_PERDIDAS).toBe(5);
  });
});

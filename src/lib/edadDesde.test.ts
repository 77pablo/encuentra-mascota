import { edadDesde } from './edadDesde';

// Fecha base fija para que los cálculos sean estables (mismo patrón que
// cicloVida.test.ts).
const HOY = new Date('2026-07-22T12:00:00');

describe('edadDesde', () => {
  it('años y meses combinados', () => {
    // 2 años y 3 meses antes de hoy.
    expect(edadDesde('2024-04-22', HOY)).toBe('2 años y 3 meses');
  });

  it('solo años, sin meses sueltos', () => {
    expect(edadDesde('2024-07-22', HOY)).toBe('2 años');
  });

  it('solo meses (menos de un año)', () => {
    expect(edadDesde('2025-11-22', HOY)).toBe('8 meses');
  });

  it('un mes exacto, en singular', () => {
    expect(edadDesde('2026-06-22', HOY)).toBe('1 mes');
  });

  it('semanas (menos de un mes)', () => {
    // 21 días antes = 3 semanas exactas.
    expect(edadDesde('2026-07-01', HOY)).toBe('3 semanas');
  });

  it('una semana exacta, en singular', () => {
    expect(edadDesde('2026-07-15', HOY)).toBe('1 semana');
  });

  it('días sueltos (menos de una semana)', () => {
    expect(edadDesde('2026-07-20', HOY)).toBe('2 días');
  });

  it('nacida hoy mismo', () => {
    expect(edadDesde('2026-07-22', HOY)).toBe('recién nacida');
  });

  it('fecha futura devuelve null', () => {
    expect(edadDesde('2026-08-01', HOY)).toBeNull();
  });

  it('fecha inválida devuelve null', () => {
    expect(edadDesde('no-es-una-fecha', HOY)).toBeNull();
  });
});

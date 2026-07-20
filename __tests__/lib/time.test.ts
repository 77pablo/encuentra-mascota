import { timeAgo, mesAnoDe } from '../../src/lib/time';

describe('timeAgo', () => {
  const now = new Date('2026-07-17T12:00:00.000Z').getTime();

  it('devuelve "recién" para menos de 1 minuto', () => {
    expect(timeAgo(new Date(now - 30 * 1000).toISOString(), now)).toBe('recién');
    expect(timeAgo(new Date(now).toISOString(), now)).toBe('recién');
  });

  it('formatea minutos', () => {
    expect(timeAgo(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe('hace 5 min');
    expect(timeAgo(new Date(now - 59 * 60 * 1000).toISOString(), now)).toBe('hace 59 min');
  });

  it('formatea horas', () => {
    expect(timeAgo(new Date(now - 60 * 60 * 1000).toISOString(), now)).toBe('hace 1 h');
    expect(timeAgo(new Date(now - 23 * 60 * 60 * 1000).toISOString(), now)).toBe('hace 23 h');
  });

  it('formatea días en singular y plural', () => {
    expect(timeAgo(new Date(now - 24 * 60 * 60 * 1000).toISOString(), now)).toBe('hace 1 día');
    expect(timeAgo(new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe('hace 3 días');
    expect(timeAgo(new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe('hace 6 días');
  });

  it('formatea semanas en singular y plural', () => {
    expect(timeAgo(new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe('hace 1 semana');
    expect(timeAgo(new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe('hace 2 semanas');
  });

  it('formatea meses en singular y plural', () => {
    expect(timeAgo(new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe('hace 1 mes');
    expect(timeAgo(new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe('hace 2 meses');
  });
});

describe('mesAnoDe', () => {
  it('devuelve el mes en español y el año (en UTC, sin depender de Intl)', () => {
    expect(mesAnoDe('2026-07-15T12:00:00.000Z')).toBe('julio de 2026');
    expect(mesAnoDe('2025-01-02T00:00:00.000Z')).toBe('enero de 2025');
    expect(mesAnoDe('2024-12-31T23:00:00.000Z')).toBe('diciembre de 2024');
  });
});

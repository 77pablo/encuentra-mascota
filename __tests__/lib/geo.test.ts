import { distanceKm, distanceLabel } from '../../src/lib/geo';

describe('distanceKm', () => {
  it('devuelve ~0 para el mismo punto', () => {
    const p = { lat: -33.45, lng: -70.66 };
    expect(distanceKm(p, p)).toBeCloseTo(0, 5);
  });

  it('calcula la distancia entre Santiago y Valparaíso (~90-110 km)', () => {
    const santiago = { lat: -33.45, lng: -70.66 };
    const valparaiso = { lat: -33.05, lng: -71.62 };
    const km = distanceKm(santiago, valparaiso);
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(110);
  });
});

describe('distanceLabel', () => {
  it('formatea distancias menores a 1 km en metros', () => {
    expect(distanceLabel(0.85)).toBe('a 850 m');
    expect(distanceLabel(0.002)).toBe('a 2 m');
  });

  it('formatea distancias de 1 km o más en km con coma decimal', () => {
    expect(distanceLabel(2.3)).toBe('a 2,3 km');
    expect(distanceLabel(15)).toBe('a 15,0 km');
  });
});

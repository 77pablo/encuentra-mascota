import { armarQueryOverpass, parsearSemaforos } from '../../src/lib/puntosCartel';

describe('armarQueryOverpass', () => {
  it('pide semáforos alrededor del punto con el radio dado', () => {
    const q = armarQueryOverpass(-33.45, -70.66, 800);
    expect(q).toMatch(/traffic_signals/);
    expect(q).toMatch(/around:800/);
    expect(q).toContain('-33.45');
    expect(q).toContain('-70.66');
    expect(q).toMatch(/out:json/);
  });
});

describe('parsearSemaforos', () => {
  const centro = { lat: -33.45, lng: -70.66 };
  const json = {
    elements: [
      { type: 'node', id: 1, lat: -33.451, lon: -70.661 }, // ~150 m
      { type: 'node', id: 2, lat: -33.46, lon: -70.67 }, // ~1.4 km
      { type: 'node', id: 3, lat: -33.4505, lon: -70.6605 }, // ~75 m
      { type: 'node', id: 4 }, // sin coords: se ignora
    ],
  };

  it('devuelve los puntos ordenados por distancia con la distancia calculada', () => {
    const r = parsearSemaforos(json, centro);
    expect(r.length).toBe(3); // el sin coords se descarta
    expect(r[0].distanciaM).toBeLessThan(r[1].distanciaM);
    expect(r[0].distanciaM).toBeLessThan(r[2].distanciaM);
    // el más cercano es el nodo 3 (~75 m)
    expect(r[0].lat).toBeCloseTo(-33.4505, 4);
  });

  it('respeta el tope', () => {
    expect(parsearSemaforos(json, centro, 2).length).toBe(2);
  });

  it('degrada sin romper ante json basura', () => {
    expect(parsearSemaforos(null as any, centro)).toEqual([]);
    expect(parsearSemaforos({} as any, centro)).toEqual([]);
    expect(parsearSemaforos({ elements: 'x' } as any, centro)).toEqual([]);
  });
});

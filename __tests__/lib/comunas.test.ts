import { Comuna, comunaDeCoords, comunasCercanas, buscarComunas } from '../../src/lib/comunas';

// Fixture chico y controlado para probar la lógica sin depender del dataset real.
const FIX: Comuna[] = [
  { nombre: 'Santiago', region: 'Metropolitana', lat: -33.45, lng: -70.66 },
  { nombre: 'Providencia', region: 'Metropolitana', lat: -33.43, lng: -70.61 },
  { nombre: 'Maipú', region: 'Metropolitana', lat: -33.51, lng: -70.76 },
  { nombre: 'Valparaíso', region: 'Valparaíso', lat: -33.05, lng: -71.62 },
  { nombre: 'Arica', region: 'Arica y Parinacota', lat: -18.48, lng: -70.3 },
];

describe('comunaDeCoords', () => {
  it('devuelve la comuna cuyo centro está más cerca del punto', () => {
    expect(comunaDeCoords(-33.45, -70.66, FIX)?.nombre).toBe('Santiago');
    expect(comunaDeCoords(-33.05, -71.6, FIX)?.nombre).toBe('Valparaíso');
    expect(comunaDeCoords(-18.5, -70.31, FIX)?.nombre).toBe('Arica');
  });

  it('con lista vacía devuelve null', () => {
    expect(comunaDeCoords(-33.45, -70.66, [])).toBeNull();
  });

  it('funciona contra el dataset real de Chile', () => {
    // El centro de Santiago en el dataset es -33.45 / -70.6667.
    expect(comunaDeCoords(-33.45, -70.6667)?.nombre).toBe('Santiago');
  });
});

describe('comunasCercanas', () => {
  it('devuelve las N más cercanas por centro, ordenadas y sin incluirse a sí misma', () => {
    const cercanas = comunasCercanas('Santiago', 2, FIX);
    expect(cercanas.map((c) => c.nombre)).toEqual(['Providencia', 'Maipú']);
    expect(cercanas.some((c) => c.nombre === 'Santiago')).toBe(false);
  });

  it('comuna inexistente → lista vacía', () => {
    expect(comunasCercanas('Narnia', 3, FIX)).toEqual([]);
  });
});

describe('buscarComunas', () => {
  it('filtra por nombre, ignorando tildes y mayúsculas', () => {
    expect(buscarComunas('maip', FIX).map((c) => c.nombre)).toEqual(['Maipú']);
    expect(buscarComunas('VALPA', FIX).map((c) => c.nombre)).toEqual(['Valparaíso']);
    expect(buscarComunas('árica', FIX).map((c) => c.nombre)).toEqual(['Arica']);
  });

  it('query vacía devuelve toda la lista (para el selector)', () => {
    expect(buscarComunas('', FIX)).toHaveLength(FIX.length);
  });
});

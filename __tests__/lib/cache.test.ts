import { ttlCache } from '../../src/lib/cache';

describe('ttlCache', () => {
  it('devuelve null antes de guardar', () => {
    const c = ttlCache<number>(1000);
    expect(c.get()).toBeNull();
  });
  it('devuelve el valor guardado dentro del TTL', () => {
    const c = ttlCache<string>(1000, () => 500); // reloj fijo en 500ms
    c.set('hola');
    expect(c.get()).toBe('hola');
  });
  it('vence pasado el TTL', () => {
    let ahora = 0;
    const c = ttlCache<string>(1000, () => ahora);
    c.set('hola');
    ahora = 1500;
    expect(c.get()).toBeNull();
  });
  it('clear borra el valor', () => {
    const c = ttlCache<string>(1000, () => 0);
    c.set('hola');
    c.clear();
    expect(c.get()).toBeNull();
  });
});

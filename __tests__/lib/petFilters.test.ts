import { desdeDeRango } from '../../src/lib/petFilters';

// El filtrado por recompensa y por rango vive ahora en la base (migración 0014).
// Lo único que queda del lado del cliente es traducir la opción elegida a la
// fecha "desde", así que eso es lo que probamos.
const AHORA = new Date('2026-07-18T12:00:00Z').getTime();

describe('desdeDeRango', () => {
  it('devuelve null para "todo" (sin límite de fecha)', () => {
    expect(desdeDeRango('todo', AHORA)).toBeNull();
  });

  it('"hoy" son las últimas 24 horas', () => {
    expect(desdeDeRango('hoy', AHORA)?.toISOString()).toBe('2026-07-17T12:00:00.000Z');
  });

  it('"semana" son los últimos 7 días', () => {
    expect(desdeDeRango('semana', AHORA)?.toISOString()).toBe('2026-07-11T12:00:00.000Z');
  });

  it('no depende del reloj real: el mismo `now` da el mismo resultado', () => {
    expect(desdeDeRango('hoy', AHORA)?.getTime()).toBe(desdeDeRango('hoy', AHORA)?.getTime());
  });
});

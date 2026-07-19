import { idAleatorio } from '../../src/lib/idAleatorio';

describe('idAleatorio', () => {
  it('devuelve 32 caracteres hexadecimales', () => {
    expect(idAleatorio()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('no repite (1000 tiradas, todas distintas)', () => {
    const vistos = new Set(Array.from({ length: 1000 }, () => idAleatorio()));
    expect(vistos.size).toBe(1000);
  });
});

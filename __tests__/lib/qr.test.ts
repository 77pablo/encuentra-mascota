import { qrMatrix } from '../../src/lib/qr';

describe('qrMatrix', () => {
  it('devuelve una matriz cuadrada no vacía', () => {
    const m = qrMatrix('https://mascotas.app/mascota/abc');
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((row) => row.length === m.length)).toBe(true);
  });

  it('es determinista para el mismo valor', () => {
    expect(qrMatrix('hola')).toEqual(qrMatrix('hola'));
  });

  it('cambia con valores distintos', () => {
    expect(qrMatrix('a')).not.toEqual(qrMatrix('b'));
  });

  it('contiene módulos oscuros y claros', () => {
    const flat = qrMatrix('test').flat();
    expect(flat).toContain(true);
    expect(flat).toContain(false);
  });
});

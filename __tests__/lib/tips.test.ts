import { validarTip, ordenarTips, puedeBorrarTip, firmaAutor, TIP_MAX, Tip } from '../../src/lib/tips';

const tip = (over: Partial<Tip> = {}): Tip => ({
  id: 't1', petId: 'p1', userId: 'autor', texto: 'lo vi', creadoEn: '2026-07-18T10:00:00Z', ...over,
});

describe('validarTip', () => {
  it('rechaza el texto vacío', () => {
    expect(validarTip('   ')).toEqual({ ok: false, error: expect.any(String) });
  });
  it('recorta los espacios de los bordes', () => {
    expect(validarTip('  lo vi cerca  ')).toEqual({ ok: true, texto: 'lo vi cerca' });
  });
  it('rechaza el texto más largo que el máximo', () => {
    expect(validarTip('a'.repeat(TIP_MAX + 1)).ok).toBe(false);
  });
  it('acepta el texto justo en el máximo', () => {
    expect(validarTip('a'.repeat(TIP_MAX)).ok).toBe(true);
  });
});

describe('ordenarTips', () => {
  it('deja las más nuevas primero', () => {
    const viejo = tip({ id: 'viejo', creadoEn: '2026-07-01T10:00:00Z' });
    const nuevo = tip({ id: 'nuevo', creadoEn: '2026-07-18T10:00:00Z' });
    expect(ordenarTips([viejo, nuevo]).map((t) => t.id)).toEqual(['nuevo', 'viejo']);
  });
  it('no muta el arreglo original', () => {
    const arr = [tip({ id: 'a' }), tip({ id: 'b', creadoEn: '2026-07-19T10:00:00Z' })];
    ordenarTips(arr);
    expect(arr.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('puedeBorrarTip', () => {
  it('deja borrar al autor', () => {
    expect(puedeBorrarTip(tip(), 'autor', 'dueno')).toBe(true);
  });
  it('deja borrar al dueño del reporte', () => {
    expect(puedeBorrarTip(tip(), 'dueno', 'dueno')).toBe(true);
  });
  it('no deja borrar a un tercero', () => {
    expect(puedeBorrarTip(tip(), 'otro', 'dueno')).toBe(false);
  });
  it('no deja borrar a un invitado', () => {
    expect(puedeBorrarTip(tip(), null, 'dueno')).toBe(false);
  });
});

describe('firmaAutor', () => {
  it('usa el nombre cuando lo hay', () => {
    expect(firmaAutor('Ana')).toBe('Ana');
  });
  it('firma como vecino cuando no hay nombre', () => {
    expect(firmaAutor(null)).toBe('Un vecino');
  });
});

describe('firmaAutor con cuentas eliminadas', () => {
  it('firma "Un vecino" cuando el autor borro su cuenta', () => {
    // En las pistas no interesa quien fue, interesa el dato: la pista sigue
    // sirviendole a quien busca su mascota.
    expect(firmaAutor('Cuenta eliminada', '2026-07-19T00:00:00Z')).toBe('Un vecino');
  });

  it('sigue firmando con el nombre cuando la cuenta vive', () => {
    expect(firmaAutor('Ana', null)).toBe('Ana');
  });

  it('mantiene el comportamiento viejo sin el segundo parametro', () => {
    expect(firmaAutor('Ana')).toBe('Ana');
    expect(firmaAutor(null)).toBe('Un vecino');
  });
});

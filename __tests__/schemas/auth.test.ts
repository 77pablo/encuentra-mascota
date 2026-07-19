import { loginSchema, registerSchema } from '../../src/schemas/auth';

describe('loginSchema', () => {
  it('acepta email y password válidos', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123456' }).success).toBe(true);
  });
  it('rechaza email inválido', () => {
    expect(loginSchema.safeParse({ email: 'no-es-email', password: '123456' }).success).toBe(false);
  });
  it('rechaza password corta', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('exige nombre no vacío', () => {
    expect(
      registerSchema.safeParse({ nombre: '', email: 'a@b.com', password: '123456' }).success,
    ).toBe(false);
  });
});

// Google Play exige que el usuario acepte los Terminos ANTES de poder publicar
// contenido, y no acepta el "al continuar aceptas..." en letra chica: tiene que
// ser un acto explicito. Lo validamos en el schema y no solo en la pantalla,
// para que ningun camino de registro se lo pueda saltar.
describe('registerSchema — aceptacion de los terminos', () => {
  const base = { nombre: 'Pablo', email: 'a@b.com', password: '123456' };

  it('acepta el registro cuando la casilla esta marcada', () => {
    expect(registerSchema.safeParse({ ...base, aceptaTerminos: true }).success).toBe(true);
  });

  it('rechaza el registro con la casilla sin marcar', () => {
    expect(registerSchema.safeParse({ ...base, aceptaTerminos: false }).success).toBe(false);
  });

  it('rechaza el registro si ni siquiera viene el campo', () => {
    expect(registerSchema.safeParse(base).success).toBe(false);
  });

  it('explica en espanol por que no se puede continuar', () => {
    const r = registerSchema.safeParse({ ...base, aceptaTerminos: false });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/t[eé]rminos/i);
    }
  });
});

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

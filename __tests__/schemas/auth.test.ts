import { calcularEdad, EDAD_MINIMA, loginSchema, registerSchema } from '../../src/schemas/auth';

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
  // fechaNacimiento valida y "adulta" para aislar lo que prueba este bloque:
  // la aceptacion de terminos, no la edad.
  const base = { nombre: 'Pablo', email: 'a@b.com', password: '123456', fechaNacimiento: '1990-01-01' };

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

// La edad se calcula a partir de la fecha de nacimiento real, no de una
// casilla "soy mayor de 14". Se prueba con `hoy` inyectado para no depender
// del reloj del sistema en los casos de borde.
describe('calcularEdad', () => {
  const hoy = new Date(2026, 6, 20); // 20-jul-2026 (mes 0-indexado)

  it('cuenta los años cumplidos', () => {
    expect(calcularEdad('2000-07-20', hoy)).toBe(26);
  });

  it('resta un año si todavia no cumple este año', () => {
    expect(calcularEdad('2000-07-21', hoy)).toBe(25);
  });

  it('cuenta el año el mismo dia del cumpleaños', () => {
    expect(calcularEdad('2012-07-20', hoy)).toBe(14);
  });

  it('devuelve null para una fecha que no existe (30 de febrero)', () => {
    expect(calcularEdad('2010-02-30', hoy)).toBeNull();
  });

  it('devuelve null para una fecha mal formada o vacia', () => {
    expect(calcularEdad('20-7-2010', hoy)).toBeNull();
    expect(calcularEdad('', hoy)).toBeNull();
    expect(calcularEdad('holaaa', hoy)).toBeNull();
  });

  it('devuelve null para una fecha futura', () => {
    expect(calcularEdad('2030-01-01', hoy)).toBeNull();
  });

  it('no acepta un año de dos digitos', () => {
    expect(calcularEdad('05-01-01', hoy)).toBeNull();
  });
});

// El corte de edad va en el SCHEMA (no solo en la pantalla) para que ningun
// camino de registro pueda saltearselo, igual que `aceptaTerminos`. Si el que
// se registra tiene menos de 14, el parseo falla y no se guarda nada.
describe('registerSchema — control de edad minima', () => {
  const base = {
    nombre: 'Pablo',
    email: 'a@b.com',
    password: '123456',
    aceptaTerminos: true,
  };
  const anioActual = new Date().getFullYear();

  it('EDAD_MINIMA es 14 (corte niño/adolescente de la ley chilena, no 13 ni 18)', () => {
    expect(EDAD_MINIMA).toBe(14);
  });

  it('acepta a alguien claramente mayor de 14', () => {
    expect(registerSchema.safeParse({ ...base, fechaNacimiento: '1990-05-10' }).success).toBe(true);
  });

  it('rechaza a un menor de 14', () => {
    const fechaNacimiento = `${anioActual - 5}-01-01`;
    expect(registerSchema.safeParse({ ...base, fechaNacimiento }).success).toBe(false);
  });

  it('rechaza si ni siquiera viene la fecha', () => {
    expect(registerSchema.safeParse(base).success).toBe(false);
  });

  it('rechaza una fecha invalida', () => {
    expect(
      registerSchema.safeParse({ ...base, fechaNacimiento: '2010-02-30' }).success,
    ).toBe(false);
  });

  it('explica en espanol el corte de 14 años, sin el "Invalid input" de zod', () => {
    const fechaNacimiento = `${anioActual - 10}-01-01`;
    const r = registerSchema.safeParse({ ...base, fechaNacimiento });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/14 años/);
      expect(r.error.issues[0].message).not.toMatch(/Invalid/i);
    }
  });
});

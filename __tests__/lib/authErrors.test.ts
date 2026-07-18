import { mensajeDeErrorAuth, MENSAJE_GENERICO } from '../../src/lib/authErrors';

describe('mensajeDeErrorAuth', () => {
  it('traduce el correo ya registrado y sugiere qué hacer', () => {
    const m = mensajeDeErrorAuth({ message: 'User already registered' });
    expect(m).toContain('ya está vinculado a una cuenta');
    expect(m).toContain('Iniciá sesión');
  });

  it('traduce las credenciales inválidas', () => {
    expect(mensajeDeErrorAuth({ message: 'Invalid login credentials' })).toContain('no coinciden');
  });

  it('no distingue mayúsculas', () => {
    expect(mensajeDeErrorAuth({ message: 'USER ALREADY REGISTERED' })).toContain('ya está vinculado a una cuenta');
  });

  it('reconoce el mensaje aunque traiga datos en el medio', () => {
    const m = mensajeDeErrorAuth({
      message: 'For security purposes, you can only request this after 47 seconds.',
    });
    expect(m).toContain('Esperá unos segundos');
  });

  it('acepta un string suelto', () => {
    expect(mensajeDeErrorAuth('Invalid login credentials')).toContain('no coinciden');
  });

  it('traduce la contraseña corta', () => {
    expect(mensajeDeErrorAuth({ message: 'Password should be at least 6 characters' })).toContain(
      'muy corta',
    );
  });

  it('traduce el enlace vencido', () => {
    expect(mensajeDeErrorAuth({ message: 'Token has expired or is invalid' })).toContain('venció');
  });

  it('traduce la caída de red', () => {
    expect(mensajeDeErrorAuth({ message: 'Failed to fetch' })).toContain('internet');
  });

  it('NUNCA devuelve el texto crudo en inglés cuando no lo reconoce', () => {
    const m = mensajeDeErrorAuth({ message: 'Some brand new upstream failure' });
    expect(m).toBe(MENSAJE_GENERICO);
    expect(m).not.toContain('upstream');
  });

  it('aguanta null, undefined y objetos raros', () => {
    expect(mensajeDeErrorAuth(null)).toBe(MENSAJE_GENERICO);
    expect(mensajeDeErrorAuth(undefined)).toBe(MENSAJE_GENERICO);
    expect(mensajeDeErrorAuth({})).toBe(MENSAJE_GENERICO);
    expect(mensajeDeErrorAuth({ message: null })).toBe(MENSAJE_GENERICO);
  });
});

import { nombreDeAutor } from '../../src/lib/cuentaEliminada';

describe('nombreDeAutor', () => {
  it('muestra el nombre cuando la cuenta esta viva', () => {
    expect(nombreDeAutor('Ana', null)).toBe('Ana');
  });

  it('dice "Cuenta eliminada" cuando la cuenta se borro', () => {
    // Aunque la lapida guarde un nombre, mandamos nosotros.
    expect(nombreDeAutor('Cuenta eliminada', '2026-07-19T00:00:00Z')).toBe('Cuenta eliminada');
    expect(nombreDeAutor('Ana', '2026-07-19T00:00:00Z')).toBe('Cuenta eliminada');
  });

  it('cae en "Usuario" cuando no hay nombre y la cuenta vive', () => {
    // Es el fallback que ya usaba listConversations.
    expect(nombreDeAutor(null, null)).toBe('Usuario');
    expect(nombreDeAutor('   ', null)).toBe('Usuario');
  });
});

import { mensajeDeErrorDb, ErrorAmigable } from '../dbErrors';

describe('mensajeDeErrorDb', () => {
  it('debería traducir error de CHECK de comuna guardada', () => {
    // Simula el error que devuelve Postgres
    const errorPostgres = new Error(
      'new row for relation "busquedas_guardadas" violates check constraint "busquedas_guardadas_comuna_largo"'
    );

    const mensaje = mensajeDeErrorDb(errorPostgres);

    // No debe ser el mensaje genérico
    expect(mensaje).not.toBe('Algo no salió bien. Probá de nuevo en un momento.');
    // Debe ser un mensaje específico sobre la comuna
    expect(mensaje).toBe('La comuna es muy larga (máximo 80 caracteres).');
  });

  it('debería reconocer restricción busquedas_guardadas_comuna_largo', () => {
    const crudo = 'violates check constraint "busquedas_guardadas_comuna_largo"';
    const mensaje = mensajeDeErrorDb(crudo);

    expect(mensaje).not.toBe('Algo no salió bien. Probá de nuevo en un momento.');
    expect(mensaje).toContain('comuna');
  });

  it('debería mantener el mensaje amigable si ya es ErrorAmigable', () => {
    const error = new ErrorAmigable('Este es un error redactado para el usuario');
    const mensaje = mensajeDeErrorDb(error);
    expect(mensaje).toBe('Este es un error redactado para el usuario');
  });
});

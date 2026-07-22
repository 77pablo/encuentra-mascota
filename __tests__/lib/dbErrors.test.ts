import { mensajeDeErrorDb, MENSAJE_GENERICO_DB } from '../../src/lib/dbErrors';

// Mensaje real que devuelve Postgres cuando salta una restricción CHECK.
const violacion = (restriccion: string) => ({
  message: `new row for relation "pets" violates check constraint "${restriccion}"`,
  code: '23514',
});

describe('mensajeDeErrorDb', () => {
  it('traduce la descripción demasiado larga y dice el límite', () => {
    const m = mensajeDeErrorDb(violacion('pets_descripcion_largo'));
    expect(m).toContain('descripción es muy larga');
    expect(m).toContain('1.000');
  });

  it('traduce el tope de fotos', () => {
    expect(mensajeDeErrorDb(violacion('pets_fotos_cantidad'))).toContain('hasta 4 fotos');
  });

  it('traduce la pista demasiado larga', () => {
    expect(mensajeDeErrorDb(violacion('pet_tips_texto_largo'))).toContain('500');
  });

  it('traduce coordenadas fuera de rango a algo accionable', () => {
    expect(mensajeDeErrorDb(violacion('pets_lat_rango'))).toContain('marcar el punto');
  });

  it('traduce el anti-spam de publicaciones', () => {
    expect(
      mensajeDeErrorDb({ message: 'Alcanzaste el límite de publicaciones por ahora.' }),
    ).toContain('límite de publicaciones');
  });

  it('traduce el rechazo de RLS sin explicar la política', () => {
    const m = mensajeDeErrorDb({
      message: 'new row violates row-level security policy for table "pets"',
    });
    expect(m).toBe('No tenés permiso para hacer eso.');
    expect(m).not.toContain('row-level');
  });

  it('traduce la caída de red', () => {
    expect(mensajeDeErrorDb({ message: 'TypeError: Failed to fetch' })).toContain('internet');
  });

  it('NUNCA devuelve el texto crudo cuando no lo reconoce', () => {
    const m = mensajeDeErrorDb({ message: 'ERROR: relation "xyz" does not exist' });
    expect(m).toBe(MENSAJE_GENERICO_DB);
    expect(m).not.toContain('relation');
  });

  it('aguanta null, undefined y objetos raros', () => {
    expect(mensajeDeErrorDb(null)).toBe(MENSAJE_GENERICO_DB);
    expect(mensajeDeErrorDb(undefined)).toBe(MENSAJE_GENERICO_DB);
    expect(mensajeDeErrorDb({})).toBe(MENSAJE_GENERICO_DB);
  });

  it('acepta un string suelto', () => {
    expect(mensajeDeErrorDb('duplicate key value violates unique constraint')).toBe(
      'Eso ya estaba registrado.',
    );
  });

  it('traduce el largo máximo de comuna guardada (patrón 0016)', () => {
    const m = mensajeDeErrorDb({
      message: 'new row for relation "busquedas_guardadas" violates check constraint "busquedas_guardadas_comuna_largo"',
    });
    expect(m).toBe('La comuna es muy larga (máximo 80 caracteres).');
  });
});

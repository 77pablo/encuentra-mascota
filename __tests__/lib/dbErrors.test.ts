import {
  esMigracionSinAplicar,
  mensajeDeErrorDb,
  MENSAJE_GENERICO_DB,
} from '../../src/lib/dbErrors';

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

  it('traduce la pregunta de adopción demasiado larga y dice el límite', () => {
    const m = mensajeDeErrorDb(violacion('adoption_questions_pregunta_largo'));
    expect(m).toContain('500');
  });

  it('traduce la respuesta de adopción demasiado larga y dice el límite', () => {
    const m = mensajeDeErrorDb(violacion('adoption_questions_respuesta_largo'));
    expect(m).toContain('1.000');
  });

  it('traduce la fecha de nacimiento del carnet fuera de rango', () => {
    const m = mensajeDeErrorDb(violacion('my_pets_nacimiento_rango'));
    expect(m).toContain('fecha de nacimiento');
  });

  it('traduce la próxima vacuna del carnet fuera de rango', () => {
    const m = mensajeDeErrorDb(violacion('my_pets_vacuna_rango'));
    expect(m).toContain('vacuna');
  });

  it('traduce el próximo antiparasitario interno fuera de rango', () => {
    const m = mensajeDeErrorDb(violacion('my_pets_antiint_rango'));
    expect(m).toContain('antiparasitario');
  });

  it('traduce el próximo antiparasitario externo fuera de rango', () => {
    const m = mensajeDeErrorDb(violacion('my_pets_antiext_rango'));
    expect(m).toContain('antiparasitario');
  });

  it('traduce la búsqueda guardada duplicada (índice único 0031)', () => {
    const m = mensajeDeErrorDb({
      message: 'duplicate key value violates unique constraint "busquedas_guardadas_unicas"',
      code: '23505',
    });
    expect(m).toBe('Ya tenés guardada esa búsqueda.');
  });
});

// ------------------------------------------------------------
// 42501 con contexto: el rechazo por bloqueo (RLS de la 0022)
// ------------------------------------------------------------
describe('permiso denegado al mandar un mensaje', () => {
  // Lo que devuelve PostgREST cuando la policy de insert de `messages` rechaza
  // (te bloqueó, la bloqueaste, o borró la cuenta: los tres dan lo mismo).
  const rls = {
    code: '42501',
    message: 'new row violates row-level security policy for table "messages"',
  };

  it('con contexto "mensaje" da un texto propio y accionable', () => {
    const m = mensajeDeErrorDb(rls, 'mensaje');
    expect(m).toBe('No se pudo enviar el mensaje a esta persona.');
  });

  it('NUNCA revela que alguien te bloqueó', () => {
    const m = mensajeDeErrorDb(rls, 'mensaje').toLowerCase();
    // Ese dato es privado de quien bloquea: decirlo confirma el bloqueo y arma
    // al acosador (ver el comentario largo de la migración 0022).
    for (const filtracion of ['bloque', 'blocked', 'eliminó', 'borró la cuenta', 'row-level']) {
      expect(m).not.toContain(filtracion);
    }
  });

  it('reconoce el rechazo aunque venga sin código, solo por el texto', () => {
    const m = mensajeDeErrorDb({ message: 'permission denied for table messages' }, 'mensaje');
    expect(m).toBe('No se pudo enviar el mensaje a esta persona.');
  });

  it('SIN contexto se comporta igual que siempre (no se pisa el resto de la app)', () => {
    // Borrar una pista ajena también da 42501, y ahí "No tenés permiso" es lo
    // correcto: el texto del mensaje no tiene nada que ver con esa pantalla.
    expect(mensajeDeErrorDb(rls)).toBe('No tenés permiso para hacer eso.');
  });

  it('el contexto no secuestra errores que no son de permisos', () => {
    const m = mensajeDeErrorDb(
      { code: '23514', message: 'violates check constraint "messages_texto_o_imagen"' },
      'mensaje',
    );
    expect(m).toContain('muy largo');
  });

  it('un error sin nada reconocible sigue cayendo en el genérico', () => {
    expect(mensajeDeErrorDb({ message: 'algo rarísimo' }, 'mensaje')).toBe(MENSAJE_GENERICO_DB);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ¿LA MIGRACIÓN TODAVÍA NO ESTÁ APLICADA?
//
// Los códigos de abajo NO están inventados: se comprobaron contra el PostgREST
// del proyecto real de producción (1-ago-2026), pidiéndole una tabla y una
// función que no existen:
//
//   GET  /rest/v1/cuadrillas?select=id           → 404
//        {"code":"PGRST205","message":"Could not find the table
//         'public.cuadrillas' in the schema cache"}
//   POST /rest/v1/rpc/cuadrilla_por_invitacion   → 404
//        {"code":"PGRST202","message":"Could not find the function
//         public.cuadrilla_por_invitacion(p_token) in the schema cache"}
// ───────────────────────────────────────────────────────────────────────────
describe('esMigracionSinAplicar', () => {
  it('reconoce una TABLA que todavía no existe (PGRST205, medido en producción)', () => {
    expect(
      esMigracionSinAplicar({
        code: 'PGRST205',
        message: "Could not find the table 'public.cuadrillas' in the schema cache",
      }),
    ).toBe(true);
  });

  it('reconoce una FUNCIÓN que todavía no existe (PGRST202, medido en producción)', () => {
    expect(
      esMigracionSinAplicar({
        code: 'PGRST202',
        message: 'Could not find the function public.crear_cuadrilla(p_pet_id) in the schema cache',
      }),
    ).toBe(true);
  });

  it('reconoce también los códigos crudos de Postgres', () => {
    // Los devuelve la base cuando la consulta no pasa por el schema cache de
    // PostgREST (por ejemplo desde adentro de otra función).
    expect(esMigracionSinAplicar({ code: '42P01' })).toBe(true); // undefined_table
    expect(esMigracionSinAplicar({ code: '42883' })).toBe(true); // undefined_function
  });

  it('un corte de red NO es una migración sin aplicar', () => {
    // Este es EL error del helper si se escribe de más: con `catch → true`, un
    // wifi caído haría desaparecer la sección en silencio y la persona nunca
    // sabría que hay algo que reintentar.
    expect(esMigracionSinAplicar({ message: 'Failed to fetch' })).toBe(false);
    expect(esMigracionSinAplicar(new TypeError('Network request failed'))).toBe(false);
  });

  it('un rechazo de permisos tampoco lo es', () => {
    // La tabla existe y la RLS dijo que no. Tragárselo esconde un bug de RLS.
    expect(esMigracionSinAplicar({ code: '42501', message: 'row-level security' })).toBe(false);
  });

  it('una COLUMNA que falta NO cuenta como migración sin aplicar', () => {
    // La trampa de PostgREST: pedir una columna nueva junto a las viejas hace
    // fallar la consulta ENTERA (400 + 42703, medido en producción), no
    // devuelve datos parciales. Si este helper lo tapara, romper una consulta
    // existente se vería como "la función nueva no está desplegada" y nadie se
    // enteraría de que la ficha del reporte dejó de cargar.
    expect(
      esMigracionSinAplicar({ code: '42703', message: 'column pets.cuadrilla_id does not exist' }),
    ).toBe(false);
  });

  it('no explota con basura', () => {
    expect(esMigracionSinAplicar(null)).toBe(false);
    expect(esMigracionSinAplicar(undefined)).toBe(false);
    expect(esMigracionSinAplicar('PGRST205')).toBe(false);
    expect(esMigracionSinAplicar({})).toBe(false);
  });
});

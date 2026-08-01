import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0049 — CIERRE DE CASOS.
//
// No prueba la base real (es un archivo de texto): ata las decisiones que, si
// alguien las afloja al editar el SQL, no se notan hasta que ya hay datos mal
// contados. Las dos mas caras estan en el primer describe: "aparecio" tiene que
// REGISTRAR EL REENCUENTRO (no solo cerrar) y "sigo buscando" tiene que RENOVAR.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(DIR, '0049_cierre_casos.sql'), 'utf8');

// Las aserciones corren sobre el CODIGO: el archivo explica en prosa lo mismo
// que verifica, asi que buscar sobre el texto crudo da falsos positivos.
const codigo = sql.replace(/--[^\n]*/g, '');

function cuerpoDe(nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}`);
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('as $$', idx);
  expect(abre).toBeGreaterThan(idx);
  const cierra = codigo.indexOf('$$;', abre + 5);
  expect(cierra).toBeGreaterThan(abre);
  return codigo.slice(abre + 5, cierra);
}

/** El `set ... where ...` del unico update de la funcion, sin comentarios. */
function setDeResponderEstado(): string {
  const cuerpo = cuerpoDe('responder_estado');
  const abre = cuerpo.indexOf('update public.pets');
  expect(abre).toBeGreaterThanOrEqual(0);
  const cierra = cuerpo.indexOf(';', abre);
  expect(cierra).toBeGreaterThan(abre);
  return cuerpo.slice(abre, cierra).replace(/\s+/g, ' ');
}

describe('el parser lee el SQL de verdad (si no, todo lo de abajo pasa por vacio)', () => {
  it('encuentra la funcion y su update', () => {
    expect(cuerpoDe('responder_estado').length).toBeGreaterThan(200);
    expect(setDeResponderEstado()).toContain('update public.pets set');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LO MAS IMPORTANTE DEL ARCHIVO
// ───────────────────────────────────────────────────────────────────────────
describe('que la respuesta signifique lo que dice', () => {
  const set = setDeResponderEstado();

  it('"aparecio" escribe reunida_en, no solo activo=false', () => {
    // EL BUG DE LA TANDA 9, literal: cerrar sin `reunida_en` deja el
    // reencuentro fuera del contador de Inicio (countReunidas), de
    // `impacto_comunidad` (0039) y de la galeria "Volvieron a casa"
    // (listFinalesFelices) — los tres filtran por `reunida_en is not null`.
    // O sea: la funcion cuya razon de ser es MEDIR reencuentros no mediria
    // ninguno.
    expect(set).toMatch(
      /reunida_en = case when p_respuesta = 'aparecio' then coalesce\(reunida_en, now\(\)\) else reunida_en end/,
    );
  });

  it('"sigo buscando" es lo unico que NO cierra el reporte', () => {
    expect(set).toMatch(
      /activo = case when p_respuesta = 'sigo_buscando' then activo else false end/,
    );
  });

  it('"sigo buscando" RENUEVA la vigencia', () => {
    // La persona acaba de confirmar a mano que el reporte esta vivo. Sin tocar
    // `renovado_en`, el auto-archivado de la 0028 se lo saca igual de las
    // busquedas a los 45 dias de PUBLICADO, o sea al dia siguiente de haber
    // dicho "sigo buscandola".
    expect(set).toMatch(
      /renovado_en = case when p_respuesta = 'sigo_buscando' then now\(\) else renovado_en end/,
    );
  });

  it('siempre deja constancia de cuando y de que se respondio', () => {
    // `preguntado_en` es lo que evita repetir el mismo hito, y `cierre_motivo`
    // lo que distingue "volvio" de "me cansE de buscar".
    expect(set).toContain('preguntado_en = now()');
    expect(set).toContain('cierre_motivo = p_respuesta');
  });
});

describe('de quien es el reporte lo decide el servidor', () => {
  const cuerpo = cuerpoDe('responder_estado');

  it('el dueño sale de auth.uid() y NO de un parametro', () => {
    // Si el id del usuario fuera un argumento, cualquiera cerraria el reporte
    // de otra persona. Mismo patron que `mi_perfil()`.
    expect(setDeResponderEstado()).toContain('user_id = auth.uid()');
    const firma = codigo.slice(
      codigo.indexOf('function public.responder_estado'),
      codigo.indexOf('returns void'),
    );
    expect(firma).not.toMatch(/uuid[\s\S]*uuid/); // un solo uuid: el del reporte
    expect(firma).not.toContain('user');
  });

  it('exige sesion', () => {
    expect(cuerpo).toContain('auth.uid() is null');
  });

  it('si no actualizo ninguna fila, LANZA', () => {
    // La forma del bug de la 0017: responder sobre un reporte ajeno o
    // inexistente devolvia exito habiendo hecho cero, y la app decia "listo".
    expect(cuerpo).toMatch(/if not found then\s*raise exception/);
  });

  it('valida la respuesta ANTES de tocar nada', () => {
    // El CHECK de la columna protege la tabla; esto protege las ramas `case`.
    // Un valor desconocido caeria en el `else` y cerraria el reporte sin que
    // nadie lo haya pedido.
    const validacion = cuerpo.indexOf("p_respuesta not in ('aparecio', 'sigo_buscando', 'ya_no_busco')");
    expect(validacion).toBeGreaterThanOrEqual(0);
    expect(validacion).toBeLessThan(cuerpo.indexOf('update public.pets'));
    expect(cuerpo.slice(validacion)).toContain('raise exception');
  });

  it('esta cerrada, con search_path fijo, y anon no la puede llamar', () => {
    expect(codigo).toContain('security definer');
    expect(codigo).toContain('set search_path = public, pg_temp');
    expect(codigo).toContain(
      'revoke all on function public.responder_estado(uuid, text) from public, anon;',
    );
    expect(codigo).toContain(
      'grant execute on function public.responder_estado(uuid, text) to authenticated;',
    );
    expect(codigo).not.toMatch(/grant execute on function public\.responder_estado\(uuid, text\) to [^;]*anon/);
  });
});

describe('las columnas nuevas', () => {
  it('las dos son nullable y se agregan con `if not exists`', () => {
    // Nullable: una columna `not null` sobre una tabla con datos exige un
    // default y reescribe la tabla entera. Y `if not exists` para que correr la
    // migracion dos veces no sea un incidente.
    for (const col of ['preguntado_en timestamptz', 'cierre_motivo text']) {
      expect(codigo).toContain(`alter table public.pets add column if not exists ${col}`);
    }
    expect(codigo).not.toMatch(/add column[^;]*not null/);
  });

  it('cierre_motivo solo acepta los tres motivos que existen', () => {
    expect(codigo).toMatch(
      /constraint pets_cierre_motivo\s*check \(cierre_motivo is null or cierre_motivo in \('aparecio', 'sigo_buscando', 'ya_no_busco'\)\)/,
    );
  });
});

describe('0049 no puede romper NADA de lo que ya existe', () => {
  it('no redefine ni borra nada de las migraciones anteriores', () => {
    // Recrear "de paso" una funcion vecina es como se revirtieron arreglos en
    // tandas anteriores sin que nadie se enterara.
    expect(codigo).not.toMatch(/\bdrop (table|policy|function|trigger|column)\b/i);
    expect(codigo).not.toMatch(/\bcreate (or replace )?(table|policy|trigger)\b/i);
    const funciones = [...codigo.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
    expect(funciones).toEqual(['responder_estado']);
  });

  it('no reescribe filas existentes: nada de UPDATE ni DELETE sueltos', () => {
    // El unico `update public.pets` legal es el de adentro de la funcion, que
    // toca UNA fila del que llama. Un backfill acá (por ejemplo poner
    // `cierre_motivo` en los ya cerrados) inventaria reencuentros que nadie
    // confirmo, que es justo el dato que esta funcion existe para no falsear.
    expect(codigo).not.toMatch(/\bdelete from\b/i);
    const updates = [...codigo.matchAll(/update public\.\w+/g)];
    expect(updates.length).toBe(1);
    expect(cuerpoDe('responder_estado')).toContain(updates[0][0]);
  });

  it('no toca la cola de avisos ni su Edge Function', () => {
    // Fuera de alcance en esta tanda: no hay redeploy del dispatcher, asi que
    // encolar un evento aca lo dejaria sin enviar y sin que nadie se entere.
    expect(codigo).not.toContain('notification_events');
    expect(codigo).not.toContain('enqueue_');
  });

  it('las dos columnas llevan un nombre que no puede chocar con otra tanda', () => {
    const nuevas = [...codigo.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1]);
    expect(nuevas).toEqual(['preguntado_en', 'cierre_motivo']);
  });
});

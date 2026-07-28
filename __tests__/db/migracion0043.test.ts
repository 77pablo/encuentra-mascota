import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0043 (diferido I-2: retirar un mensaje
// tambien borra su foto del bucket).
//
// La migracion no esta aplicada a Supabase todavia (es un paso aparte,
// supervisado), asi que esto no puede probar la base real. Lo que SI puede
// atar, y es lo que hace dano si se rompe, son las tres propiedades que
// convierten a este cambio en seguro:
//   1) la ruta se DERIVA del mensaje, filtrada por el uid del autor;
//   2) todo lo que toca la cola pasa por `es_admin()`;
//   3) la cola no se cierra sola: sobrevive a un fallo de Storage (reintento).
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(DIR, '0043_moderacion_borrar_foto.sql'), 'utf8');
const sql0040 = readFileSync(join(DIR, '0040_moderacion_rpc.sql'), 'utf8');

// Las aserciones corren sobre el CODIGO: los comentarios de este archivo
// nombran a proposito cosas ("no acepta rutas del cliente") que darian falsos
// positivos si se buscaran sobre el texto crudo.
const codigo = sql.replace(/--[^\n]*/g, '');

// Cuerpo de una funcion, de su `create` hasta el `$$;` que la cierra.
function cuerpo(fuente: string, nombre: string): string {
  const inicio = fuente.indexOf(`function public.${nombre}(`);
  expect(inicio).toBeGreaterThanOrEqual(0);
  const fin = fuente.indexOf('$$;', inicio);
  expect(fin).toBeGreaterThan(inicio);
  return fuente.slice(inicio, fin);
}

describe('la cola de fotos pendientes esta cerrada', () => {
  it('crea la tabla con `if not exists` (la migracion se puede reaplicar)', () => {
    expect(codigo).toContain('create table if not exists public.moderacion_fotos_pendientes');
  });

  it('tiene RLS activa y NINGUNA policy: solo la tocan funciones definer', () => {
    expect(codigo).toContain(
      'alter table public.moderacion_fotos_pendientes enable row level security',
    );
    expect(codigo).not.toContain('create policy');
  });

  it('revoca los grants de tabla tambien a authenticated', () => {
    // Sin esto, cualquiera con sesion leeria por PostgREST las rutas de las
    // fotos que la moderacion acaba de sacar de circulacion.
    expect(codigo).toMatch(
      /revoke all on table public\.moderacion_fotos_pendientes from public, anon, authenticated/,
    );
  });

  it('guarda el estado del barrido (borrado_en + intentos), no solo la ruta', () => {
    expect(codigo).toMatch(/intentos\s+int not null default 0/);
    expect(codigo).toMatch(/borrado_en\s+timestamptz/);
  });
});

describe('moderar_retirar encola la ruta ANTES de borrar el mensaje', () => {
  const retirar = cuerpo(codigo, 'moderar_retirar');

  it('el insert en la cola va antes del delete de la fila', () => {
    // Si se invirtiera, el select del insert no encontraria el mensaje y la
    // ruta se perderia para siempre sin que nada fallara.
    const insert = retirar.indexOf('insert into public.moderacion_fotos_pendientes');
    const borra = retirar.indexOf('delete from public.messages');
    expect(insert).toBeGreaterThanOrEqual(0);
    expect(borra).toBeGreaterThan(insert);
  });

  it('la ruta sale de `messages.imagen_url` via ruta_storage, no de un parametro', () => {
    expect(retirar).toContain('public.ruta_storage(m.imagen_url)');
    // La firma sigue siendo solo el id de la denuncia: no hay por donde
    // meterle una ruta elegida por quien llama.
    expect(codigo).toContain('function public.moderar_retirar(p_denuncia_id uuid)');
    expect(retirar).not.toMatch(/p_ruta|p_path|p_foto/);
  });

  it('solo encola rutas que cuelgan de la carpeta del AUTOR del mensaje', () => {
    // `imagen_url` es texto que escribe el usuario: sin este filtro, alguien se
    // manda un mensaje con la URL de la foto de otro, se auto-denuncia y logra
    // que un admin le borre el archivo a un tercero (la Edge Function corre con
    // service_role y se saltea la RLS de Storage).
    expect(retirar).toContain("~ ('^' || m.from_user::text || '/[^/]+$')");
  });

  it('un segmento unico despues del uid (no alcanza con el prefijo)', () => {
    // `like '<uid>/%'` dejaria pasar `<miuid>/../<uid-ajeno>/foto.jpg`.
    expect(retirar).not.toMatch(/like\s+'\^?'?\s*\|\|/);
    expect(retirar).toContain('[^/]+$');
  });

  it('conserva el resto del comportamiento de la 0040 (los otros 5 tipos)', () => {
    // La 0043 reescribe la funcion entera: si al copiarla se perdiera una rama,
    // ese tipo de denuncia dejaria de retirar contenido en silencio.
    for (const rama of [
      'update public.pets set oculto = true',
      'update public.adoptions set oculto = true',
      'delete from public.pet_tips',
      'delete from public.sightings',
      'delete from public.adoption_questions',
    ]) {
      expect(sql0040).toContain(rama);
      expect(retirar).toContain(rama);
    }
    // Y sigue resolviendo la denuncia y cerrando las del mismo objeto en lote.
    expect(retirar).toContain("accion='retirado'");
    expect(retirar).toContain("accion='retirado (en lote)'");
  });

  it('sigue siendo el mismo gate de admin y los mismos grants', () => {
    expect(retirar).toContain('if not public.es_admin() then raise exception');
    expect(codigo).toContain('revoke all on function public.moderar_retirar(uuid) from public, anon');
    expect(codigo).toContain('grant execute on function public.moderar_retirar(uuid) to authenticated');
  });
});

describe('moderacion_fotos_a_borrar: solo lectura, admin, y con reintento', () => {
  const leer = cuerpo(codigo, 'moderacion_fotos_a_borrar');

  it('aborta si el llamador no es admin', () => {
    expect(leer).toContain('if not public.es_admin() then raise exception');
  });

  it('recibe el id de la denuncia y NUNCA una ruta', () => {
    expect(codigo).toContain('function public.moderacion_fotos_a_borrar(p_denuncia_id uuid)');
    expect(leer).not.toMatch(/p_ruta|p_rutas|p_path/);
  });

  it('es solo lectura: no marca ni borra nada al entregar las rutas', () => {
    // Si entregara y cerrara en el mismo paso, un fallo de Storage dejaria la
    // foto publica para siempre y el reintento devolveria 200 sin borrar nada
    // (el bug exacto que documenta la 0017).
    expect(leer).toContain('stable');
    expect(leer).not.toMatch(/\bupdate\b/i);
    expect(leer).not.toMatch(/\bdelete\b/i);
  });

  it('devuelve tambien los rezagados de retiros anteriores', () => {
    // La denuncia ya salio de la bandeja: nadie va a volver a apretar
    // "Retirar" sobre ella, asi que el barrido siguiente tiene que arrastrar
    // lo que quedo pendiente.
    expect(leer).toContain('f.borrado_en is null');
    expect(leer).toContain('order by (f.denuncia_id is distinct from p_denuncia_id)');
  });

  it('abandona lo que ya se reintento demasiadas veces (no bucle eterno)', () => {
    expect(leer).toMatch(/f\.intentos < \d+/);
  });

  it('acota el lote de una sola invocacion', () => {
    expect(leer).toMatch(/limit \d+/);
  });
});

describe('moderacion_fotos_marcar: cierra solo lo confirmado', () => {
  const marcar = cuerpo(codigo, 'moderacion_fotos_marcar');

  it('aborta si el llamador no es admin', () => {
    expect(marcar).toContain('if not public.es_admin() then raise exception');
  });

  it('cierra las borradas y solo suma un intento a las que no se confirmaron', () => {
    expect(marcar).toContain('set borrado_en = now()');
    // La rama de fallidas NO puede cerrar la fila: si lo hiciera, un borrado
    // parcial quedaria marcado como hecho y la foto seguiria publica.
    const reintentos = marcar.slice(marcar.indexOf('reintentos as ('));
    expect(reintentos).toContain('set intentos = f.intentos + 1');
    expect(reintentos).not.toContain('borrado_en = now()');
  });

  it('las dos listas se excluyen (dos updates a la misma fila se pisan)', () => {
    expect(marcar).toContain('not (f.id = any(v_borradas))');
  });

  it('devuelve las filas que toco de verdad', () => {
    // Un update que no matchea no da error, solo afecta 0 filas: la Edge
    // Function necesita las filas devueltas para darse cuenta.
    expect(codigo).toContain('returns table (id bigint, estado text)');
    expect(marcar).toContain('returning f.id');
  });

  it('nunca reabre una fila ya cerrada', () => {
    expect(marcar.match(/f\.borrado_en is null/g) ?? []).toHaveLength(2);
  });
});

describe('las tres funciones nuevas estan gateadas igual que el resto del panel', () => {
  it('security definer con search_path fijado y sin grant a anon', () => {
    for (const fn of ['moderacion_fotos_a_borrar', 'moderacion_fotos_marcar']) {
      const bloque = cuerpo(codigo, fn);
      expect(bloque).toContain('security definer');
      expect(bloque).toMatch(/set search_path = public, pg_temp/);
    }
    expect(codigo).toContain('revoke all on function public.moderacion_fotos_a_borrar(uuid) from public, anon');
    expect(codigo).toContain('revoke all on function public.moderacion_fotos_marcar(bigint[], bigint[]) from public, anon');
  });

  it('las que cambian de firma se dropean antes (create or replace no puede)', () => {
    // `create or replace` no puede cambiar el tipo de retorno: sin el drop, la
    // migracion se corta a la mitad en cualquier base donde ya existiera.
    expect(codigo).toContain('drop function if exists public.moderacion_fotos_a_borrar(uuid)');
    expect(codigo).toContain('drop function if exists public.moderacion_fotos_marcar(bigint[], bigint[])');
  });
});

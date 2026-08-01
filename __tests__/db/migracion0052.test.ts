import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { DIAS_VIGENCIA_ADOPCION } from '../../src/lib/cicloVidaAdopcion';

// GUARDRAIL ESTATICO de la migracion 0052 — PARIDAD DE ADOPCION.
//
// No prueba la base real (es un archivo de texto): ata las decisiones que, si
// alguien las afloja al editar el SQL, no se notan hasta que ya hay datos.
//
// Esta migracion es la mas peligrosa de la tanda porque RECREA dos funciones
// que ya existen y estan en uso. Los dos accidentes concretos que este archivo
// existe para impedir:
//
//   1. Recrear `buscar_adopciones` partiendo de la 0030 en vez de la 0033.
//      La 0033 agrego `p_comuna` y el cliente YA lo manda. Recrear desde la
//      vieja borra el filtro por comuna del feed sin que nada se ponga rojo.
//      Paso tal cual con `buscar_reportes` y lo cazo un agente de casualidad.
//   2. Dejar dos firmas de `buscar_adopciones` vivas. `create or replace` no
//      puede cambiar el tipo de retorno, asi que hay que dropear; si el drop
//      no lleva la firma EXACTA, el create arma una SOBRECARGA y PostgREST
//      falla por ambiguedad al resolver cual invocar.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
// Los finales de linea se normalizan a LF antes de comparar nada.
//
// Varias aserciones de abajo comparan fragmentos SQL MULTILINEA escritos con
// `\n` literal. Este repo no tiene .gitattributes y `core.autocrlf` esta en
// true, asi que el archivo queda con LF en el worktree donde se escribio y con
// CRLF despues de cualquier checkout limpio: sin esto, el test pasa para quien
// lo escribio y se pone rojo para todos los demas. Paso tal cual en
// `__tests__/legales.test.js`, y volvio a pasar acá al fusionar.
const sql = readFileSync(join(DIR, '0052_adopcion_paridad.sql'), 'utf8').replace(/\r\n/g, '\n');

// Las aserciones corren sobre el CODIGO: el archivo explica en prosa lo mismo
// que verifica, asi que buscar sobre el texto crudo da falsos positivos.
const codigo = sql.replace(/--[^\n]*/g, '');

/** El cuerpo `as $$ … $$;` de la funcion. */
function cuerpoDe(nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}(`);
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('as $$', idx);
  expect(abre).toBeGreaterThan(idx);
  const cierra = codigo.indexOf('$$;', abre + 5);
  expect(cierra).toBeGreaterThan(abre);
  return codigo.slice(abre + 5, cierra);
}

/** La lista de `returns table ( … )` de la funcion. */
function retornoDe(nombre: string): string {
  const desde = codigo.indexOf(`create function public.${nombre}(`);
  expect(desde).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('returns table (', desde);
  expect(abre).toBeGreaterThan(desde);
  let nivel = 0;
  for (let i = codigo.indexOf('(', abre); i < codigo.length; i++) {
    if (codigo[i] === '(') nivel++;
    else if (codigo[i] === ')' && --nivel === 0) return codigo.slice(abre, i);
  }
  throw new Error(`no se cerro el returns table de ${nombre}`);
}

/** La lista de parametros del `create function`. */
function parametrosDe(nombre: string): string {
  const desde = codigo.indexOf(`create function public.${nombre}(`);
  expect(desde).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('(', desde);
  let nivel = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === '(') nivel++;
    else if (codigo[i] === ')' && --nivel === 0) return codigo.slice(abre + 1, i);
  }
  throw new Error(`no se cerraron los parametros de ${nombre}`);
}

describe('el parser lee el SQL de verdad (si no, todo lo de abajo pasa por vacio)', () => {
  it('encuentra las dos funciones recreadas', () => {
    expect(cuerpoDe('buscar_adopciones').length).toBeGreaterThan(500);
    expect(cuerpoDe('perfil_publico').length).toBeGreaterThan(200);
    expect(parametrosDe('buscar_adopciones')).toContain('p_limite');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 1. buscar_adopciones: recreada DESDE LA 0033, no desde la 0030
// ───────────────────────────────────────────────────────────────────────────
describe('buscar_adopciones conserva TODO lo que ya hacia', () => {
  const params = parametrosDe('buscar_adopciones');
  const cuerpo = cuerpoDe('buscar_adopciones');

  it('sigue teniendo p_comuna y su filtro (lo que agrego la 0033)', () => {
    // El cliente ya manda p_comuna: sin esto el feed por comuna se rompe en
    // silencio. Es EL accidente que esta migracion podia repetir.
    expect(params).toContain('p_comuna text default null');
    expect(cuerpo).toContain('(p_comuna is null or a.comuna = p_comuna)');
  });

  it('sigue teniendo los filtros de la 0030', () => {
    expect(cuerpo).toContain('(p_especie is null or a.especie::text = p_especie)');
    expect(cuerpo).toContain('(p_tamano is null or a.tamano = p_tamano)');
    expect(cuerpo).toContain('st_dwithin(a.ubicacion, c.punto, p_radio_km * 1000)');
  });

  it('sigue excluyendo lo inactivo, lo oculto y lo ya adoptado', () => {
    expect(cuerpo).toContain('a.activo = true');
    expect(cuerpo).toContain('a.oculto = false');
    expect(cuerpo).toContain('a.adoptada_en is null');
  });

  it('conserva VERBATIM el arreglo del cursor de la 0015 (distancia redondeada)', () => {
    // La distancia se redondea a numeric con 6 decimales UNA sola vez y el
    // cursor se compara contra ese mismo valor redondeado. Sin eso, el scroll
    // infinito repite o saltea filas por error de punto flotante.
    expect(cuerpo).toContain('round((st_distance(a.ubicacion, c.punto) / 1000.0)::numeric, 6)');
    expect(cuerpo).toContain('(calc.dist, calc.id) > (round(p_cursor_dist::numeric, 6), p_cursor_id)');
    expect(cuerpo).toContain('(calc.creado_en, calc.id) < (p_cursor_fecha, p_cursor_id)');
  });

  it('conserva el techo duro de la pagina', () => {
    expect(cuerpo).toContain('limit least(coalesce(p_limite, 20), 100)');
  });
});

describe('buscar_adopciones: texto y edad', () => {
  const params = parametrosDe('buscar_adopciones');
  const cuerpo = cuerpoDe('buscar_adopciones');

  it('los dos parametros nuevos tienen default null', () => {
    // Sin default, la llamada de siempre (11 argumentos) dejaria de resolver y
    // se caeria el feed entero apenas se aplique el SQL.
    expect(params).toContain('p_texto text default null');
    expect(params).toContain('p_edad text default null');
  });

  it('van AL FINAL de la lista, despues de p_limite', () => {
    // Los argumentos viajan por nombre, asi que la posicion no rompe a nadie;
    // ponerlos al final igual deja el diff legible contra la 0033.
    expect(params.indexOf('p_texto')).toBeGreaterThan(params.indexOf('p_limite'));
    expect(params.indexOf('p_edad')).toBeGreaterThan(params.indexOf('p_limite'));
  });

  it('el texto busca en nombre y descripcion, y tolera vacio', () => {
    expect(cuerpo).toContain("p_texto is null or trim(p_texto) = ''");
    expect(cuerpo).toContain('a.nombre');
    expect(cuerpo).toMatch(/ilike '%' \|\| trim\(p_texto\) \|\| '%'/);
    // `descripcion` es not null en la 0030, pero el nombre no: sin el coalesce,
    // concatenar un null anula la cadena ENTERA y la fila no matchea nunca.
    expect(cuerpo).toContain("coalesce(a.nombre, '')");
  });

  it('la edad filtra por la columna que la tarjeta ya mostraba', () => {
    expect(cuerpo).toContain('(p_edad is null or a.edad = p_edad)');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Ciclo de vida
// ───────────────────────────────────────────────────────────────────────────
describe('ciclo de vida: auto-archivado perezoso, sin cron', () => {
  it('la columna es aditiva y se puede reaplicar', () => {
    expect(codigo).toContain(
      'alter table public.adoptions\n  add column if not exists renovado_en timestamptz;',
    );
  });

  it('la columna NACE SIN default: si no, el backfill no hace nada', () => {
    // Postgres rellena las filas existentes con el default en el mismo ALTER,
    // asi que con `default now()` en el add ninguna fila queda en null y el
    // `update … where renovado_en is null` de abajo toca CERO filas: el reloj
    // arrancaria el dia de la migracion para todo el mundo y no se archivaria
    // nada durante un trimestre entero. (La 0028 tiene ese bug sobre `pets`:
    // su comentario dice una cosa y su SQL hace la otra.)
    const add = codigo.slice(
      codigo.indexOf('add column if not exists renovado_en'),
      codigo.indexOf(';', codigo.indexOf('add column if not exists renovado_en')),
    );
    expect(add).not.toContain('default');
  });

  it('las publicaciones viejas se anclan a su fecha de creacion', () => {
    expect(codigo).toContain(
      'update public.adoptions set renovado_en = creado_en where renovado_en is null;',
    );
  });

  it('y recien DESPUES del backfill se pone el default, para las nuevas', () => {
    const backfill = codigo.indexOf('update public.adoptions set renovado_en');
    const def = codigo.indexOf('alter column renovado_en set default now()');
    expect(def).toBeGreaterThan(backfill);
  });

  it('la consulta excluye lo no renovado (es el archivado: no hay cron)', () => {
    expect(cuerpoDe('buscar_adopciones')).toContain(
      `coalesce(a.renovado_en, a.creado_en) >= now() - interval '${DIAS_VIGENCIA_ADOPCION} days'`,
    );
  });

  it('el umbral del SQL y el del cliente son EL MISMO numero', () => {
    // Si se separan, la app dice "en pausa" sobre algo que el feed sigue
    // mostrando (o al reves) y nadie entiende nada. El test importa la
    // constante de verdad: cambiar uno solo de los dos pone esto rojo.
    const enSql = cuerpoDe('buscar_adopciones').match(/interval '(\d+) days'/);
    expect(enSql).not.toBeNull();
    expect(Number(enSql![1])).toBe(DIAS_VIGENCIA_ADOPCION);
  });

  it('devuelve renovado_en para que el dueño pueda ver el estado', () => {
    expect(retornoDe('buscar_adopciones')).toContain('renovado_en timestamptz');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. perfil_publico cuenta adopciones — sin perder nada de la 0019
// ───────────────────────────────────────────────────────────────────────────
describe('perfil_publico suma las adopciones', () => {
  const cuerpo = cuerpoDe('perfil_publico');

  it('cuenta las publicaciones VISIBLES, con el mismo criterio que la RLS', () => {
    expect(cuerpo).toContain('from public.adoptions ad');
    expect(cuerpo).toContain('ad.user_id = p.id');
    for (const cond of ['ad.activo = true', 'ad.oculto = false', 'ad.adoptada_en is null']) {
      expect({ cond, esta: cuerpo.includes(cond) }).toEqual({ cond, esta: true });
    }
  });

  it('la columna nueva va al final del retorno', () => {
    const ret = retornoDe('perfil_publico');
    expect(ret).toContain('adopciones bigint');
    expect(ret.indexOf('adopciones bigint')).toBeGreaterThan(ret.indexOf('aportes bigint'));
  });

  it('NO pierde ninguna de las tres cuentas viejas', () => {
    expect(cuerpo).toContain('pe.reunida_en is not null');
    expect(cuerpo).toContain('from public.sightings s');
    expect(cuerpo).toContain('from public.pet_tips t');
  });

  it('sigue sin exponer el telefono', () => {
    // La lista de retorno ES la lista completa de lo que sale hacia una llamada
    // anonima. Si un campo no esta ahi, no hay forma de sacarlo por esta via.
    const ret = retornoDe('perfil_publico');
    for (const campo of ['telefono', 'email', 'eliminado_en']) {
      expect({ campo, enElRetorno: ret.includes(campo) }).toEqual({ campo, enElRetorno: false });
    }
  });

  it('sigue sin servir el perfil de una cuenta borrada', () => {
    expect(cuerpo).toContain('p.eliminado_en is null');
  });

  it('sigue siendo definer con search_path fijo y con los mismos grants', () => {
    const decl = codigo.slice(codigo.indexOf('create function public.perfil_publico'));
    expect(decl.slice(0, 900)).toContain('security definer');
    expect(decl.slice(0, 900)).toContain('set search_path = public, pg_temp');
    expect(codigo).toContain('revoke all on function public.perfil_publico(uuid) from public;');
    expect(codigo).toContain('grant execute on function public.perfil_publico(uuid) to anon;');
    expect(codigo).toContain(
      'grant execute on function public.perfil_publico(uuid) to authenticated;',
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Recrear sin dejar sobrecargas
// ───────────────────────────────────────────────────────────────────────────
describe('el drop lleva la firma COMPLETA (si no, queda una sobrecarga)', () => {
  it('dropea las 11 posiciones que tiene la version 0033, en orden', () => {
    // 11, no 10: la 0033 le sumo p_comuna. Un drop con la firma de la 0030 no
    // encuentra nada, no falla, y el create de abajo arma la segunda firma.
    expect(codigo).toContain(
      'drop function if exists public.buscar_adopciones(text, text, text, double precision, double precision, double precision, text, timestamptz, uuid, double precision, int);',
    );
    expect(codigo).toContain('drop function if exists public.perfil_publico(uuid);');
  });

  it('el drop va ANTES del create', () => {
    expect(codigo.indexOf('drop function if exists public.buscar_adopciones')).toBeLessThan(
      codigo.indexOf('create function public.buscar_adopciones'),
    );
    expect(codigo.indexOf('drop function if exists public.perfil_publico')).toBeLessThan(
      codigo.indexOf('create function public.perfil_publico'),
    );
  });

  it('ninguna de las dos usa `create or replace` (no puede cambiar el retorno)', () => {
    expect(codigo).not.toMatch(/create or replace function public\.(buscar_adopciones|perfil_publico)/);
  });

  it('la migracion se autoverifica: si quedaron dos firmas, revienta', () => {
    // El drop con `if exists` es silencioso cuando la firma no calza. Este
    // chequeo convierte ese silencio en un error al aplicar el SQL, en vez de
    // en un feed roto por ambiguedad de PostgREST.
    expect(codigo).toContain("proname = 'buscar_adopciones'");
    expect(codigo).toMatch(/raise exception[^;]*firma/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LO MAS IMPORTANTE DEL ARCHIVO
// ───────────────────────────────────────────────────────────────────────────
describe('0052 no puede romper NADA de lo que ya existe', () => {
  it('la unica tabla que toca es adoptions', () => {
    // LA TRAMPA DE POSTGREST: pedir una columna nueva en el mismo `select` que
    // las viejas hace fallar la consulta ENTERA. La columna que agregamos vive
    // en `adoptions`, que el cliente lee con `select('*')`; agregarle una a
    // `pets` o a `profiles` seria meterse con selects ajenos.
    const alters = codigo.match(/alter table public\.(\w+)/g) ?? [];
    expect([...new Set(alters)]).toEqual(['alter table public.adoptions']);
  });

  it('no borra ni redefine nada mas que las dos funciones que declara', () => {
    const drops = [...codigo.matchAll(/drop function if exists public\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(drops)].sort()).toEqual(['buscar_adopciones', 'perfil_publico']);
    expect(codigo).not.toMatch(/\bdrop (table|policy|trigger|index|constraint)\b/i);
    expect(codigo).not.toMatch(/\bdelete from\b/i);
  });

  it('no toca la RLS de nadie', () => {
    // La 0019 dejo una policy aditiva sobre `pets` ("reencuentros visibles
    // publicamente") pegada a `perfil_publico`. Recrear la funcion NO es motivo
    // para volver a escribir esa policy: reescribirla de memoria es como se
    // revirtieron arreglos en tandas anteriores.
    expect(codigo).not.toMatch(/\bcreate policy\b/i);
    expect(codigo).not.toMatch(/enable row level security/i);
  });

  it('no toca la cola de avisos ni su Edge Function', () => {
    // Guardar busquedas de ADOPCION quedo fuera de alcance a proposito: el
    // trigger de la 0031 cuelga de `pets` y el dispatcher compone los tipos de
    // evento uno por uno. Sin redeploy de la Edge Function, el aviso nunca
    // saldria — seria prometer algo que nadie manda.
    expect(codigo).not.toContain('notification_events');
    expect(codigo).not.toContain('busquedas_guardadas');
  });

  it('el update del backfill es acotado y no pisa datos', () => {
    const updates = [...codigo.matchAll(/update public\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(updates)]).toEqual(['adoptions']);
    expect(codigo).toContain('where renovado_en is null;');
  });
});

// Este guardrail viaja SIEMPRE con la ultima migracion del repo (venia en
// migracion0048.test.ts). Su sentido es avisar cuando aparece una migracion
// nueva sin que se revise el orden de aplicacion.
describe('0052 es la ultima migracion del repo', () => {
  it('no hay ninguna migracion con numero mayor', () => {
    const numeros = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n));
    expect(Math.max(...numeros)).toBe(52);
  });
});

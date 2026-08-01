import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0050 — AVISAR SIN CUENTA.
//
// No prueba la base real (es un archivo de texto): ata las decisiones que, si
// alguien las afloja al editar el SQL, no se notan hasta que ya hay datos —o
// hasta que alguien usa la RPC como oraculo para enumerar reportes.
//
// La funcion es la SEGUNDA escritura anonima del repo (la primera es
// `avisar_escaneo_collar`, 0027). Una escritura que puede disparar cualquiera
// sin cuenta tiene exactamente tres defensas y las tres se comprueban aca:
// no delatar existencia, rate-limit, y no devolver NADA.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(DIR, '0050_aviso_anonimo.sql'), 'utf8');

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

/** La declaracion (todo lo previo al cuerpo) de una funcion. */
function declaracionDe(nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}`);
  expect(idx).toBeGreaterThanOrEqual(0);
  return codigo.slice(idx, codigo.indexOf('as $$', idx));
}

const FIRMA = 'public.avistar_sin_cuenta(uuid, text, double precision, double precision)';

describe('el parser lee el SQL de verdad (si no, todo lo de abajo pasa por vacio)', () => {
  it('encuentra la funcion y su cuerpo', () => {
    expect(cuerpoDe('avistar_sin_cuenta').length).toBeGreaterThan(200);
    expect(declaracionDe('avistar_sin_cuenta')).toContain('returns void');
  });
});

describe('la puerta anonima esta abierta a proposito, y solo esta', () => {
  it('es definer con search_path fijo', () => {
    // Sin `set search_path`, una funcion definer se puede secuestrar creando un
    // esquema temporal que sombree `public.notification_events`.
    const decl = declaracionDe('avistar_sin_cuenta');
    expect(decl).toContain('security definer');
    expect(decl).toContain('set search_path = public, pg_temp');
  });

  it('revoca a public antes de concederle a anon y authenticated', () => {
    expect(codigo).toContain(`revoke all on function ${FIRMA} from public;`);
    expect(codigo).toContain(`grant execute on function ${FIRMA} to anon;`);
    expect(codigo).toContain(`grant execute on function ${FIRMA} to authenticated;`);
  });

  it('no le abre NINGUNA otra funcion ni tabla a anon', () => {
    // La unica escritura anonima que agrega esta migracion es esta. Si mañana
    // alguien suma un `grant ... to anon` de paso, esto se pone rojo.
    const grantsAnon = [...codigo.matchAll(/grant[^;]*\bto\b[^;]*\banon\b[^;]*;/g)].map((m) => m[0]);
    expect(grantsAnon).toEqual([`grant execute on function ${FIRMA} to anon;`]);
  });
});

describe('no delata si el reporte existe (el criterio del collar)', () => {
  const cuerpo = cuerpoDe('avistar_sin_cuenta');

  it('un id que no existe retorna sin error, igual que uno que si existe', () => {
    // Si un id inexistente diera error (o cualquier respuesta distinta), la RPC
    // seria un oraculo: probando uuids se enumeran reportes ocultos o cerrados.
    expect(cuerpo).toMatch(/if not found then\s*return;\s*end if;/);
    expect(cuerpo).not.toContain('raise exception');
  });

  it('no devuelve nada: ni ok, ni id, ni cuantos', () => {
    // `returns void` es parte de la defensa: cualquier valor de retorno
    // distinguible reintroduce el oraculo por la puerta de atras.
    expect(declaracionDe('avistar_sin_cuenta')).toContain('returns void');
    expect(cuerpo).not.toMatch(/\breturn\s+(true|false|v_|found|query)/);
  });

  it('un reporte cerrado u ocultado por moderacion se comporta como inexistente', () => {
    // `activo = false` (el dueño lo cerro) y `oculto = true` (moderacion) tienen
    // que caer en el MISMO return silencioso: si uno diera error y el otro no,
    // se distinguirian desde afuera.
    expect(cuerpo).toContain('activo = true');
    expect(cuerpo).toContain('oculto = false');
  });
});

describe('rate-limit, para que nadie martille el boton', () => {
  const cuerpo = cuerpoDe('avistar_sin_cuenta');

  it('no encola dos veces por el mismo reporte en 5 minutos', () => {
    expect(cuerpo).toContain("interval '5 minutes'");
    expect(cuerpo).toMatch(/ne\.pet_id = p_pet_id/);
    expect(cuerpo).toContain("ne.tipo = 'avistamiento_anonimo'");
  });

  it('el corte por rate-limit tambien retorna en silencio', () => {
    // Un "esperá 5 minutos" le confirmaria al que prueba ids que ese reporte
    // existe. Y a quien avisa de buena fe no le sirve de nada.
    const desde = cuerpo.indexOf("interval '5 minutes'");
    expect(desde).toBeGreaterThan(0);
    expect(cuerpo.slice(desde, desde + 120)).toMatch(/then\s*return;/);
  });

  it('hay indice para que ese `exists` no escanee la cola entera', () => {
    // La cola crece sin techo; sin indice, cada aviso anonimo pasea toda la
    // tabla. Es una consulta que dispara CUALQUIERA sin cuenta.
    expect(codigo).toMatch(/create index if not exists \w+\s+on public\.notification_events/);
  });
});

describe('el CHECK de tipo se amplia SIN perder ninguno de los viejos', () => {
  it('conserva los seis tipos que ya existian y suma el nuevo', () => {
    // El CHECK se reescribe entero (drop + add). Si al copiarlo se cae uno, el
    // trigger que lo encola empieza a fallar y ese aviso deja de existir. Ya
    // paso con la lista union de la 0027.
    const m = /add constraint notification_events_tipo_check\s*check \(tipo in \(([^)]*)\)\)/.exec(codigo);
    expect(m).toBeTruthy();
    const tipos = m![1].split(',').map((t) => t.trim().replace(/'/g, ''));
    expect(tipos.sort()).toEqual(
      [
        'avistamiento',
        'avistamiento_anonimo',
        'busqueda_guardada',
        'coincidencia',
        'escaneo_collar',
        'pista',
        'reporte_nuevo',
      ].sort(),
    );
  });

  it('dropea el constraint viejo antes, con if exists', () => {
    expect(codigo).toContain(
      'alter table public.notification_events drop constraint if exists notification_events_tipo_check;',
    );
  });
});

describe('lo que se guarda del aviso', () => {
  const cuerpo = cuerpoDe('avistar_sin_cuenta');

  it('el aviso queda dirigido al dueño del reporte', () => {
    expect(cuerpo).toContain('v_pet.user_id');
  });

  it('el actor es null: quien avisa es anonimo y no se lo identifica', () => {
    // Nada de meter auth.uid() aca "por si hay sesion": la promesa de la
    // pantalla es que se puede avisar sin dejar rastro de quien sos.
    expect(cuerpo).not.toContain('auth.uid()');
    expect(cuerpo).toMatch(
      /actor_id, datos\)\s*values \(\s*'avistamiento_anonimo',\s*p_pet_id,\s*v_pet\.user_id,\s*null,/,
    );
  });

  it('la nota se recorta en la base, no solo en el cliente', () => {
    // El cliente recorta, pero la RPC la puede llamar cualquiera con curl.
    expect(cuerpo).toMatch(/left\(coalesce\(p_nota, ''\), 500\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LO MAS IMPORTANTE DEL ARCHIVO
// ───────────────────────────────────────────────────────────────────────────
describe('0050 no puede romper NADA de lo que ya existe', () => {
  it('no le agrega ni una columna a ninguna tabla', () => {
    // LA TRAMPA DE POSTGREST, medida contra el proyecto real:
    //   GET /rest/v1/pets?select=id,estado,columna_que_no_existe
    //   → 400: la consulta falla ENTERA, sin datos parciales.
    // La web se sube antes de correr el SQL. Una columna nueva que la app pida
    // deja la ficha del reporte sin cargar para TODO EL MUNDO hasta que alguien
    // aplique la migracion.
    expect(codigo).not.toMatch(/\badd column\b/i);
  });

  it('solo toca `notification_events`, y solo su CHECK', () => {
    const alters = [...codigo.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(alters)]).toEqual(['notification_events']);
    // Y de esa tabla, unicamente el constraint: ni una columna, ni RLS, ni
    // policies. Todo lo que la app ya lee de la cola sigue igual.
    const trozos = codigo.split(/alter table public\.notification_events/).slice(1);
    expect(trozos).toHaveLength(2);
    for (const t of trozos) expect(t.trimStart().slice(0, 22)).toMatch(/^(drop|add) constraint/);
  });

  it('no redefine ni borra nada de las migraciones anteriores', () => {
    // Recrear "de paso" una funcion vecina es como se revirtieron arreglos en
    // tandas anteriores sin que nadie se enterara.
    const funciones = [...codigo.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map(
      (m) => m[1],
    );
    expect(funciones).toEqual(['avistar_sin_cuenta']);
    expect(codigo).not.toMatch(/\bdrop (table|policy|function|trigger)\b/i);
    expect(codigo).not.toMatch(/\bdelete from\b/i);
    expect(codigo).not.toMatch(/\bupdate public\.\w+\s+set\b/i);
    expect(codigo).not.toMatch(/\bcreate table\b/i);
  });

  it('no toca la tabla `sightings` ni finge un avistamiento con dueño', () => {
    // Tentacion descartada: insertar en `sightings` haria aparecer el pin en el
    // rastro del mapa, pero esa tabla exige user_id (RLS de la 0007) y no hay
    // ninguno. Inventar uno seria firmar un avistamiento con la cuenta de otro.
    expect(codigo).not.toContain('sightings');
  });
});

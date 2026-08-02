import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0055 — dos arreglos viejos:
//
//   1. EL BACKFILL DE LA 0028 QUE NUNCA CORRIO. La 0028 hizo
//      `add column renovado_en timestamptz default now()` y DESPUES
//      `update … where renovado_en is null`. Postgres rellena las filas que ya
//      existian con el default DENTRO del mismo ALTER, asi que ese update toco
//      cero filas: los reportes viejos quedaron anclados al dia de la migracion
//      en vez de a su creacion, y el auto-archivado no archivo nada. La 0052
//      ya documento el bug y lo evito en `adoptions` (columna sin default →
//      backfill → set default); esta migracion CORRIGE LOS DATOS de `pets`.
//
//   2. LA PUERTA ANONIMA (`avistar_sin_cuenta`, 0050). Su rate-limit era por
//      REPORTE: cualquier aviso en 5 minutos hacia que el siguiente se
//      descartara en silencio. Como el `pet_id` es publico, eso es un boton de
//      silenciar avisos ajenos.
//
// Este archivo NO prueba la base: lee el SQL. Lo que ata son las decisiones que
// no se notan hasta que ya hay datos rotos.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

// Normalizado a LF: sin .gitattributes y con core.autocrlf=true un checkout
// limpio trae CRLF y toda comparacion multilinea se pone roja para el que no
// escribio el archivo. Ya paso en `legales.test.js` y en la 0052.
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');

const sql55 = leer('0055_backfill_renovado_en_y_puerta_anonima.sql');
const sql50 = leer('0050_aviso_anonimo.sql');
const sql28 = leer('0028_ciclo_vida.sql');

// Las aserciones corren sobre el CODIGO: el archivo explica en prosa lo mismo
// que verifica, y buscar sobre el texto crudo da falsos positivos.
const sinComentarios = (s: string) => s.replace(/--[^\n]*/g, '');
const codigo55 = sinComentarios(sql55);
const codigo50 = sinComentarios(sql50);
const codigo28 = sinComentarios(sql28);

function cuerpoDe(codigo: string, nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}`);
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('as $$', idx);
  expect(abre).toBeGreaterThan(idx);
  const cierra = codigo.indexOf('$$;', abre + 5);
  expect(cierra).toBeGreaterThan(abre);
  return codigo.slice(abre + 5, cierra);
}

/** La declaracion (todo lo previo al cuerpo) de una funcion. */
function declaracionDe(codigo: string, nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}`);
  expect(idx).toBeGreaterThanOrEqual(0);
  return codigo.slice(idx, codigo.indexOf('as $$', idx));
}

/**
 * La lista de parametros de una funcion, normalizada: solo los TIPOS, en orden.
 * Sirve para comparar la firma de dos archivos distintos sin escribirla a mano.
 */
function tiposDeParametros(codigo: string, nombre: string): string[] {
  const decl = declaracionDe(codigo, nombre);
  const dentro = decl.slice(decl.indexOf('(') + 1, decl.lastIndexOf(')'));
  return dentro
    .split(',')
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/^p_\w+\s+/, '').replace(/\s+default\s+.*$/i, ''));
}

/** El bloque `if exists ( … )` del rate-limit, tal como esta escrito. */
function bloqueRateLimit(cuerpo: string): string {
  const idx = cuerpo.indexOf("'avistamiento_anonimo'");
  const desde = cuerpo.lastIndexOf('if exists', idx);
  expect(desde).toBeGreaterThanOrEqual(0);
  const hasta = cuerpo.indexOf('then', cuerpo.indexOf("interval '5 minutes'", desde));
  expect(hasta).toBeGreaterThan(desde);
  return cuerpo.slice(desde, hasta);
}

const cuerpo55 = cuerpoDe(codigo55, 'avistar_sin_cuenta');
const cuerpo50 = cuerpoDe(codigo50, 'avistar_sin_cuenta');
const FIRMA = 'public.avistar_sin_cuenta(uuid, text, double precision, double precision)';

// ───────────────────────────────────────────────────────────────────────────
describe('el parser lee el SQL de verdad (si no, todo lo de abajo pasa por vacio)', () => {
  it('encuentra las dos mitades de la migracion', () => {
    expect(cuerpo55.length).toBeGreaterThan(400);
    expect(codigo55).toMatch(/update public\.pets/);
  });

  it('encuentra el rate-limit en los dos archivos', () => {
    expect(bloqueRateLimit(cuerpo50).length).toBeGreaterThan(60);
    expect(bloqueRateLimit(cuerpo55).length).toBeGreaterThan(60);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 1. EL BACKFILL QUE LA 0028 NO HIZO
// ───────────────────────────────────────────────────────────────────────────
describe('el arreglo de datos no puede tocar un reporte renovado de verdad', () => {
  const bloque = codigo55.slice(
    codigo55.indexOf('update public.pets'),
    codigo55.indexOf(';', codigo55.indexOf('update public.pets')),
  );

  it('solo mueve `renovado_en` HACIA ATRAS, y esta escrito en el WHERE', () => {
    // ESTE es el invariante que importa. Si el update pudiera mover la fecha
    // hacia adelante, le estaria DESARCHIVANDO reportes viejos a todo el mundo.
    // Con `creado_en < renovado_en` en el WHERE es imposible por construccion,
    // no por confianza en el criterio de arriba.
    expect(bloque).toMatch(/set renovado_en = creado_en/);
    expect(bloque).toMatch(/creado_en < renovado_en/);
  });

  it('exige igualdad EXACTA con el sello de la 0028, no un rango de fechas', () => {
    // El sello lo puso `now()` (stable → transaction_timestamp) una sola vez
    // dentro del ALTER: TODAS las filas viejas comparten el mismo microsegundo.
    // Comparar por igualdad exacta contra ese valor es lo que distingue "nunca
    // se renovo" de "lo renovaron despues". Un `between` o un `<=` se llevaria
    // por delante renovaciones reales del mismo dia.
    expect(bloque).toMatch(/renovado_en = v_sello/);
    expect(bloque).not.toMatch(/renovado_en\s*(<=|>=|<|>)\s*v_sello/);
  });

  it('descarta los reportes creados DESPUES del sello', () => {
    // Un reporte creado despues de la 0028 nace con renovado_en = creado_en:
    // no tiene nada que corregir y no debe entrar nunca.
    expect(bloque).toMatch(/creado_en < v_sello/);
  });

  it('si no puede identificar el sello con seguridad, NO actualiza nada', () => {
    // El requisito explicito de la tarea: ante la duda, no tocar los datos.
    // El `return` temprano tiene que estar ANTES del update en el mismo bloque.
    const doBlock = codigo55.slice(codigo55.indexOf('do $$'), codigo55.indexOf('update public.pets'));
    expect(doBlock).toMatch(/v_sello is null/);
    expect(doBlock).toMatch(/\breturn;/);
  });

  it('acota la ventana con la fecha real de la 0028, no con "cualquier fecha"', () => {
    // La 0028 se escribio el 2026-07-21. Si el sello derivado cae fuera de esa
    // ventana, quiere decir que lo que encontramos NO es el sello de la
    // migracion sino una renovacion real: no se toca nada.
    expect(codigo55).toContain('2026-07-21');
    expect(codigo55).toMatch(/v_sello < v_desde or v_sello >= v_hasta/);
  });

  it('el sello se deriva de un hecho, no de una fecha escrita a mano', () => {
    // Antes de la 0028 la columna NO EXISTIA, asi que nadie pudo renovar antes
    // del ALTER: el minimo `renovado_en` entre las filas que tienen
    // `renovado_en > creado_en` ES el sello. La constante de arriba solo valida
    // el resultado; no lo produce.
    const inicio = codigo55.indexOf('select min(renovado_en)');
    expect(inicio).toBeGreaterThanOrEqual(0);
    // Acotado a la sentencia que DERIVA el sello: si se mirara el archivo
    // entero, el `creado_en < renovado_en` del UPDATE alcanzaria para pasar y
    // el test no cubriria nada.
    const derivacion = codigo55.slice(inicio, codigo55.indexOf(';', inicio));
    expect(derivacion).toMatch(/creado_en < renovado_en/);
  });
});

describe('el arreglo de datos no hace nada mas que arreglar datos', () => {
  it('no agrega, cambia ni borra ninguna columna', () => {
    // La web se sube ANTES de aplicar el SQL: una columna nueva que la app pida
    // deja la ficha sin cargar para todo el mundo hasta que alguien lo aplique.
    expect(codigo55).not.toMatch(/\badd column\b/i);
    expect(codigo55).not.toMatch(/\bdrop column\b/i);
    expect(codigo55).not.toMatch(/\balter column\b/i);
  });

  it('no borra filas ni toca otra tabla que `pets`', () => {
    expect(codigo55).not.toMatch(/\bdelete from\b/i);
    const updates = [...codigo55.matchAll(/update public\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(updates)]).toEqual(['pets']);
  });

  it('NO reescribe la 0028: la vieja se queda como esta', () => {
    // Reescribir una migracion ya aplicada es peor que el bug: la base real no
    // se entera y el repo empieza a mentir sobre lo que corrio.
    expect(codigo28).toContain('add column if not exists renovado_en timestamptz default now()');
    expect(codigo28).toContain('update public.pets set renovado_en = creado_en where renovado_en is null;');
  });

  it('no toca `buscar_reportes` ni ninguna otra funcion vecina', () => {
    // El auto-archivado ya estaba bien escrito en la 0028: lo que estaba mal
    // eran los datos. Recrear la funcion "de paso" es como se revirtieron
    // arreglos en tandas anteriores.
    const funciones = [...codigo55.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map(
      (m) => m[1],
    );
    expect(funciones).toEqual(['avistar_sin_cuenta']);
    expect(codigo55).not.toContain('buscar_reportes');
  });

  it('el intervalo del auto-archivado sigue viviendo en un solo lugar', () => {
    // Si esta migracion hubiera copiado los 45 dias, habria dos numeros para lo
    // mismo — el bug que la 0053 dejo atado para adopciones.
    expect(codigo55).not.toMatch(/interval '45 days'/);
    expect(codigo28).toContain("interval '45 days'");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. LA PUERTA ANONIMA
// ───────────────────────────────────────────────────────────────────────────
describe('la RPC se recrea SIN cambiarle la firma (la web anda sin aplicar el SQL)', () => {
  it('los parametros son exactamente los mismos que los de la 0050', () => {
    // Comparados ENTRE LOS DOS ARCHIVOS, no contra una lista escrita aca: si
    // alguien agrega o reordena un parametro, PostgREST arma una sobrecarga y
    // el aviso anonimo deja de resolver. Esto se pone rojo antes.
    expect(tiposDeParametros(codigo55, 'avistar_sin_cuenta')).toEqual(
      tiposDeParametros(codigo50, 'avistar_sin_cuenta'),
    );
    expect(tiposDeParametros(codigo55, 'avistar_sin_cuenta')).toEqual([
      'uuid',
      'text',
      'double precision',
      'double precision',
    ]);
  });

  it('usa `create or replace`: sin drop no hay ventana en que la RPC no exista', () => {
    // El tipo de retorno no cambia (`void`), asi que no hace falta dropear. Un
    // drop + create deja unos milisegundos sin funcion y, si el create falla, la
    // puerta anonima queda cerrada para siempre.
    expect(codigo55).toContain('create or replace function public.avistar_sin_cuenta');
    expect(codigo55).not.toMatch(/\bdrop function\b/i);
    expect(declaracionDe(codigo55, 'avistar_sin_cuenta')).toContain('returns void');
  });

  it('conserva las tres defensas de una escritura sin cuenta', () => {
    const decl = declaracionDe(codigo55, 'avistar_sin_cuenta');
    expect(decl).toContain('security definer');
    expect(decl).toContain('set search_path = public, pg_temp');
    // No delata si el reporte existe.
    expect(cuerpo55).toMatch(/if not found then\s*return;\s*end if;/);
    expect(cuerpo55).not.toContain('raise exception');
    expect(cuerpo55).toContain('activo = true');
    expect(cuerpo55).toContain('oculto = false');
  });

  it('mantiene los grants tal cual, sin abrirle nada nuevo a anon', () => {
    expect(codigo55).toContain(`revoke all on function ${FIRMA} from public;`);
    expect(codigo55).toContain(`grant execute on function ${FIRMA} to anon;`);
    expect(codigo55).toContain(`grant execute on function ${FIRMA} to authenticated;`);
    const grantsAnon = [...codigo55.matchAll(/grant[^;]*\bto\b[^;]*\banon\b[^;]*;/g)].map((m) => m[0]);
    expect(grantsAnon).toEqual([`grant execute on function ${FIRMA} to anon;`]);
  });
});

describe('el rate-limit deja de ser un boton para silenciar avisos ajenos', () => {
  const rl50 = bloqueRateLimit(cuerpo50);
  const rl55 = bloqueRateLimit(cuerpo55);

  it('el de la 0050 se dispara con CUALQUIER aviso del reporte', () => {
    // Es el bug, comprobado sobre el archivo viejo para que este test no pueda
    // pasar por vacio: no mira el contenido, solo que exista una fila.
    expect(rl50).not.toContain('datos');
  });

  it('el de la 0055 compara el CONTENIDO, no la mera existencia', () => {
    // Dos vecinos que escriben cosas distintas ya no se pisan, y quien ocupa el
    // cupo con basura cada 4 minutos solo se descarta a si mismo.
    expect(rl55).toContain("datos->>'nota'");
    expect(rl55).toContain("datos->>'lat'");
    expect(rl55).toContain("datos->>'lng'");
  });

  it('compara con `is not distinct from`, no con `=`', () => {
    // La nota es OPCIONAL: la mayoria de los avisos llegan con nota nula. Con
    // `=`, null = null da null y el dedupe no agarraria justo el caso mas
    // comun — el martilleo del boton sin escribir nada.
    expect(rl55).toContain('is not distinct from');
    expect((rl55.match(/is not distinct from/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LO QUE ESTE ARCHIVO DABA POR ARREGLADO Y NO LO ESTABA.
  //
  // Comparar contenido no alcanza, porque el aviso MAYORITARIO no tiene
  // contenido que comparar: la nota es opcional y el punto no se manda nunca
  // (el pedido de GPS se saco en la tanda 11 y `usarUbicacion` quedo como
  // codigo muerto en PublicPetScreen). Para ese aviso la clave es
  // (null, null, null) para todo el mundo y, con `is not distinct from`, los
  // tres vecinos del afiche volvian a colapsar en uno: el bug entero, intacto,
  // debajo de un test en verde que solo miraba que el SQL nombrara los campos.
  // ─────────────────────────────────────────────────────────────────────────
  it('SIN nota la ventana es corta: el segundo vecino no se pisa con el primero', () => {
    expect(rl55).toContain("interval '1 minute'");
    // Y la ventana corta se elige solo cuando no hay NADA que comparar. Si la
    // condicion mirara unicamente la nota, el dia que el punto vuelva a
    // mandarse dos avisos distintos del mismo lugar se dedupearian mal.
    const caso = rl55.slice(rl55.indexOf('case'), rl55.indexOf('end', rl55.indexOf('case')));
    expect(caso).toContain('v_nota_norm is null');
    expect(caso).toContain('v_lat is null');
    expect(caso).toContain('v_lng is null');
    expect(caso).toContain("interval '1 minute'");
  });

  it('CON nota se mantiene la ventana de 5 minutos de la 0050', () => {
    expect(rl55).toContain("interval '5 minutes'");
    expect(rl55).toContain("ne.tipo = 'avistamiento_anonimo'");
    expect(rl55).toContain('ne.pet_id = p_pet_id');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EL TECHO DE VOLUMEN, QUE ESTE ARCHIVO HABIA SACADO SIN REEMPLAZO.
  //
  // La 0050 topaba en 1 aviso cada 5 minutos por reporte. Al pasar el corte a
  // "que el aviso sea el mismo", con notas distintas no quedaba NINGUN limite —
  // y cada fila de esta cola es un correo MAS un push al dueño, con el texto
  // del desconocido citado. El archivo declaraba que el volumen se atajaba "en
  // la capa de pedidos (rate-limit del gateway)": no hay ninguno configurado.
  // ─────────────────────────────────────────────────────────────────────────
  describe('el techo de volumen por reporte', () => {
    const topes = [...cuerpo55.matchAll(/interval '1 (hour|day)'\s*\)\s*>=\s*(\d+)/g)].map((m) => ({
      ventana: m[1],
      tope: Number(m[2]),
    }));

    it('existe y es por hora Y por dia (una sola ventana se sortea esperando)', () => {
      expect(topes.map((t) => t.ventana).sort()).toEqual(['day', 'hour']);
    });

    it('no vuelve al tope de 1 de la 0050, que era el boton de silenciar', () => {
      // Un tope bajo se ocupa desde afuera con el `pet_id` publico y descarta
      // en silencio los avisos legitimos: es el bug que esta migracion vino a
      // sacar. Tiene que dejar pasar a varias personas distintas.
      for (const t of topes) expect(t.tope).toBeGreaterThanOrEqual(5);
    });

    it('y queda MUY por debajo de la cuota diaria de correo de toda la app', () => {
      // 300 envios/dia para todo el proyecto: un solo reporte no puede
      // quemarla y dejar sin avisos al resto (coincidencias incluidas).
      const porDia = topes.find((t) => t.ventana === 'day')!.tope;
      expect(porDia).toBeLessThanOrEqual(50);
    });

    it('el techo corta en silencio, como todo lo demas de esta puerta', () => {
      const desde = cuerpo55.indexOf("interval '1 hour'");
      expect(cuerpo55.slice(desde, desde + 200)).toMatch(/then\s*return;/);
    });
  });

  it('el corte sigue retornando en silencio', () => {
    // Un "espera 5 minutos" le confirmaria a quien prueba uuids que el reporte
    // existe.
    const desde = cuerpo55.indexOf("interval '5 minutes'");
    expect(cuerpo55.slice(desde, desde + 400)).toMatch(/then\s*return;/);
  });
});

describe('el bloqueo tambien vale en la puerta anonima (hasta donde se puede)', () => {
  it('si HAY sesion, se consulta `bloqueos` antes de encolar', () => {
    expect(cuerpo55).toContain('auth.uid()');
    expect(cuerpo55).toContain('public.bloqueos');
  });

  it('el bloqueo se mira en los DOS sentidos, como en la 0022', () => {
    // `hay_bloqueo_con` (0022) filtra "uno de los dos bloqueo al otro". Si aca
    // se mirara un solo sentido, al bloqueado le alcanzaria con ser el que
    // bloqueo primero.
    const trozo = cuerpo55.slice(cuerpo55.indexOf('public.bloqueos'));
    expect(trozo).toMatch(/b\.bloqueador = v_pet\.user_id/);
    expect(trozo).toMatch(/b\.bloqueado = v_pet\.user_id/);
  });

  it('el corte por bloqueo tambien es silencioso', () => {
    // Decir "no se pudo" confirma el bloqueo y arma al acosador (criterio 0022).
    const desde = cuerpo55.indexOf('public.bloqueos');
    expect(cuerpo55.slice(desde, desde + 260)).toMatch(/then\s*return;/);
  });

  it('NO se guarda quien avisa: `actor_id` sigue en null', () => {
    // La promesa de la pantalla es que se puede avisar sin dejar rastro. Se
    // PREGUNTA por la sesion, no se la registra.
    expect(cuerpo55).toMatch(
      /actor_id, datos\)\s*values \(\s*'avistamiento_anonimo',\s*p_pet_id,\s*v_pet\.user_id,\s*null,/,
    );
    // Y `auth.uid()` no aparece en el insert.
    const insert = cuerpo55.slice(cuerpo55.indexOf('insert into public.notification_events'));
    expect(insert).not.toContain('auth.uid()');
  });

  it('deja escrito en el SQL lo que este arreglo NO cubre', () => {
    // El agujero honesto: quien cierra sesion y abre el link publico sigue
    // pasando. Que quede en el archivo, no en la cabeza de nadie.
    const prosa = sql55.slice(0, sql55.indexOf('create or replace function'));
    expect(prosa).toContain('LO QUE NO TIENE ARREGLO');
    // Y el parrafo dice CUAL es el agujero, no solo que hay uno.
    const parrafo = prosa.slice(prosa.indexOf('LO QUE NO TIENE ARREGLO'));
    expect(parrafo.toUpperCase()).toContain('CIERRA SESION');
  });

  it('la nota se sigue recortando en la base', () => {
    expect(cuerpo55).toMatch(/left\(coalesce\(p_nota, ''\), 500\)/);
  });
});

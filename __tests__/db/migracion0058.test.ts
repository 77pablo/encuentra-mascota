import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la 0058 — TRES AGUJEROS DE LA TANDA ANTERIOR.
//
//   1. La insignia institucional sobrevivía a la suspensión y al borrado de la
//      cuenta: un "refugio" que resultó ser una estafa quedaba suspendido pero
//      sus fichas seguían firmadas "Refugio verificado" con el sello de la app,
//      y una cuenta BORRADA dejaba `institucion_nombre` e `institucion_contacto`
//      legibles para cualquiera.
//   2. `institucion_otorgar` con tres argumentos borraba la comuna y el
//      contacto, en silencio y devolviendo éxito.
//   3. `buscar_coincidencias` no tenía tope de radio siendo `security definer`
//      con `execute` para `anon`.
//
// LO QUE ESTOS TESTS INTENTAN NO SER: una lista de frases escritas a mano que
// se confirman a sí mismas. Casi todo lo de abajo cruza el SQL nuevo contra la
// VERSIÓN ANTERIOR de la misma función (0041, 0052, 0054, 0057) o contra el
// vocabulario del cliente (src/lib/institucion.ts, src/lib/radioSugerido.ts,
// src/services/profile.ts). Un número o un nombre escrito a mano acá sería una
// segunda copia de la verdad, que es exactamente el bug que se está arreglando.

const RAIZ = join(__dirname, '..', '..');
const DIR = join(RAIZ, 'supabase', 'migrations');

// Normalizado a LF: sin .gitattributes y con core.autocrlf=true un checkout
// limpio trae CRLF y cualquier comparacion multilinea se rompe para todos menos
// para quien escribio el archivo (ya paso en `legales.test.js` y en la 0052).
const leer = (...p: string[]) => readFileSync(join(...p), 'utf8').replace(/\r\n/g, '\n');
const migracion = (f: string) => leer(DIR, f);

const sql58 = migracion('0058_insignia_suspendida_y_tope_de_radio.sql');
const sql57 = migracion('0057_cuentas_institucionales.sql');
const sql54 = migracion('0054_senas_estructuradas.sql');
const sql52 = migracion('0052_adopcion_paridad.sql');
const sql41 = migracion('0041_cierre_tanda_b.sql');

const runbook = leer(RAIZ, 'docs', 'otorgar-insignia-institucional.sql');
const libInstitucion = leer(RAIZ, 'src', 'lib', 'institucion.ts');
const libRadio = leer(RAIZ, 'src', 'lib', 'radioSugerido.ts');
const servicioPerfil = leer(RAIZ, 'src', 'services', 'profile.ts');

// Sin comentarios: todo lo que sigue habla del CODIGO, no de la prosa. Sin esto
// un test pasaria porque la palabra aparece en un comentario explicando que NO
// hay que hacerla.
const sinComentarios = (s: string) => s.replace(/--[^\n]*/g, '');
const codigo58 = sinComentarios(sql58);
const codigo57 = sinComentarios(sql57);
const codigo54 = sinComentarios(sql54);
const codigo52 = sinComentarios(sql52);
const codigo41 = sinComentarios(sql41);

/** Todo lo que NO está dentro de un cuerpo `$$ … $$` (o sea: DDL suelto). */
const fueraDeFunciones = codigo58.replace(/\$\$[\s\S]*?\$\$/g, ' /*cuerpo*/ ');

/** El `create [or replace] function public.<nombre>` completo, hasta su `$$;`. */
function funcion(codigo: string, nombre: string): string | null {
  const i = codigo.search(
    new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${nombre}\\s*\\(`),
  );
  if (i === -1) return null;
  const fin = codigo.indexOf('$$;', i);
  return codigo.slice(i, fin === -1 ? codigo.length : fin + 3);
}

/** Solo el cuerpo SQL, entre `as $$` y el `$$` final. */
function cuerpo(fn: string): string {
  const i = fn.indexOf('as $$');
  return fn.slice(i + 'as $$'.length, fn.lastIndexOf('$$'));
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Las columnas del `returns table (...)`, en orden. */
function columnasDeRetorno(fn: string): string[] {
  const m = /returns table\s*\(([\s\S]*?)\)\s*\n\s*language/i.exec(fn);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((c) => c.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/** Los parámetros declarados (`p_algo tipo`), en orden. */
function parametros(fn: string): string[] {
  const abre = fn.indexOf('(');
  const cierra = fn.indexOf(')', abre);
  return [...fn.slice(abre, cierra).matchAll(/p_\w+/g)].map((m) => m[0]);
}

/** Las columnas que asigna un `update public.profiles set … where`. */
function columnasDelSet(sql: string): string[] {
  const m = /update\s+public\.profiles\s+set([\s\S]*?)\bwhere\b/i.exec(sql);
  if (!m) return [];
  return [...m[1].matchAll(/(\w+)\s*=/g)].map((x) => x[1]);
}

/** Las tablas de las que borra una función (`delete from public.X`). */
function tablasQueBorra(sql: string): string[] {
  return [...sql.matchAll(/delete\s+from\s+public\.(\w+)/gi)].map((m) => m[1]).sort();
}

/** La expresion de vigencia que use un archivo, normalizada. (Igual que 0057.) */
function vigenciaDe(codigo: string): string | null {
  const m = codigo.match(
    /coalesce\(\s*\w+\.renovado_en\s*,\s*\w+\.creado_en\s*\)\s*>=\s*now\(\)\s*-\s*interval\s*'[^']+'/,
  );
  return m ? m[0].replace(/\s+/g, ' ').replace(/\b\w+\./g, '') : null;
}

/** Las columnas `institucion_*` que el cliente lee para dibujar la insignia. */
const COLUMNAS_DE_LA_INSIGNIA = [
  ...new Set([...libInstitucion.matchAll(/fila\.(institucion_\w+)/g)].map((m) => m[1])),
].sort();

// ───────────────────────────────────────────────────────────────────────────
// ANTI-VACUIDAD. Si un parser no encuentra nada, todo lo de abajo pasa en verde
// sin haber mirado una línea de SQL.
// ───────────────────────────────────────────────────────────────────────────
describe('los parsers encuentran lo que dicen buscar', () => {
  it('encuentra las seis funciones de la migracion', () => {
    for (const f of [
      '_insignia_publica',
      'perfil_publico',
      'autor_publico',
      'anonimizar_mi_cuenta',
      'institucion_otorgar',
      'buscar_coincidencias',
    ]) {
      expect(funcion(codigo58, f)).not.toBeNull();
    }
    expect(funcion(codigo58, 'no_existe_esta_funcion')).toBeNull();
  });

  it('lee firmas, retornos, updates y deletes', () => {
    expect(columnasDeRetorno(funcion(codigo58, 'perfil_publico')!).length).toBeGreaterThanOrEqual(14);
    expect(parametros(funcion(codigo58, 'institucion_otorgar')!).length).toBe(5);
    expect(columnasDelSet(funcion(codigo58, 'anonimizar_mi_cuenta')!).length).toBeGreaterThanOrEqual(10);
    expect(tablasQueBorra(funcion(codigo41, 'anonimizar_mi_cuenta')!).length).toBeGreaterThanOrEqual(7);
    expect(vigenciaDe(codigo52)).not.toBeNull();
  });

  it('lee el vocabulario del cliente', () => {
    // Las cinco columnas que mira `institucionDe` para dibujar la insignia.
    expect(COLUMNAS_DE_LA_INSIGNIA).toHaveLength(5);
    expect(COLUMNAS_DE_LA_INSIGNIA).toContain('institucion_verificada_en');
    expect(libRadio).toContain('topeKm');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ARREGLO 1a — SUSPENDER DEJA DE MOSTRAR LA INSIGNIA (sin destruir el dato).
// ───────────────────────────────────────────────────────────────────────────
describe('la insignia no sobrevive a la suspension', () => {
  const helper = funcion(codigo58, '_insignia_publica')!;

  it('la regla esta escrita UNA sola vez, no copiada en cada camino de lectura', () => {
    // Si alguien la copia dentro de `perfil_publico` o de `autor_publico`, el
    // día que afloje una de las dos el perfil va a decir una cosa y la ficha
    // otra sobre la misma cuenta. Por eso vive en `_insignia_publica`.
    const apariciones = codigo58.match(/suspendido_en is null/g) ?? [];
    expect(apariciones).toHaveLength(1);
    expect(helper).toContain('suspendido_en is null');
  });

  it('los DOS caminos de lectura publicos pasan por el helper', () => {
    for (const f of ['perfil_publico', 'autor_publico']) {
      const c = cuerpo(funcion(codigo58, f)!);
      expect(c).toContain('public._insignia_publica(p.id)');
      expect(c).toContain('left join lateral');
      // Y ninguno lee las columnas crudas del perfil por su cuenta: si lo
      // hiciera, el filtro del helper no serviría de nada.
      expect(c).not.toMatch(/p\.institucion_/);
    }
  });

  it('se anulan las CINCO columnas que el cliente mira, no solo la fecha', () => {
    // La lista sale de `institucionDe` (src/lib/institucion.ts). Devolver el
    // nombre del "refugio" suspendido con la fecha en null alcanzaría para que
    // `institucionDe` no dibuje nada HOY, pero deja el dato viajando al cliente
    // para la primera pantalla que lo lea sin pasar por ahí.
    expect(columnasDeRetorno(helper).sort()).toEqual(COLUMNAS_DE_LA_INSIGNIA);
  });

  it('el helper no queda al alcance de nadie (seria un oraculo de suspendido_en)', () => {
    // `suspendido_en` no se le concedio nunca a nadie (0036). Poder llamar al
    // helper y comparar con un select directo diría, de cualquier cuenta
    // institucional, si moderación la suspendió. Mismo criterio que
    // `_denunciado_de` (0040), que tampoco se concede.
    expect(codigo58).toMatch(
      /revoke all on function public\._insignia_publica\(uuid\) from public, anon, authenticated;/,
    );
    expect(codigo58).not.toMatch(/grant execute on function public\._insignia_publica/);
  });

  it('NO se destruye nada al suspender: la migracion no toca moderar_suspender', () => {
    // Suspender es reversible (`moderar_reactivar`, 0045). Si suspender borrara
    // el nombre y el contacto, reactivar no devolvería la cuenta a como estaba.
    expect(codigo58).not.toContain('moderar_suspender');
    expect(codigo58).not.toContain('moderar_reactivar');
  });
});

describe('perfil_publico se recrea desde la 0057, sin perder nada', () => {
  const nueva = funcion(codigo58, 'perfil_publico')!;
  const vieja = funcion(codigo57, 'perfil_publico')!;

  it('el retorno es IDENTICO al de la 0057 (por eso no hace falta drop)', () => {
    // La lista no está escrita acá: sale de la 0057. Si se cae una columna, la
    // app deja de recibirla sin que nada se ponga rojo (un select que ya no
    // trae una columna no tira error).
    expect(columnasDeRetorno(nueva)).toEqual(columnasDeRetorno(vieja));
    expect(codigo58).toContain('create or replace function public.perfil_publico');
    expect(codigo58).not.toMatch(/drop function[^\n]*perfil_publico/);
  });

  it('conserva las CUATRO cuentas y la vigencia identica a la del feed (0052)', () => {
    const c = cuerpo(nueva);
    expect(c).toContain('pe.reunida_en is not null');
    expect(c).toContain('public.sightings');
    expect(c).toContain('public.pet_tips');
    expect(c).toContain('from public.adoptions ad');
    expect(vigenciaDe(c)).toBe(vigenciaDe(codigo52));
  });

  it('sigue sin exponer las cuentas eliminadas', () => {
    expect(cuerpo(nueva)).toContain('p.eliminado_en is null');
  });

  it('el perfil publico sigue siendo publico (los grants se reponen)', () => {
    expect(codigo58).toContain('grant execute on function public.perfil_publico(uuid) to anon;');
    expect(codigo58).toContain('grant execute on function public.perfil_publico(uuid) to authenticated;');
  });
});

describe('autor_publico — la firma "Publicado por …" de la ficha', () => {
  const fn = funcion(codigo58, 'autor_publico')!;

  it('devuelve el nombre ademas de la insignia (una sola consulta, como la 0057)', () => {
    expect(columnasDeRetorno(fn)[0]).toBe('nombre');
    expect(columnasDeRetorno(fn).slice(1).sort()).toEqual(COLUMNAS_DE_LA_INSIGNIA);
  });

  it('una lapida no se firma', () => {
    expect(cuerpo(fn)).toContain('p.eliminado_en is null');
  });

  it('se puede leer sin cuenta: la ficha es publica (modo invitado)', () => {
    expect(codigo58).toContain('grant execute on function public.autor_publico(uuid) to anon;');
    expect(codigo58).toContain('grant execute on function public.autor_publico(uuid) to authenticated;');
    expect(fn).toContain('security definer');
    expect(fn).toContain('set search_path = public, pg_temp');
  });

  it('el cliente llama a ESTA funcion, y sigue teniendo escalon de respaldo', () => {
    // El nombre no está escrito dos veces: se saca del servicio y se exige que
    // la migración cree esa función. Si mañana alguien renombra una de las dos
    // puntas, esto se pone rojo en vez de dejar la firma sin insignia.
    const llamada = /supabase\.rpc\('(\w+)',\s*\{\s*p_user_id/.exec(servicioPerfil);
    expect(llamada).not.toBeNull();
    expect(funcion(codigo58, llamada![1])).not.toBeNull();
    // Y con la migración SIN aplicar la firma no puede desaparecer de todas las
    // fichas: PGRST202 tiene que caer al select de siempre.
    const getAutor = servicioPerfil.slice(servicioPerfil.indexOf('export async function getAutorPublico'));
    expect(getAutor).toContain('PGRST202');
    expect(getAutor).toContain('CAMPOS_AUTOR_CON_INSTITUCION');
  });

  it('la migracion NO le quita a nadie el grant de lectura sobre profiles', () => {
    // Quitarlo cerraría el select directo, pero le devolvería 42501 a la app
    // vieja que todavía esté cacheada en un navegador, y `esColumnaInexistente`
    // no lo reconoce: "Publicado por …" desaparecería de TODAS las fichas.
    expect(codigo58).not.toMatch(/revoke\s+select[^\n]*public\.profiles/i);
    expect(codigo58).not.toMatch(/grant\s+(select|update|insert)[^\n]*public\.profiles/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ARREGLO 1b — BORRAR LA CUENTA SÍ SE LLEVA LA INSTITUCIÓN.
// ───────────────────────────────────────────────────────────────────────────
describe('anonimizar_mi_cuenta se recrea desde la 0041 (NO desde la 0017)', () => {
  const nueva = funcion(codigo58, 'anonimizar_mi_cuenta')!;
  const vieja = funcion(codigo41, 'anonimizar_mi_cuenta')!;

  it('no pierde ni un delete de la version viva', () => {
    // La 0017 la creó, la 0037 le sumó `web_push_subscriptions` y la 0041 le
    // sumó `bloqueos` (un agujero de privacidad real). Partir de la 0017 —que
    // es la que uno encuentra primero— habría desandado las dos, y el borrado
    // de cuenta seguiría devolviendo 200.
    const antes = tablasQueBorra(vieja);
    expect(antes).toContain('bloqueos');
    expect(antes).toContain('web_push_subscriptions');
    expect(tablasQueBorra(nueva)).toEqual(antes);
  });

  it('conserva el gate de sesion y la idempotencia', () => {
    expect(nueva).toContain('uid uuid := auth.uid()');
    expect(nueva).toMatch(/if uid is null then\s*raise exception/);
    expect(nueva).toContain('p.eliminado_en is not null');
  });

  it('conserva todo lo que ya anonimizaba y suma las columnas de la insignia', () => {
    const antes = columnasDelSet(vieja);
    const ahora = columnasDelSet(nueva);
    expect(antes).toContain('eliminado_en');
    for (const col of antes) expect(ahora).toContain(col);
    for (const col of COLUMNAS_DE_LA_INSIGNIA) expect(ahora).toContain(col);
  });

  it('limpia las cinco JUNTAS o el CHECK de la 0057 rompe el borrado de cuenta', () => {
    // `profiles_institucion_completa` exige que si `institucion_verificada_en`
    // no es null, haya tipo y nombre. Limpiar el nombre dejando la fecha viola
    // el CHECK y hace fallar el update ENTERO: borrar la cuenta empezaría a dar
    // error justo para las cuentas institucionales, DESPUÉS de haberles borrado
    // los reportes.
    expect(codigo57).toContain('add constraint profiles_institucion_completa');
    const ahora = columnasDelSet(nueva);
    if (ahora.includes('institucion_nombre') || ahora.includes('institucion_tipo')) {
      expect(ahora).toContain('institucion_verificada_en');
    }
  });

  it('NO borra quien firmo la verificacion: ese uuid es del admin, no del que se va', () => {
    // Regla de la 0017: "lo que además es de otro sobrevive sin vos". Es el
    // único rastro de quién puso el sello en una cuenta que terminó mal, y
    // nadie lo puede leer (la 0057 lo dejó fuera del grant a propósito).
    expect(columnasDelSet(nueva)).not.toContain('institucion_verificada_por');
    expect(codigo57).not.toMatch(/grant select \([^)]*institucion_verificada_por/);
  });
});

describe('las lapidas que ya existen se limpian una vez', () => {
  const sueltos = fueraDeFunciones.match(/update\s+public\.profiles[\s\S]*?;/gi) ?? [];
  const backfill = sueltos[0] ?? '';

  it('hay exactamente UN update suelto y no puede tocar una cuenta viva', () => {
    expect(sueltos).toHaveLength(1);
    expect(backfill).toMatch(/where\s+eliminado_en is not null/);
  });

  it('limpia exactamente las mismas columnas que la RPC (no dos listas que se separen)', () => {
    const enLaRpc = columnasDelSet(funcion(codigo58, 'anonimizar_mi_cuenta')!)
      .filter((c) => c.startsWith('institucion_'))
      .sort();
    expect(columnasDelSet(backfill).sort()).toEqual(enLaRpc);
  });

  it('es re-ejecutable: la segunda corrida no reescribe NULL sobre NULL', () => {
    expect(backfill).toMatch(/is not null/);
    expect(backfill).toContain('institucion_nombre is not null');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ARREGLO 2 — CORREGIR UN DATO DEJA DE BORRAR LOS OTROS.
// ───────────────────────────────────────────────────────────────────────────
describe('institucion_otorgar', () => {
  const nueva = funcion(codigo58, 'institucion_otorgar')!;
  const vieja = funcion(codigo57, 'institucion_otorgar')!;

  it('la FIRMA no cambia: el runbook y su test siguen siendo validos', () => {
    expect(parametros(nueva)).toEqual(parametros(vieja));
    expect(codigo58).toContain('create or replace function public.institucion_otorgar');
  });

  it('llamarla con tres argumentos ya NO pisa la comuna ni el contacto', () => {
    for (const campo of ['comuna', 'contacto']) {
      // La forma vieja (`institucion_X = nullif(btrim(coalesce(p_X, '')), '')`)
      // pisaba siempre. La forma que solo usa `coalesce` para conservar
      // arreglaría esto y rompería lo otro: ya no se podría BORRAR un dato mal
      // cargado. Por eso se exige la rama explícita sobre "vino o no vino".
      expect(nueva).toMatch(
        new RegExp(`institucion_${campo}\\s*=\\s*case\\s+when p_${campo} is null then institucion_${campo}`),
      );
      expect(nueva).not.toMatch(new RegExp(`institucion_${campo}\\s*=\\s*nullif`));
    }
  });

  it('pero se puede seguir BORRANDO: vacio sigue guardando NULL', () => {
    for (const campo of ['comuna', 'contacto']) {
      expect(nueva).toMatch(new RegExp(`else nullif\\(btrim\\(p_${campo}\\), ''\\)`));
    }
  });

  it('conserva la fecha original de la verificacion y el resto del gate', () => {
    expect(nueva).toContain('institucion_verificada_en = coalesce(institucion_verificada_en, now())');
    expect(nueva).toMatch(/if not public\.es_admin\(\) then raise exception/);
    expect(nueva).toContain('security definer');
    expect(nueva).toContain('set search_path = public, pg_temp');
    expect(nueva).toContain('eliminado_en is null');
  });

  it('sigue sin haber exito mudo', () => {
    // Un "listo" sobre una cuenta que no existe es peor que un error a la vista
    // (criterio de la 0045).
    expect(nueva).toMatch(/if not found then raise exception/);
  });

  it('el runbook quedo coherente con la firma nueva', () => {
    const seccion = runbook.slice(runbook.indexOf('1) OTORGAR'), runbook.indexOf('2) COMPROBAR'));
    // Ya no puede seguir diciendo que hay que pasar los cinco sí o sí para no
    // perder datos: ahora null es "no lo toques".
    expect(seccion).not.toMatch(/Pasar SIEMPRE los cinco argumentos/i);
    expect(seccion).not.toMatch(/borra la comuna y el contacto sin decir/i);
    // Y tiene que documentar las DOS operaciones, o la de borrar queda oculta.
    expect(seccion).toContain('p_comuna');
    expect(seccion).toMatch(/''/);
    expect(seccion).toMatch(/null/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ARREGLO 3 — TOPE DE RADIO.
// ───────────────────────────────────────────────────────────────────────────
describe('buscar_coincidencias tiene tope de radio', () => {
  const nueva = funcion(codigo58, 'buscar_coincidencias')!;
  const vieja = funcion(codigo54, 'buscar_coincidencias')!;

  /** El `least(coalesce(p_radio_km, D), T)` que se le pasa a `st_dwithin`. */
  const tope = /least\(coalesce\(p_radio_km,\s*(\d+)\),\s*(\d+)\)/.exec(nueva);

  it('el radio pasa por el mismo tratamiento que p_limite', () => {
    expect(tope).not.toBeNull();
    expect(nueva).toContain(`st_dwithin(p.ubicacion, b.ubicacion, ${tope![0]} * 1000)`);
    // Y el tope de p_limite no se toca de paso.
    expect(nueva).toContain('limit least(coalesce(p_limite, 10), 50);');
  });

  it('el numero sale de lo mas ancho que la app pide de verdad', () => {
    // No está escrito a mano acá: se calcula desde src/lib/radioSugerido.ts.
    // Si mañana alguien amplía el tope del cliente y se olvida de la base, esto
    // se pone rojo en vez de empezar a recortar búsquedas legítimas en silencio.
    const topesCliente = [...libRadio.matchAll(/topeKm:\s*(\d+)/g)].map((m) => Number(m[1]));
    const opciones = /OPCIONES_RADIO_EXPLORAR\s*=\s*\[([^\]]*)\]/.exec(libRadio);
    expect(topesCliente.length).toBeGreaterThanOrEqual(4);
    expect(opciones).not.toBeNull();
    const masAncho = Math.max(
      ...topesCliente,
      ...opciones![1].split(',').map((n) => Number(n.trim())),
    );
    expect(Number(tope![2])).toBe(masAncho);
  });

  it('el null explicito cae en el default declarado, no en una lista vacia', () => {
    // `p_radio_km: null` desde el cliente hacía que `st_dwithin` devolviera NULL
    // y la lista saliera vacía SIN error. El coalesce tiene que usar el mismo
    // número que el `default` de la firma, o el bug se muda de lugar.
    const declarado = /p_radio_km double precision default (\d+)/.exec(nueva);
    expect(declarado).not.toBeNull();
    expect(tope![1]).toBe(declarado![1]);
  });

  it('el resto del cuerpo es la 0054 LETRA POR LETRA', () => {
    // El test más importante del bloque. Recrear una función partiendo de una
    // versión vieja borra arreglos posteriores sin que nada se ponga rojo (ya
    // pasó con `buscar_reportes`). Acá el cuerpo nuevo, con el tope revertido a
    // mano, tiene que ser EXACTAMENTE el de la 0054: el cruce de chip, el
    // `es_mio`, la vigencia, el orden por puntaje, todo.
    const revertido = norm(cuerpo(nueva)).replace(tope![0], 'p_radio_km');
    expect(revertido).toBe(norm(cuerpo(vieja)));
  });

  it('sigue siendo definer con los mismos grants, y sin drop', () => {
    // Sin drop no hay ventana sin función ni riesgo de dejar dos firmas vivas.
    expect(codigo58).toContain('create or replace function public.buscar_coincidencias');
    expect(codigo58).not.toMatch(/drop function[^\n]*buscar_coincidencias/);
    expect(codigo58).toContain('grant execute on function public.buscar_coincidencias(uuid, double precision, int) to anon;');
    expect(codigo58).toContain('grant execute on function public.buscar_coincidencias(uuid, double precision, int) to authenticated;');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// APLICARLA NO PUEDE SALIR MAL EN SILENCIO.
// ───────────────────────────────────────────────────────────────────────────
describe('la migracion es segura de aplicar', () => {
  it('la autoverificacion final cubre TODAS las funciones que toca', () => {
    // La idea es de la 0054: `drop function if exists` con una firma que no
    // calza es silencioso y deja DOS versiones vivas, y PostgREST devuelve
    // error de ambigüedad. Acá no se dropea nada, pero una sobrecarga vieja ya
    // existente tampoco la tocaría este `create or replace`.
    const bloque = codigo58.slice(codigo58.lastIndexOf('do $$'));
    expect(bloque).toContain('pg_proc');
    const creadas = [...codigo58.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
    expect(creadas.length).toBeGreaterThanOrEqual(6);
    for (const f of creadas) expect(bloque).toContain(`'${f}'`);
  });

  it('no borra ni pisa nada fuera de la RPC de borrado y del backfill', () => {
    expect(codigo58).not.toMatch(/\bdrop table\b/i);
    expect(codigo58).not.toMatch(/\bdrop column\b/i);
    expect(codigo58).not.toMatch(/\bdrop function\b/i);
    // Los `delete from` viven todos DENTRO de `anonimizar_mi_cuenta`.
    expect(fueraDeFunciones).not.toMatch(/\bdelete from\b/i);
  });

  it('no toca policies ni constraints (esta migracion es solo de funciones)', () => {
    expect(codigo58).not.toMatch(/create policy/i);
    expect(codigo58).not.toMatch(/drop policy/i);
    expect(codigo58).not.toMatch(/alter table/i);
  });

  it('toda funcion definer fija su search_path', () => {
    const bloques = codigo58.split(/create or replace function/).slice(1);
    expect(bloques.length).toBeGreaterThanOrEqual(6);
    for (const b of bloques) {
      const cabecera = b.slice(0, b.indexOf('as $$'));
      if (/security definer/.test(cabecera)) {
        expect(cabecera).toMatch(/set search_path = public, pg_temp/);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Este guardrail viaja SIEMPRE con la migracion mas nueva del repo. Su gracia
// es ponerse rojo cuando aparece otra sin que nadie revise el orden de
// aplicacion. Si se agrega una 0059, hay que MOVERLO (no duplicarlo): en la
// tanda 10, tres agentes lo copiaron a la vez y quedaron tres copias afirmando
// numeros distintos, dos de ellas rojas para siempre. Venia de
// `__tests__/db/migracion0057.test.ts`.
// ───────────────────────────────────────────────────────────────────────────
describe('0058 es la ultima migracion del repo', () => {
  it('no hay ninguna migracion con numero mayor', () => {
    const numeros = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n));
    expect(Math.max(...numeros)).toBe(58);
  });
});

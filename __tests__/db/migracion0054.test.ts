import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  CHIP_BASURA_SQL,
  CHIP_LARGO_MAX,
  COLORES,
  ESTERILIZADOS,
  MAX_COLORES,
  SEXOS,
  TAMANOS,
  TAMANOS_INCOMPATIBLES,
} from '../../src/lib/senasMascota';

// GUARDRAIL ESTATICO de la 0054 — SEÑAS ESTRUCTURADAS.
//
// No prueba la base real (es un archivo de texto): ata las decisiones que, si
// alguien las afloja al editar el SQL, no se notan hasta que ya hay datos y
// gente esperando una coincidencia.
//
// Esta migracion es peligrosa por tres motivos distintos:
//
//   1. RECREA TRES funciones que ya existen y estan en uso (`buscar_reportes`,
//      `buscar_coincidencias`, `enqueue_coincidencias`). Recrear partiendo de
//      una version vieja borra arreglos posteriores sin que nada se ponga rojo.
//      Ya paso con `buscar_reportes` y casi con `buscar_adopciones`.
//   2. Agrega columnas a `pets`, que media app lee con `select('*')`. La web
//      tiene que andar con esto SIN aplicar.
//   3. Toca el dato mas sensible del proyecto (el numero de chip).
//
// Los tests que mas valen no comparan contra frases escritas a mano aca: cruzan
// el SQL contra la version ANTERIOR de cada funcion, y contra el vocabulario del
// cliente (`src/lib/senasMascota.ts`). Si alguien cambia un solo lado, esto se
// pone rojo.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

// Normalizado a LF antes de comparar nada: sin .gitattributes y con
// core.autocrlf=true, el archivo queda con LF donde se escribio y con CRLF tras
// cualquier checkout limpio. Ya paso dos veces en este repo.
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');

const sql54 = leer('0054_senas_estructuradas.sql');
const sql28 = leer('0028_ciclo_vida.sql');
const sql29 = leer('0029_coincidencias_vencimiento.sql');

// Las aserciones corren sobre el CODIGO: el archivo explica en prosa lo mismo
// que verifica, asi que buscar sobre el texto crudo da falsos positivos.
const quitarComentarios = (s: string) => s.replace(/--[^\n]*/g, '');
const codigo = quitarComentarios(sql54);
const codigo28 = quitarComentarios(sql28);
const codigo29 = quitarComentarios(sql29);

/** El bloque desde `create [or replace] function public.<nombre>(` hasta su `$$;`. */
function bloqueDe(src: string, nombre: string): string {
  const re = new RegExp(`create (or replace )?function public\\.${nombre}\\(`);
  const m = re.exec(src);
  expect(m).not.toBeNull();
  const desde = m!.index;
  const fin = src.indexOf('$$;', desde);
  expect(fin).toBeGreaterThan(desde);
  return src.slice(desde, fin);
}

/** La lista de parametros del `create function`, normalizada a un espacio. */
function parametrosDe(src: string, nombre: string): string {
  const bloque = bloqueDe(src, nombre);
  const abre = bloque.indexOf('(');
  let nivel = 0;
  for (let i = abre; i < bloque.length; i++) {
    if (bloque[i] === '(') nivel++;
    else if (bloque[i] === ')' && --nivel === 0) {
      return bloque.slice(abre + 1, i).replace(/\s+/g, ' ').trim();
    }
  }
  throw new Error(`no se cerraron los parametros de ${nombre}`);
}

/** La lista de `returns table ( … )`, normalizada a un espacio. */
function retornoDe(src: string, nombre: string): string {
  const bloque = bloqueDe(src, nombre);
  const abre = bloque.indexOf('returns table');
  expect(abre).toBeGreaterThanOrEqual(0);
  const par = bloque.indexOf('(', abre);
  let nivel = 0;
  for (let i = par; i < bloque.length; i++) {
    if (bloque[i] === '(') nivel++;
    else if (bloque[i] === ')' && --nivel === 0) {
      return bloque.slice(par + 1, i).replace(/\s+/g, ' ').trim();
    }
  }
  throw new Error(`no se cerro el returns table de ${nombre}`);
}

/** El cuerpo `as $$ … $$;`. */
function cuerpoDe(src: string, nombre: string): string {
  const bloque = bloqueDe(src, nombre);
  const abre = bloque.indexOf('as $$');
  expect(abre).toBeGreaterThan(0);
  return bloque.slice(abre + 5);
}

// ───────────────────────────────────────────────────────────────────────────
// 0. El parser lee de verdad (si no, TODO lo de abajo pasa por vacio)
// ───────────────────────────────────────────────────────────────────────────
describe('el parser encuentra lo que dice buscar', () => {
  it('encuentra las funciones de las dos migraciones que se cruzan', () => {
    expect(cuerpoDe(codigo54Src(), 'buscar_reportes').length).toBeGreaterThan(800);
    expect(cuerpoDe(codigo, 'buscar_coincidencias').length).toBeGreaterThan(500);
    expect(cuerpoDe(codigo, 'enqueue_coincidencias').length).toBeGreaterThan(500);
    expect(cuerpoDe(codigo28, 'buscar_reportes').length).toBeGreaterThan(800);
    expect(cuerpoDe(codigo29, 'buscar_coincidencias').length).toBeGreaterThan(500);
  });

  function codigo54Src() {
    return codigo;
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 1. Las columnas nuevas de `pets`
// ───────────────────────────────────────────────────────────────────────────
describe('las columnas nuevas de pets', () => {
  it('se agregan de forma idempotente y TODAS son opcionales', () => {
    for (const col of ['colores text[]', 'tamano text', 'sexo text', 'esterilizado text']) {
      expect(codigo).toContain(`add column if not exists ${col}`);
    }
    // Un `not null` obligaria a inventar una respuesta y un `default` haria
    // pasar por dato del dueño algo que nadie contesto. Los reportes ya
    // publicados quedan en null, que es exactamente lo que corresponde.
    expect(codigo).not.toMatch(/add column if not exists (colores|tamano|sexo|esterilizado)[^;]*not null/);
    expect(codigo).not.toMatch(/add column if not exists (colores|tamano|sexo|esterilizado)[^;]*default/);
  });

  it('los CHECK aceptan null y son re-ejecutables', () => {
    for (const c of ['pets_tamano_valido', 'pets_sexo_valido', 'pets_esterilizado_valido', 'pets_colores_validos']) {
      expect(codigo).toContain(`drop constraint if exists ${c}`);
      expect(codigo).toContain(`add constraint ${c}`);
    }
    expect(codigo).toMatch(/tamano is null or tamano in \(/);
    expect(codigo).toMatch(/sexo is null or sexo in \(/);
    expect(codigo).toMatch(/esterilizado is null or esterilizado in \(/);
    // El de colores esta partido en varias lineas: se compara sin espacios.
    expect(codigo.replace(/\s+/g, ' ')).toMatch(/colores is null or/);
  });

  it('los valores son EXACTAMENTE los del cliente (mismo vocabulario)', () => {
    // ESTE es el test que importa de esta seccion: no compara contra una lista
    // escrita a mano aca, sino contra la que usa la app. Agregar un color en
    // src/lib/senasMascota.ts y olvidarse del CHECK haria que publicar con ese
    // color reventara el insert entero.
    const lista = (nombre: string) => {
      const i = codigo.indexOf(`add constraint ${nombre}`);
      expect(i).toBeGreaterThanOrEqual(0);
      return codigo.slice(i, codigo.indexOf(';', i));
    };
    for (const t of TAMANOS) expect(lista('pets_tamano_valido')).toContain(`'${t}'`);
    for (const s of SEXOS) expect(lista('pets_sexo_valido')).toContain(`'${s}'`);
    for (const e of ESTERILIZADOS) expect(lista('pets_esterilizado_valido')).toContain(`'${e}'`);
    for (const c of COLORES) expect(lista('pets_colores_validos')).toContain(`'${c}'`);
    // Y al reves: nada de mas. Un valor que la base acepte y el cliente no sepa
    // dibujar sale como un chip en blanco.
    const enElCheck = [...lista('pets_colores_validos').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(enElCheck.sort()).toEqual([...COLORES].sort());
  });

  it('el tope de colores del CHECK es el MISMO numero que el del cliente', () => {
    const check = codigo.slice(
      codigo.indexOf('add constraint pets_colores_validos'),
      codigo.indexOf(';', codigo.indexOf('add constraint pets_colores_validos')),
    );
    const m = check.match(/array_length\(colores, 1\), 0\) <= (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(MAX_COLORES);
  });

  it('una lista de colores VACIA no puede impedir publicar', () => {
    // El cliente manda null cuando no eligieron nada, pero si por lo que sea
    // llegara `{}`, el CHECK tiene que dejarlo pasar: PostgREST rebota el insert
    // ENTERO ante una violacion, o sea que la mascota perdida no se publica.
    // Por eso el limite es "<= N" y no "between 1 and N".
    expect(codigo).not.toMatch(/array_length\(colores, 1\), 0\) between 1/);
  });

  it('el CHIP no es una columna de pets', () => {
    // La decision central de esta migracion. `pets` se lee con select('*') en
    // media app y lo exponen las RPC publicas: una columna `chip` ahi habria
    // estado a un select('*') de distancia de salir impresa en la ficha publica.
    // Es literalmente el argumento escrito en la 0047 para las señas privadas.
    expect(codigo).not.toMatch(/alter table public\.pets[\s\S]{0,200}?add column[^;]*\bchip\b/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. El chip vive aparte y NO se publica
// ───────────────────────────────────────────────────────────────────────────
describe('pet_chips: el dato mas fuerte y el mas sensible', () => {
  it('es su propia tabla, cerrada por RLS al dueño', () => {
    expect(codigo).toContain('create table if not exists public.pet_chips');
    expect(codigo).toContain('alter table public.pet_chips enable row level security');
    const iPolicy = codigo.indexOf('on public.pet_chips for');
    expect(iPolicy).toBeGreaterThanOrEqual(0);
    const policy = codigo.slice(iPolicy, codigo.indexOf(';', iPolicy));
    expect(policy).toContain('to authenticated');
    expect(policy).toContain('auth.uid() = user_id');
    // Igual que en la 0047: el `with check` mira TAMBIEN que el reporte sea
    // suyo. Sin eso, cualquiera le cuelga un chip al reporte de un vecino.
    expect(policy).toContain('p.user_id = auth.uid()');
    expect(policy).not.toContain('anon');
  });

  it('hay UNA sola policy: en Postgres las permisivas se SUMAN', () => {
    // Una segunda policy mas laxa anularia a la de arriba sin que nadie lo note.
    // Misma leccion escrita en la 0047.
    const policies = [...codigo.matchAll(/on public\.pet_chips for/g)];
    expect(policies).toHaveLength(1);
  });

  it('anon no aparece en ningun grant y se le revoca explicitamente', () => {
    expect(codigo).toContain('revoke all on public.pet_chips from public, anon;');
    expect(codigo).toContain('grant select, insert, update, delete on public.pet_chips to authenticated;');
    expect(codigo).not.toMatch(/grant[^;]*on public\.pet_chips[^;]*to anon/);
  });

  it('ninguna funcion DEVUELVE el chip: no aparece en ningun returns table', () => {
    // ESTE es el contrato de privacidad, y es el mismo que ya tiene
    // `mascota_por_collar` (0027) con su test. Si un campo no esta en la lista
    // de retorno, no hay forma de sacarlo por esa via aunque la funcion sea
    // security definer.
    const retornos = [...codigo.matchAll(/returns table \(([\s\S]*?)\)\s*\n/g)].map((m) => m[1]);
    expect(retornos.length).toBeGreaterThanOrEqual(2);
    for (const ret of retornos) {
      expect(ret).not.toMatch(/\bchip\b/);
      expect(ret).not.toMatch(/chip_norm/);
    }
    // Lo unico que sale es un booleano: "coincide", nunca el numero.
    expect(retornoDe(codigo, 'buscar_coincidencias')).toContain('chip_coincide boolean');
  });

  it('la limpieza del chip es la MISMA expresion que usa el cliente', () => {
    // Si las dos se separan, "985 112" guardado desde la app y "985112"
    // tecleado por otra persona dejan de cruzarse. El chip es el dato mas
    // fuerte que tenemos: que no cruce es perderlo entero.
    expect(codigo).toContain(`regexp_replace(chip, '${CHIP_BASURA_SQL}', '', 'g')`);
    expect(codigo).toContain('chip_norm text generated always as');
    expect(codigo).toContain('stored');
  });

  it('el largo maximo del chip en la base cubre lo que acepta el cliente', () => {
    const m = codigo.match(/pet_chips_chip_largo\s*\n?\s*check \(length\(btrim\(chip\)\) between 1 and (\d+)\)/);
    expect(m).not.toBeNull();
    // Se guarda el texto tal como lo tipearon (con separadores), asi que el tope
    // de la base tiene que ser MAYOR que el del numero limpio.
    expect(Number(m![1])).toBeGreaterThanOrEqual(CHIP_LARGO_MAX);
  });

  it('un chip que se normaliza a vacio nunca cruza con nadie', () => {
    // '---' pasa el check de largo y deja chip_norm = ''. Sin este guardia,
    // TODOS los reportes con chip basura serian "coincidencia casi segura"
    // entre si — el peor falso positivo posible.
    const usos = [...codigo.matchAll(/chip_norm/g)];
    expect(usos.length).toBeGreaterThan(3);
    expect(codigo).toMatch(/chip_norm <> ''/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Las reglas de descarte y puntaje: UNA sola definicion
// ───────────────────────────────────────────────────────────────────────────
describe('senas_contradicen / senas_puntaje', () => {
  const contradicen = cuerpoDe(codigo, 'senas_contradicen');
  const puntaje = cuerpoDe(codigo, 'senas_puntaje');

  it('las dos son inmutables y no leen tablas (son reglas puras)', () => {
    expect(bloqueDe(codigo, 'senas_contradicen')).toContain('immutable');
    expect(bloqueDe(codigo, 'senas_puntaje')).toContain('immutable');
    for (const cuerpo of [contradicen, puntaje]) {
      expect(cuerpo).not.toMatch(/\bfrom public\./);
    }
  });

  it('lo que FALTA no descarta: la contradiccion exige los dos lados', () => {
    // La regla mas importante de toda la migracion. Hoy hay miles de reportes
    // publicados sin ninguno de estos campos; un motor que los exija se queda
    // sin coincidencias para todos ellos.
    expect(contradicen).toContain('coalesce(array_length(p_colores_a, 1), 0) > 0');
    expect(contradicen).toContain('coalesce(array_length(p_colores_b, 1), 0) > 0');
    // `&&` es "se solapan": basta UN color en comun para no contradecir.
    expect(contradicen).toContain('not (p_colores_a && p_colores_b)');
  });

  it('el resultado nunca es NULL (un null en el WHERE descarta la fila)', () => {
    // `p_tamano_a = 'chico'` con null da NULL, y `where not senas_contradicen(...)`
    // con NULL filtra la fila igual que si contradijera: perderiamos justo las
    // coincidencias de los reportes sin datos, que son la mayoria.
    const coalesces = [...contradicen.matchAll(/coalesce\(/g)];
    expect(coalesces.length).toBeGreaterThanOrEqual(3);
    // Las DOS mitades (color y tamaño) tienen que estar envueltas: si solo una
    // lo esta, el `or` propaga el NULL de la otra igual.
    expect([...contradicen.matchAll(/,\s*false\s*\)/g)]).toHaveLength(2);
  });

  it('el tamaño solo descarta en los extremos, y son los MISMOS pares del cliente', () => {
    for (const [a, b] of TAMANOS_INCOMPATIBLES) {
      expect(contradicen).toContain(`p_tamano_a = '${a}' and p_tamano_b = '${b}'`);
      expect(contradicen).toContain(`p_tamano_a = '${b}' and p_tamano_b = '${a}'`);
    }
    // Y nada mas: 'mediano' no puede aparecer como parte de una contradiccion.
    expect(contradicen).not.toContain("'mediano'");
  });

  it('el chip pesa MUCHISIMO mas que la cercania', () => {
    // "El chip que coincide es una coincidencia casi segura." Si el peso del
    // chip fuera comparable al de la distancia, un match a 200 m sin chip
    // adelantaria a uno con el mismo chip a 12 km — que es exactamente al reves.
    const mChip = puntaje.match(/p_chip_coincide[^)]*\) then (\d+)/);
    expect(mChip).not.toBeNull();
    const pesoChip = Number(mChip![1]);
    const otros = [...puntaje.matchAll(/then (\d+) else 0 end/g)].map((m) => Number(m[1]));
    const maxOtro = Math.max(...otros.filter((n) => n !== pesoChip));
    expect(pesoChip).toBeGreaterThan(maxOtro * 10);
  });

  it('la cercania suma, pero acotada', () => {
    expect(puntaje).toContain('p_distancia_km');
    expect(puntaje).toMatch(/greatest\(0,/);
  });

  it('el sexo NO descarta, solo suma', () => {
    // Quien encuentra un animal en la calle se equivoca seguido con el sexo
    // (sobre todo en gatos y en cachorros). Descartar por eso perderia
    // coincidencias verdaderas; sumar cuando coinciden no le hace mal a nadie.
    expect(contradicen).not.toContain('sexo');
    expect(puntaje).toContain('p_sexo_a');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. buscar_coincidencias: recreada DESDE LA 0029
// ───────────────────────────────────────────────────────────────────────────
describe('buscar_coincidencias conserva TODO lo que ya hacia', () => {
  const cuerpo = cuerpoDe(codigo, 'buscar_coincidencias');

  it('conserva la vigencia de la 0029 — la MISMA expresion, no una copia a mano', () => {
    // Recrear desde la 0014 (que es la version "original") borraria el filtro de
    // vencimiento y volverian a sugerirse reportes archivados. Este test compara
    // las dos migraciones ENTRE SI: si alguien cambia el intervalo en una, rojo.
    const vigencia = (s: string) => {
      const m = s.match(
        /coalesce\(\s*\w+\.renovado_en\s*,\s*\w+\.creado_en\s*\)\s*>=\s*now\(\)\s*-\s*interval\s*'[^']+'/,
      );
      return m ? m[0].replace(/\s+/g, ' ').replace(/\b\w+\./g, '') : null;
    };
    expect(vigencia(cuerpo)).not.toBeNull();
    expect(vigencia(cuerpo)).toBe(vigencia(cuerpoDe(codigo29, 'buscar_coincidencias')));
  });

  it('conserva los cinco filtros de siempre', () => {
    for (const cond of [
      'p.activo = true',
      'p.oculto = false',
      'p.reunida_en is null',
      'p.estado <> b.estado',
      "p.especie = 'otro'",
    ]) {
      expect({ cond, esta: cuerpo.includes(cond) }).toEqual({ cond, esta: true });
    }
    expect(cuerpo).toContain('st_dwithin(');
  });

  it('conserva el techo duro de la pagina', () => {
    expect(cuerpo).toContain('limit least(coalesce(p_limite, 10), 50)');
  });

  it('el retorno es el de la 0029 MAS las dos columnas nuevas, sin perder ninguna', () => {
    const viejo = retornoDe(codigo29, 'buscar_coincidencias')
      .split(',')
      .map((s) => s.trim());
    const nuevo = retornoDe(codigo, 'buscar_coincidencias')
      .split(',')
      .map((s) => s.trim());
    // Perder una columna del retorno al recrear es como se revierten arreglos
    // sin que nada se ponga rojo. El cliente ya lee todas estas.
    for (const col of viejo) expect(nuevo).toContain(col);
    expect(nuevo.filter((c) => !viejo.includes(c)).sort()).toEqual([
      'chip_coincide boolean',
      'puntaje int',
    ]);
  });

  it('la firma de entrada NO cambia: el cliente ya la llama con estos 3 argumentos', () => {
    expect(parametrosDe(codigo, 'buscar_coincidencias')).toBe(
      parametrosDe(codigo29, 'buscar_coincidencias'),
    );
  });

  it('el drop lleva la firma COMPLETA y va ANTES del create', () => {
    // `create or replace` no puede cambiar el `returns table (...)`. Y si el
    // drop no encuentra la firma exacta no falla, no borra nada, y el create
    // arma una SOBRECARGA: PostgREST rompe por ambiguedad.
    expect(codigo).toContain(
      'drop function if exists public.buscar_coincidencias(uuid, double precision, int);',
    );
    expect(codigo.indexOf('drop function if exists public.buscar_coincidencias')).toBeLessThan(
      codigo.indexOf('create function public.buscar_coincidencias'),
    );
    expect(codigo).not.toMatch(/create or replace function public\.buscar_coincidencias/);
  });
});

describe('buscar_coincidencias usa las señas', () => {
  const cuerpo = cuerpoDe(codigo, 'buscar_coincidencias');

  it('descarta lo que se contradice, salvo que el chip coincida', () => {
    // Un chip igual gana sobre cualquier contradiccion: alguien pudo describir
    // mal el color, pero el chip es el chip.
    expect(cuerpo).toMatch(/chip_coincide\s*\n?\s*or not public\.senas_contradicen\(/);
  });

  it('ordena por chip primero, despues por puntaje y recien despues por cercania', () => {
    const orden = cuerpo.slice(cuerpo.indexOf('order by'));
    expect(orden.indexOf('chip_coincide')).toBeGreaterThanOrEqual(0);
    expect(orden.indexOf('chip_coincide')).toBeLessThan(orden.indexOf('puntaje'));
    expect(orden.indexOf('puntaje')).toBeLessThan(orden.indexOf('distancia_km'));
  });

  it('el ORDER BY y el SELECT califican TODO (si no, la funcion ni se crea)', () => {
    // Las columnas del `returns table (...)` son parametros OUT y estan en
    // alcance dentro del cuerpo: un `puntaje` pelado es ambiguo entre la salida
    // y la columna de la CTE, y Postgres rechaza la funcion al crearla. O sea
    // que el error NO aparece en ningun test de la app: aparece al aplicar la
    // migracion, en produccion. Por eso la 0028 y la 0029 califican todo, y por
    // eso esto se ata acá.
    const salida = cuerpo.slice(cuerpo.lastIndexOf('  select'));
    // Cada nombre que TAMBIEN es columna de salida tiene que ir con prefijo.
    for (const col of ['puntaje', 'chip_coincide', 'distancia_km', 'creado_en']) {
      const pelados = [...salida.matchAll(new RegExp(`(^|[^.\\w])${col}\\b`, 'g'))];
      expect({ col, pelados: pelados.length }).toEqual({ col, pelados: 0 });
    }
  });

  it('usa las funciones compartidas, no una copia de la regla', () => {
    // Si la regla estuviera escrita a mano en cada funcion, el aviso proactivo
    // y la lista de la ficha empezarian a decir cosas distintas.
    expect(cuerpo).toContain('public.senas_contradicen(');
    expect(cuerpo).toContain('public.senas_puntaje(');
  });

  it('al volverse definer, repite en el WHERE lo que antes hacia la RLS', () => {
    // Pasa a security definer porque tiene que leer `pet_chips`, que esta
    // cerrada al dueño. Eso saltea la RLS de `pets`: sin estas condiciones, un
    // visitante sin cuenta podria pedir las coincidencias de un reporte
    // ocultado por moderacion.
    expect(bloqueDe(codigo, 'buscar_coincidencias')).toContain('security definer');
    expect(bloqueDe(codigo, 'buscar_coincidencias')).toMatch(/set search_path = public/);
    const base = cuerpo.slice(cuerpo.indexOf('with base'), cuerpo.indexOf('), cand'));
    expect(base).toContain('p.oculto = false');
    expect(base).toContain('auth.uid()');
  });

  it('los permisos quedan explicitos y son los mismos de antes', () => {
    expect(codigo).toContain(
      'revoke all on function public.buscar_coincidencias(uuid, double precision, int) from public;',
    );
    for (const rol of ['anon', 'authenticated']) {
      expect(codigo).toContain(
        `grant execute on function public.buscar_coincidencias(uuid, double precision, int) to ${rol};`,
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. enqueue_coincidencias: recreada DESDE LA 0029
// ───────────────────────────────────────────────────────────────────────────
describe('enqueue_coincidencias conserva TODO lo que ya hacia', () => {
  const cuerpo = cuerpoDe(codigo, 'enqueue_coincidencias');
  const cuerpo29 = cuerpoDe(codigo29, 'enqueue_coincidencias');

  it('sigue siendo un create or replace (el trigger de la 0026 no se desengancha)', () => {
    expect(codigo).toContain('create or replace function public.enqueue_coincidencias()');
    expect(codigo).not.toMatch(/drop function if exists public\.enqueue_coincidencias/);
    // Y no se vuelve a crear el trigger: `create trigger` sin drop revienta al
    // aplicar, y con drop dejaria una ventana sin avisos.
    expect(codigo).not.toMatch(/create trigger pets_notificar_coincidencias/);
  });

  it('conserva la vigencia de la 0029', () => {
    expect(cuerpo).toContain("coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'");
    expect(cuerpo29).toContain("coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'");
  });

  it('conserva los dos brazos y el tope de 25', () => {
    // Brazo A: avisar al dueño de cada reporte que calza. Brazo B: un SOLO
    // aviso al que recien publico. Perder uno al recrear no se nota hasta que
    // alguien pregunta por que no le llego nada.
    expect(cuerpo).toContain('v_tope constant int := 25');
    expect(cuerpo).toContain('match_pet_id');
    expect(cuerpo).toContain('match_estado');
    expect(cuerpo).toContain('match_especie');
    expect((cuerpo.match(/insert into public\.notification_events/g) ?? [])).toHaveLength(2);
  });

  it('sigue siendo definer con search_path fijado', () => {
    expect(bloqueDe(codigo, 'enqueue_coincidencias')).toContain('security definer');
    expect(bloqueDe(codigo, 'enqueue_coincidencias')).toMatch(/set search_path = public/);
  });

  it('descarta las contradicciones con la MISMA funcion que la busqueda', () => {
    expect(cuerpo).toContain('public.senas_contradicen(');
  });

  it('el aviso al publicador es sobre el match mas FUERTE, no el mas cercano', () => {
    // Antes el loop venia ordenado solo por distancia y el brazo B tomaba el
    // primero. Ahora un match con el chip igual a 12 km vale mas que uno sin
    // datos a 300 m, asi que el orden tiene que mirar el puntaje primero.
    const orden = cuerpo.slice(cuerpo.indexOf('order by'), cuerpo.indexOf('limit v_tope'));
    expect(orden).toContain('puntaje');
    expect(orden.indexOf('puntaje')).toBeLessThan(orden.indexOf('st_distance'));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. El chip llega DESPUES del reporte: hace falta su propio disparador
// ───────────────────────────────────────────────────────────────────────────
describe('el trigger de pet_chips', () => {
  const cuerpo = cuerpoDe(codigo, 'enqueue_coincidencias_chip');

  it('existe y cuelga de pet_chips, no de pets', () => {
    // Sin esto el chip no sirve para NADA al publicar: `pet_chips` se escribe
    // DESPUES del insert en `pets` (necesita el pet_id), asi que cuando corre
    // `enqueue_coincidencias` el chip del reporte recien publicado todavia no
    // existe. Es el agujero silencioso de todo el diseño.
    expect(codigo).toMatch(/create trigger \w+\s+after insert or update[^;]*on public\.pet_chips/);
  });

  it('NO filtra por radio: un chip es un chip aunque el animal aparezca lejos', () => {
    // Un perro perdido en Santiago puede aparecer en Rancagua. Con los 15 km de
    // siempre, el unico dato inequivoco que tenemos se perderia justo en el caso
    // en que mas hace falta.
    expect(cuerpo).not.toContain('st_dwithin');
    expect(cuerpo).not.toContain('radio');
  });

  it('marca el aviso como chip, para que el texto pueda ser mas fuerte', () => {
    expect(cuerpo).toContain("'chip', true");
  });

  it('no re-avisa cuando el update no toco el chip', () => {
    expect(cuerpo).toContain('is not distinct from');
  });

  it('respeta el estado del reporte propio antes de avisar nada', () => {
    for (const cond of ['activo', 'oculto', 'reunida_en']) {
      expect({ cond, esta: cuerpo.includes(cond) }).toEqual({ cond, esta: true });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. buscar_reportes: recreada DESDE LA 0028, solo para sumar dos filtros
// ───────────────────────────────────────────────────────────────────────────
describe('buscar_reportes conserva TODO lo que ya hacia', () => {
  const cuerpo = cuerpoDe(codigo, 'buscar_reportes');

  it('el retorno es IDENTICO al de la 0028', () => {
    // No se le suman columnas a proposito: el listado no necesita las señas
    // (la ficha las lee con select('*')), y cada columna de mas es una chance
    // mas de equivocarse al copiar.
    expect(retornoDe(codigo, 'buscar_reportes')).toBe(retornoDe(codigo28, 'buscar_reportes'));
  });

  it('los parametros son los de la 0028 MAS exactamente p_color y p_tamano', () => {
    const viejos = parametrosDe(codigo28, 'buscar_reportes')
      .split(',')
      .map((s) => s.trim());
    const nuevos = parametrosDe(codigo, 'buscar_reportes')
      .split(',')
      .map((s) => s.trim());
    for (const p of viejos) expect(nuevos).toContain(p);
    expect(nuevos.filter((p) => !viejos.includes(p)).sort()).toEqual([
      'p_color text default null',
      'p_tamano text default null',
    ]);
    // Al final de la lista: los argumentos viajan por nombre, asi que la
    // posicion no rompe nada, pero deja el diff legible contra la 0028.
    expect(nuevos.indexOf('p_color text default null')).toBeGreaterThan(
      nuevos.indexOf('p_limite int default 20'),
    );
  });

  it('sin default, la llamada de siempre dejaria de resolver', () => {
    expect(parametrosDe(codigo, 'buscar_reportes')).toContain('p_color text default null');
    expect(parametrosDe(codigo, 'buscar_reportes')).toContain('p_tamano text default null');
  });

  it('conserva VERBATIM el arreglo del cursor de la 0015', () => {
    expect(cuerpo).toContain('round((st_distance(p.ubicacion, c.punto) / 1000.0)::numeric, 6)');
    expect(cuerpo).toContain('(calc.dist, calc.id) > (round(p_cursor_dist::numeric, 6), p_cursor_id)');
    expect(cuerpo).toContain('(calc.creado_en, calc.id) < (p_cursor_fecha, p_cursor_id)');
  });

  it('conserva TODOS los filtros de la 0028, uno por uno', () => {
    for (const cond of [
      'p.activo = true',
      'p.oculto = false',
      '(p_estado is null or p.estado::text = p_estado)',
      '(p_especie is null or p.especie::text = p_especie)',
      "(p_con_recompensa is not true or coalesce(trim(p.recompensa), '') <> '')",
      '(p_desde is null or p.creado_en >= p_desde)',
      '(p_comuna is null or p.comuna = p_comuna or p_comuna = any(p.comunas_alcance))',
      "coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'",
      'limit least(coalesce(p_limite, 20), 100)',
    ]) {
      expect({ cond, esta: cuerpo.includes(cond) }).toEqual({ cond, esta: true });
    }
  });

  it('los dos filtros nuevos son opcionales y no tocan a quien no los manda', () => {
    // `p_color is null or ...` primero: un reporte viejo sin colores tiene que
    // seguir apareciendo en la busqueda de siempre.
    expect(cuerpo).toContain("(p_color is null or p.colores @> array[p_color]::text[])");
    expect(cuerpo).toContain('(p_tamano is null or p.tamano = p_tamano)');
  });

  it('el drop lleva las 14 posiciones de la 0028, y va antes del create', () => {
    const drop28 = codigo28.slice(
      codigo28.indexOf('drop function if exists public.buscar_reportes'),
      codigo28.indexOf(';', codigo28.indexOf('drop function if exists public.buscar_reportes')) + 1,
    );
    // Se compara contra el drop que escribio la 0028 (normalizando espacios):
    // si la 0028 hubiera cambiado su firma, copiarla a mano aca fallaria.
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    const drop54 = codigo.slice(
      codigo.indexOf('drop function if exists public.buscar_reportes'),
      codigo.indexOf(';', codigo.indexOf('drop function if exists public.buscar_reportes')) + 1,
    );
    expect(norm(drop54)).toBe(norm(drop28));
    expect(codigo.indexOf('drop function if exists public.buscar_reportes')).toBeLessThan(
      codigo.indexOf('create function public.buscar_reportes'),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. La migracion se autoverifica y no rompe nada ajeno
// ───────────────────────────────────────────────────────────────────────────
describe('0054 no puede romper NADA de lo que ya existe', () => {
  it('si quedaron dos firmas de una funcion, revienta al aplicar', () => {
    // El drop con `if exists` es silencioso cuando la firma no calza. Sin este
    // chequeo, el silencio se convierte en Explorar roto por ambiguedad de
    // PostgREST — y recien nos enteramos en produccion.
    expect(codigo).toContain("proname = 'buscar_reportes'");
    expect(codigo).toContain("proname = 'buscar_coincidencias'");
    // UNA por cada funcion recreada. Con un solo `raise` alcanzaba para pasar
    // este test mientras la otra funcion quedaba sin chequear: se comprobo
    // mutando el archivo, y el test se quedaba verde.
    const raises = [...codigo.matchAll(/raise exception[^;]*firma/gi)];
    expect(raises).toHaveLength(2);
    for (const nombre of ['buscar_reportes', 'buscar_coincidencias']) {
      expect(raises.some((r) => r[0].includes(nombre))).toBe(true);
    }
  });

  it('las unicas tablas que toca son pets y pet_chips', () => {
    const alters = [...codigo.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(alters)].sort()).toEqual(['pet_chips', 'pets']);
  });

  it('no borra, no pisa datos y no toca la RLS de pets', () => {
    expect(codigo).not.toMatch(/\bdelete from\b/i);
    expect(codigo).not.toMatch(/\bupdate public\.pets\b/i);
    expect(codigo).not.toMatch(/\bdrop (table|index)\b/i);
    // El unico trigger que se dropea es el que esta misma migracion crea (para
    // que el archivo sea re-ejecutable). Tocar `pets_notificar_coincidencias`
    // (0026) dejaria la app sin avisos de coincidencia si el create fallara.
    const triggers = [...codigo.matchAll(/drop trigger if exists (\w+)/g)].map((m) => m[1]);
    expect(triggers).toEqual(['pet_chips_notificar_coincidencias']);
    expect(codigo).not.toContain('drop trigger if exists pets_notificar_coincidencias');
    // Recrear funciones no es motivo para reescribir de memoria las policies de
    // `pets`: asi se revirtieron arreglos en tandas anteriores.
    expect(codigo).not.toMatch(/create policy[^;]*on public\.pets/i);
  });

  it('no dropea ninguna funcion que no declare', () => {
    const drops = [...codigo.matchAll(/drop function if exists public\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(drops)].sort()).toEqual(['buscar_coincidencias', 'buscar_reportes']);
  });

  it('no toca el CHECK de notification_events (otra migracion de la tanda podria)', () => {
    // 'coincidencia' ya esta en la lista desde la 0026: no hace falta tocarla, y
    // reescribirla aca seria pisar lo que sumen 0055/0056/0057 en paralelo.
    expect(codigo).not.toContain('notification_events_tipo_check');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. LA TRAMPA DE POSTGREST, DEL LADO DE LA APP
// ───────────────────────────────────────────────────────────────────────────
/** Todos los .ts/.tsx de src/, recursivo. */
function fuentes(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) acc.push(ruta);
  }
  return acc;
}

describe('la app no pide las columnas nuevas en ningun select con lista', () => {
  it('ningun .select("… colores/tamano/sexo/esterilizado …") en src/', () => {
    // `select('*')` degrada solo (la columna simplemente no viene). Pero
    // `select('id, estado, colores')` contra una base sin la 0054 devuelve
    // error y `data` null: se cae la consulta ENTERA, no solo el campo. Mismo
    // barrido que dejo la 0046 para `ambito`.
    const RAIZ = join(__dirname, '..', '..');
    const nuevas = /\b(colores|tamano|sexo|esterilizado)\b/;
    const culpables: string[] = [];
    for (const ruta of fuentes(join(RAIZ, 'src'))) {
      const texto = readFileSync(ruta, 'utf8');
      for (const m of texto.matchAll(/\.select\(\s*(['"`])([^'"`]*)\1/g)) {
        if (m[2] !== '*' && nuevas.test(m[2])) culpables.push(`${ruta}: ${m[2]}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});

// El guardrail de "esta es la ultima migracion del repo" NO vive aca: sigue en
// `migracion0053.test.ts`. En esta tanda hay cuatro migraciones en paralelo
// (0054 a 0057) y solo el agente de la 0057 —la mas nueva— lo mueve. En la
// tanda 10 tres agentes lo copiaron a la vez y quedaron tres copias afirmando
// numeros distintos, dos de ellas rojas para siempre.

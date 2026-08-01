import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0048 — CUADRILLA.
//
// No prueba la base real (es un archivo de texto): ata las decisiones que, si
// alguien las afloja al editar el SQL, no se notan hasta que ya hay datos.
//
// La mas importante de todas esta en el ultimo describe: esta migracion NO
// PUEDE TOCAR NADA DE LO QUE YA EXISTE. El dueño sube la web antes de correr el
// SQL, asi que durante un tiempo la app va a estar corriendo contra una base
// SIN estas tablas, y todo lo demas tiene que seguir funcionando igual.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(DIR, '0048_cuadrilla.sql'), 'utf8');

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

/** El cuerpo del `create table public.<nombre> ( … );` */
function tabla(nombre: string): string {
  const idx = codigo.indexOf(`create table public.${nombre} (`);
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('(', idx);
  let nivel = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === '(') nivel++;
    else if (codigo[i] === ')' && --nivel === 0) return codigo.slice(abre + 1, i);
  }
  throw new Error(`no se cerro el create table de ${nombre}`);
}

/** Todas las policies declaradas: { tabla, comando, cuerpo }. */
function policies(): { tabla: string; comando: string; cuerpo: string }[] {
  const out: { tabla: string; comando: string; cuerpo: string }[] = [];
  const re = /create policy\s+"([^"]+)"\s*\n?\s*on public\.(\w+)\s+for\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    const desde = m.index;
    const siguiente = codigo.indexOf('create ', desde + 10);
    out.push({
      tabla: m[2],
      comando: m[3].toLowerCase(),
      cuerpo: codigo.slice(desde, siguiente === -1 ? codigo.length : siguiente),
    });
  }
  return out;
}

const TABLAS = ['cuadrillas', 'cuadrilla_miembros', 'cuadrilla_tareas'];

describe('el parser lee el SQL de verdad (si no, todo lo de abajo pasa por vacio)', () => {
  it('encuentra las tres tablas y varias policies', () => {
    for (const t of TABLAS) expect(tabla(t).length).toBeGreaterThan(50);
    expect(policies().length).toBeGreaterThanOrEqual(6);
  });
});

describe('las tres tablas nacen con RLS prendida', () => {
  it.each(TABLAS)('%s', (t) => {
    expect(codigo).toContain(`alter table public.${t} enable row level security;`);
  });
});

describe('estructura minima: quien ayuda y que tareas hay', () => {
  it('la cuadrilla cuelga de UN reporte y no se duplica', () => {
    const t = tabla('cuadrillas');
    expect(t).toMatch(/pet_id uuid not null unique references public\.pets\(id\) on delete cascade/);
    // Sin el cascade, borrar un reporte deja cuadrillas huerfanas con su token
    // vivo: el link de invitacion seguiria abriendo algo.
    expect(t).toMatch(/user_id uuid not null references public\.profiles\(id\) on delete cascade/);
  });

  it('una tarea tiene estado, quien la tomo y de que cuadrilla es', () => {
    const t = tabla('cuadrilla_tareas');
    expect(t).toMatch(/cuadrilla_id uuid not null references public\.cuadrillas\(id\) on delete cascade/);
    expect(t).toContain("estado in ('pendiente', 'tomada', 'hecha')");
    expect(t).toMatch(/tomada_por uuid references public\.profiles\(id\)/);
  });

  it('el estado y el dueño de la tarea no pueden contradecirse', () => {
    // Sin este CHECK se puede guardar una tarea 'tomada' sin nadie que la tenga
    // (queda trabada para siempre) o una 'pendiente' con dueño (invisible para
    // el que la tomo). La coherencia no puede depender de que el cliente sume
    // bien los dos campos en cada update.
    expect(tabla('cuadrilla_tareas')).toContain(
      "(estado = 'pendiente') = (tomada_por is null)",
    );
  });

  it('el titulo tiene el mismo tope que el formulario (defensa de la 0016)', () => {
    expect(tabla('cuadrilla_tareas')).toMatch(
      /cuadrilla_tareas_titulo_largo check \(length\(btrim\(titulo\)\) between 1 and 120\)/,
    );
  });

  it('nadie entra dos veces a la misma cuadrilla', () => {
    expect(tabla('cuadrilla_miembros')).toContain('unique (cuadrilla_id, user_id)');
  });
});

describe('el token de invitacion es del servidor y no se reescribe', () => {
  it('lo genera la base con 128 bits, igual que el collar de la 0027', () => {
    expect(tabla('cuadrillas')).toMatch(
      /token text not null unique default encode\(gen_random_bytes\(16\), 'hex'\)/,
    );
    expect(codigo).toContain('create extension if not exists pgcrypto;');
  });

  it('NO hay ninguna policy de update sobre cuadrillas', () => {
    // Sin policy de update, ni el dueño puede reescribir su token desde el
    // cliente: un token no es un campo editable, es una credencial.
    expect(policies().filter((p) => p.tabla === 'cuadrillas' && p.comando === 'update')).toEqual([]);
  });
});

describe('quien manda: solo el dueño del reporte', () => {
  const crear = cuerpoDe('crear_cuadrilla');

  it('el gate de propiedad va ADENTRO de la funcion definer', () => {
    // Es definer porque tiene que insertar en cuadrilla_miembros, que no tiene
    // policy de insert. Si el chequeo viviera afuera, cualquier autenticado
    // podria armar una cuadrilla sobre el reporte de otra persona.
    expect(codigo).toContain('security definer');
    expect(crear).toContain('v_dueno <> auth.uid()');
    expect(crear).toContain('raise exception');
  });

  it('exige sesion', () => {
    expect(crear).toContain('auth.uid() is null');
  });

  it('es idempotente: tocar el boton dos veces no duplica las tareas sugeridas', () => {
    // El caso real: el dueño toca "Organizar la busqueda", se va, vuelve y
    // toca de nuevo. Sin esto, la lista queda con las seis tareas repetidas.
    expect(crear).toContain('from public.cuadrillas c where c.pet_id = p_pet_id');
    expect(crear).toMatch(/if v_id is not null then\s*return v_id;/);
  });

  it('mete al dueño como miembro de su propia cuadrilla', () => {
    // Es lo que hace que una cuadrilla de UNA persona ya le sirva: es su lista
    // de tareas, no un tablero vacio esperando que alguien acepte.
    expect(crear).toMatch(/insert into public\.cuadrilla_miembros[\s\S]{0,120}auth\.uid\(\)/);
  });

  it('valida el largo de cada tarea sugerida antes de insertarla', () => {
    expect(crear).toContain('length(btrim(v_titulo)) between 1 and 120');
  });

  it('solo el dueño agrega y borra tareas', () => {
    const tareas = policies().filter((p) => p.tabla === 'cuadrilla_tareas');
    for (const comando of ['insert', 'delete']) {
      const p = tareas.find((x) => x.comando === comando);
      expect(p?.cuerpo).toContain('public.manda_en_la_cuadrilla(cuadrilla_id)');
    }
  });
});

describe('los ayudantes toman tareas, no se las roban', () => {
  const update = policies().find(
    (p) => p.tabla === 'cuadrilla_tareas' && p.comando === 'update',
  )!;

  it('existe la policy de update y usa using Y with check', () => {
    expect(update).toBeTruthy();
    expect(update.cuerpo).toContain('using (');
    // Sin `with check`, un ayudante puede tomar una tarea libre y en el mismo
    // update ponerle `tomada_por` = otra persona: el `using` solo mira la fila
    // ANTES del cambio.
    expect(update.cuerpo).toContain('with check (');
  });

  it('el with check no deja asignarle una tarea a un tercero', () => {
    const check = update.cuerpo.slice(update.cuerpo.indexOf('with check ('));
    expect(check).toContain('tomada_por is null');
    expect(check).toContain('tomada_por = auth.uid()');
    expect(check).toContain('public.manda_en_la_cuadrilla(cuadrilla_id)');
  });

  it('solo se ven y se tocan tareas de la propia cuadrilla', () => {
    const tareas = policies().filter((p) => p.tabla === 'cuadrilla_tareas');
    const select = tareas.find((p) => p.comando === 'select');
    expect(select?.cuerpo).toContain('public.es_de_la_cuadrilla(cuadrilla_id)');
    expect(update.cuerpo).toContain('public.es_de_la_cuadrilla(cuadrilla_id)');
  });

  it('un ayudante no puede reescribir el TEXTO de una tarea', () => {
    // La RLS de Postgres es por FILA, no por columna: la policy de update que
    // deja tomar una tarea tambien dejaria cambiarle el titulo. El trigger es
    // la unica forma de acotarlo.
    const trigger = cuerpoDe('cuadrilla_tarea_solo_su_estado');
    expect(trigger).toContain('public.manda_en_la_cuadrilla(new.cuadrilla_id)');
    expect(trigger).toContain('new.titulo is distinct from old.titulo');
    expect(codigo).toMatch(
      /create trigger cuadrilla_tareas_solo_estado\s*\n?\s*before update on public\.cuadrilla_tareas/,
    );
  });

  it('las funciones de pertenencia son definer, para no recursionar la RLS', () => {
    // `es_de_la_cuadrilla` se usa DENTRO de la policy de cuadrilla_miembros: si
    // no fuera definer, leer miembros exigiria leer miembros y Postgres corta
    // con "infinite recursion detected in policy".
    for (const f of ['es_de_la_cuadrilla', 'manda_en_la_cuadrilla']) {
      const decl = codigo.slice(codigo.indexOf(`function public.${f}`));
      expect(decl.slice(0, 400)).toContain('security definer');
      expect(decl.slice(0, 400)).toContain('set search_path = public, pg_temp');
    }
  });
});

describe('el link de invitacion: se puede MIRAR sin cuenta, sumarse no', () => {
  it('la vista previa se le concede a anon', () => {
    // Que el link sea una pared de login antes de decir de que se trata es la
    // forma mas rapida de que nadie se sume.
    expect(codigo).toContain('grant execute on function public.cuadrilla_por_invitacion(text) to anon;');
    expect(codigo).toContain(
      'grant execute on function public.cuadrilla_por_invitacion(text) to authenticated;',
    );
  });

  it('sumarse NO se le concede a anon, y la funcion ademas lo exige adentro', () => {
    // Decision tomada a proposito (ver el comentario largo del SQL): a
    // diferencia de `avisar_escaneo_collar`, sumarse deja estado PERSISTENTE y
    // COMPARTIDO — una tarea tomada por "nadie" no se le puede sacar, y el
    // dueño no sabe quien la tiene.
    expect(codigo).toContain(
      'revoke all on function public.sumarme_a_la_cuadrilla(text) from public, anon;',
    );
    expect(codigo).not.toContain('grant execute on function public.sumarme_a_la_cuadrilla(text) to anon');
    expect(cuerpoDe('sumarme_a_la_cuadrilla')).toContain('auth.uid() is null');
  });

  it('un token que no existe no se delata: devuelve vacio, no un error', () => {
    expect(cuerpoDe('sumarme_a_la_cuadrilla')).toMatch(/if v_id is null then\s*return null;/);
  });

  it('la cuadrilla tiene tope de gente', () => {
    // Es el barrio, no una lista de difusion. Y sin tope, un token filtrado
    // convierte la tabla en un buzon abierto para cualquier autenticado.
    expect(cuerpoDe('sumarme_a_la_cuadrilla')).toMatch(/if v_cuantos >= \d+ then/);
  });

  it('la vista previa NO devuelve identidad, contacto ni el token', () => {
    // Las COLUMNAS que devuelve, o sea el `returns table (…)`. Es la lista
    // completa de lo que sale de la base hacia una llamada anonima: si un dato
    // no esta ahi, no hay forma de sacarlo por esta via probando tokens.
    const decl = codigo.slice(codigo.indexOf('function public.cuadrilla_por_invitacion'));
    const abre = decl.indexOf('returns table (');
    expect(abre).toBeGreaterThan(0);
    const devuelve = decl.slice(abre, decl.indexOf(')', decl.indexOf('ya_estoy')) + 1);
    expect(devuelve).toContain('ya_estoy boolean');

    for (const filtracion of ['user_id', 'telefono', 'red_social', 'token', 'lat', 'lng']) {
      expect({ campo: filtracion, enLoQueDevuelve: devuelve.includes(filtracion) }).toEqual({
        campo: filtracion,
        enLoQueDevuelve: false,
      });
    }
    // Lo que si devuelve es lo que ya es publico por la 0004 (el reporte se ve
    // sin sesion en /mascota/:id) mas dos numeros de la propia cuadrilla.
    expect(devuelve).toContain('pet_id uuid');
    expect(devuelve).toContain('ayudantes int');
  });

  it('sumarse pasa SI O SI por la RPC: miembros no tiene policy de insert', () => {
    // Si existiera un insert directo, alcanzaria con adivinar/ver un
    // cuadrilla_id para meterse sin tener el token.
    expect(
      policies().filter((p) => p.tabla === 'cuadrilla_miembros' && p.comando === 'insert'),
    ).toEqual([]);
  });

  it('cada quien puede irse, y el dueño puede sacar a alguien', () => {
    const del = policies().find(
      (p) => p.tabla === 'cuadrilla_miembros' && p.comando === 'delete',
    );
    expect(del?.cuerpo).toContain('user_id = auth.uid()');
    expect(del?.cuerpo).toContain('public.manda_en_la_cuadrilla(cuadrilla_id)');
  });
});

describe('todas las funciones nuevas estan cerradas y con search_path fijo', () => {
  const FUNCIONES = [
    'public.es_de_la_cuadrilla(uuid)',
    'public.manda_en_la_cuadrilla(uuid)',
    'public.crear_cuadrilla(uuid, text[])',
    'public.sumarme_a_la_cuadrilla(text)',
    'public.cuadrilla_por_invitacion(text)',
  ];

  it.each(FUNCIONES)('%s revoca a public antes de conceder', (firma) => {
    expect(codigo).toContain(`revoke all on function ${firma} from public`);
    expect(codigo).toContain(`grant execute on function ${firma} to authenticated;`);
  });

  it('ninguna se olvida el search_path (inyeccion por search_path en definer)', () => {
    const definers = codigo.match(/security definer/g) ?? [];
    const paths = codigo.match(/set search_path\s*=\s*public, pg_temp/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(5);
    expect(paths.length).toBeGreaterThanOrEqual(definers.length);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LO MAS IMPORTANTE DEL ARCHIVO
// ───────────────────────────────────────────────────────────────────────────
describe('0048 no puede romper NADA de lo que ya existe', () => {
  it('no le agrega ni una columna a ninguna tabla vieja', () => {
    // LA TRAMPA DE POSTGREST, medida contra el proyecto real (1-ago-2026):
    //   GET /rest/v1/pets?select=id,estado,columna_que_no_existe
    //   → 400 {"code":"42703","message":"column pets.columna_que_no_existe
    //           does not exist"}
    // La consulta falla ENTERA. No hay datos parciales. Si esta migracion le
    // agregara una columna a `pets` y la app la pidiera, la ficha del reporte
    // dejaria de cargar para TODO EL MUNDO hasta que alguien corra el SQL.
    // La unica defensa de verdad es no agregar ninguna: por eso la cuadrilla
    // vive en tablas propias y se une por `pet_id`.
    const alters = codigo.match(/alter table public\.(\w+)/g) ?? [];
    const ajenas = alters.filter((a) => !TABLAS.some((t) => a.endsWith(` public.${t}`)));
    expect(ajenas).toEqual([]);
  });

  it('no toca la cola de avisos ni su Edge Function', () => {
    // Fuera de alcance a proposito: si un ayudante no va a recibir avisos, la
    // interfaz no puede prometerlos. Enganchar un trigger a
    // `notification_events` aca dejaria la promesa a medio hacer.
    expect(codigo).not.toContain('notification_events');
    expect(codigo).not.toContain('enqueue_');
  });

  it('no redefine ni borra nada de las migraciones anteriores', () => {
    // Recrear "de paso" una funcion vecina es como se revirtieron arreglos en
    // tandas anteriores sin que nadie se enterara.
    expect(codigo).not.toMatch(/\bdrop (table|policy|function|trigger)\b/i);
    expect(codigo).not.toMatch(/\bcreate or replace function public\.(?!es_de_la_cuadrilla|manda_en_la_cuadrilla|crear_cuadrilla|sumarme_a_la_cuadrilla|cuadrilla_por_invitacion|cuadrilla_tarea_solo_su_estado)/);
    expect(codigo).not.toMatch(/\bdelete from\b/i);
    expect(codigo).not.toMatch(/\bupdate public\.(pets|profiles|my_pets)\b/i);
  });

  it('todo lo que crea lleva el prefijo de la funcion', () => {
    // Un nombre generico (`tareas`, `miembros`) es como se pisa una tabla de
    // otra tanda en el merge.
    const creadas = [...codigo.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    expect(creadas).toEqual(TABLAS);
    const funciones = [...codigo.matchAll(/create function public\.(\w+)/g)].map((m) => m[1]);
    expect(funciones.every((f) => /cuadrilla/.test(f))).toBe(true);
  });
});

// Este guardrail viaja SIEMPRE con la ultima migracion del repo (venia en
// migracion0045.test.ts). Su sentido es avisar cuando aparece una migracion
// nueva sin que se revise el orden de aplicacion.
describe('0048 es la ultima migracion del repo', () => {
  it('no hay ninguna migracion con numero mayor', () => {
    const numeros = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n));
    expect(Math.max(...numeros)).toBe(48);
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0051 — LA BANDEJA DE AVISOS.
//
// `notification_events` es la unica tabla del proyecto que NO tiene RLS publica:
// nace invisible para `anon` y para `authenticated` (0011, comentario "Cola
// cruda. SIN políticas"). O sea que la RPC `mis_avisos()` es la UNICA puerta que
// existe hacia esa tabla desde la app, y es `security definer`: adentro corre
// como dueña de la base, con la RLS apagada. Si la puerta se abre de mas, no hay
// una segunda pared atras.
//
// Por eso este archivo no revisa "estilo": revisa que la puerta este cerrada.
// El describe mas importante es el de "no se leen avisos ajenos".
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(DIR, '0051_mis_avisos.sql'), 'utf8');

// Las aserciones corren sobre el CODIGO: el archivo explica en prosa lo mismo
// que verifica, asi que buscar sobre el texto crudo da falsos positivos.
const codigo = sql.replace(/--[^\n]*/g, '');

/** El cuerpo (`as $$ … $$;`) de la funcion. */
function cuerpoDe(nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}`);
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('as $$', idx);
  expect(abre).toBeGreaterThan(idx);
  const cierra = codigo.indexOf('$$;', abre + 5);
  expect(cierra).toBeGreaterThan(abre);
  return codigo.slice(abre + 5, cierra);
}

/** La lista de PARAMETROS declarados, tal cual: `(p_limite int default 50)`. */
function parametrosDe(nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}`);
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('(', idx);
  let nivel = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === '(') nivel++;
    else if (codigo[i] === ')' && --nivel === 0) return codigo.slice(abre + 1, i);
  }
  throw new Error(`no se cerraron los parametros de ${nombre}`);
}

/** Lo que la funcion DEVUELVE: el interior del `returns table ( … )`. */
function devuelveDe(nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}`);
  const abre = codigo.indexOf('returns table (', idx);
  expect(abre).toBeGreaterThan(idx);
  let nivel = 0;
  for (let i = codigo.indexOf('(', abre); i < codigo.length; i++) {
    if (codigo[i] === '(') nivel++;
    else if (codigo[i] === ')' && --nivel === 0) return codigo.slice(abre, i + 1);
  }
  throw new Error('no se cerro el returns table');
}

const cuerpo = cuerpoDe('mis_avisos');
const parametros = parametrosDe('mis_avisos');
const devuelve = devuelveDe('mis_avisos');

describe('el parser lee el SQL de verdad (si no, todo lo de abajo pasa por vacio)', () => {
  it('encuentra la funcion, sus parametros y lo que devuelve', () => {
    expect(cuerpo.length).toBeGreaterThan(200);
    expect(parametros).toContain('p_limite');
    expect(devuelve).toContain('creado_en timestamptz');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LO MAS IMPORTANTE DEL ARCHIVO: no se leen avisos ajenos
// ───────────────────────────────────────────────────────────────────────────
describe('la RPC no puede devolver los avisos de otra persona', () => {
  it('NO recibe ningun parametro de identidad: el unico argumento es el tope', () => {
    // Es la propiedad estructural, no una validacion que se pueda olvidar de
    // correr: si la firma no tiene por donde entrar un user_id, no hay forma de
    // pedir la cola de otro ni equivocandose. Mismo patron que `mi_perfil()` y
    // `anonimizar_mi_cuenta()`, que ya evito una escalada de privilegios aca.
    const nombres = parametros
      .split(',')
      .map((p) => p.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(nombres).toEqual(['p_limite']);
  });

  it('el destinatario sale de auth.uid() y de ningun otro lado', () => {
    expect(cuerpo).toContain('ne.target_user_id = auth.uid()');
  });

  it('NINGUNA comparacion de target_user_id apunta a algo que no sea auth.uid()', () => {
    // La mutacion que este test caza: cambiar `= auth.uid()` por `is not null`,
    // por un parametro, o por una subconsulta cualquiera. Cada aparicion de
    // `target_user_id` en el cuerpo tiene que estar pegada a auth.uid() o a un
    // `is null` (la rama de los avisos que se resuelven por dueño del reporte).
    const apariciones = [...cuerpo.matchAll(/target_user_id\s*([^\s].{0,24})/g)].map((m) =>
      m[1].trim(),
    );
    expect(apariciones.length).toBeGreaterThan(0);
    const sospechosas = apariciones.filter(
      (a) => !a.startsWith('= auth.uid()') && !a.startsWith('is null'),
    );
    expect({ apariciones, sospechosas }).toEqual({ apariciones, sospechosas: [] });
  });

  it('la rama por dueño del reporte exige que el reporte sea MIO', () => {
    // Es la otra mitad del filtro. Sin `p.user_id = auth.uid()`, la rama que
    // resuelve el destinatario por el reporte devolveria los avisos de los
    // reportes de todo el mundo, que es la fuga entera.
    expect(cuerpo).toContain('p.user_id = auth.uid()');
    expect(cuerpo).toMatch(/exists\s*\([\s\S]{0,200}from public\.pets p[\s\S]{0,200}p\.user_id = auth\.uid\(\)/);
  });

  it('esa rama solo aplica cuando el evento NO tiene destinatario propio', () => {
    // Un `busqueda_guardada` lleva pet_id = el reporte recien publicado (del
    // que publico) y target_user_id = quien guardo la busqueda. Sin exigir
    // `target_user_id is null`, el que publico veria en su bandeja los avisos
    // dirigidos a otras personas sobre su reporte.
    expect(cuerpo).toMatch(/ne\.target_user_id is null[\s\S]{0,300}p\.user_id = auth\.uid\(\)/);
  });

  it('sin sesion corta con una excepcion, no devuelve la cola entera', () => {
    // `auth.uid()` es null sin sesion. Sin este corte explicito, la comparacion
    // `target_user_id = null` no devolveria filas por casualidad (null nunca
    // iguala), pero seria una defensa por accidente: cualquier reescritura del
    // where la pierde en silencio.
    expect(cuerpo).toMatch(/if auth\.uid\(\) is null then\s*raise exception/);
  });

  it('no devuelve identidad de nadie: ni actor, ni destinatario, ni contacto', () => {
    for (const filtracion of ['actor_id', 'target_user_id', 'user_id', 'email', 'telefono']) {
      expect({ campo: filtracion, enLoQueDevuelve: devuelve.includes(filtracion) }).toEqual({
        campo: filtracion,
        enLoQueDevuelve: false,
      });
    }
  });
});

describe('anon no llega a la bandeja de nadie', () => {
  it('se revoca a public y a anon antes de conceder', () => {
    expect(codigo).toContain('revoke all on function public.mis_avisos(int) from public, anon;');
  });

  it('el unico grant es a authenticated', () => {
    expect(codigo).toContain('grant execute on function public.mis_avisos(int) to authenticated;');
    expect(codigo).not.toMatch(/grant execute on function public\.mis_avisos\(int\) to [^;]*anon/);
  });

  it('y aunque el grant se filtrara, la funcion exige sesion adentro', () => {
    // Doble llave a proposito: el grant es configuracion (se puede pisar desde
    // el panel de Supabase), el `raise exception` es codigo.
    expect(cuerpo).toContain('auth.uid() is null');
  });

  it('la tabla sigue SIN policies: no se le abre RLS publica de paso', () => {
    // Si esta migracion le pusiera una policy de select a notification_events,
    // la RPC dejaria de ser la unica puerta y todo lo de arriba no serviria.
    expect(codigo).not.toMatch(/create policy/i);
    expect(codigo).not.toMatch(/grant select[^;]*notification_events/i);
  });
});

describe('la funcion definer esta blindada como el resto del repo', () => {
  it('es security definer con search_path fijo', () => {
    const decl = codigo.slice(codigo.indexOf('function public.mis_avisos'));
    expect(decl.slice(0, 500)).toContain('security definer');
    expect(decl.slice(0, 500)).toContain('set search_path = public, pg_temp');
  });

  it('el tope de filas esta acotado adentro (no lo decide el cliente solo)', () => {
    // Sin el `least`, un `p_limite = 100000` desde el cliente hace que la base
    // arme una respuesta enorme por cada apertura de la pantalla.
    expect(cuerpo).toMatch(/limit least\(greatest\(p_limite, 1\), \d+\)/);
  });
});

describe('la limitacion honesta esta escrita en el SQL, no solo en el informe', () => {
  it('reporte_nuevo queda afuera: su destinatario se resuelve por zona, en el dispatcher', () => {
    // `enqueue_reporte_nuevo` (0011/0020) no llena target_user_id y su pet_id es
    // el reporte de QUIEN PUBLICO: sin excluirlo, cada quien veria en su bandeja
    // el aviso de su propia publicacion, que no es un aviso para el.
    expect(cuerpo).toContain("ne.tipo <> 'reporte_nuevo'");
  });

  it('nunca me muestro a mi mismo como actor de mi propio aviso', () => {
    expect(cuerpo).toMatch(/ne\.actor_id is null or ne\.actor_id <> auth\.uid\(\)/);
  });
});

describe('el bloqueo entre personas tambien apaga el aviso en la bandeja', () => {
  it('filtra a quien tiene un bloqueo con el actor, en las dos direcciones', () => {
    // Coherencia con el dispatcher (`elBloqueoApagaElAviso`, notifyTargets.ts) y
    // con las listas del cliente (tips.ts / sightings.ts, que ya filtran). Sin
    // esto, bloquear a alguien apagaba el correo y el push pero su pista seguia
    // apareciendo en la bandeja.
    expect(cuerpo).toContain('from public.bloqueos b');
    expect(cuerpo).toContain('b.bloqueador = auth.uid() and b.bloqueado = ne.actor_id');
    expect(cuerpo).toContain('b.bloqueador = ne.actor_id and b.bloqueado = auth.uid()');
  });

  it("respeta la excepcion de 'coincidencia', igual que el dispatcher", () => {
    // Decision ya tomada y documentada en notifyTargets.ts: una coincidencia es
    // el pedido de auxilio de un animal, no contenido dirigido contra una
    // persona. Si la bandeja la filtrara, la bandeja y el correo dirian cosas
    // distintas sobre el mismo evento.
    expect(cuerpo).toMatch(/ne\.tipo <> 'coincidencia'/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LA WEB TIENE QUE ANDAR CON ESTA MIGRACION SIN APLICAR
// ───────────────────────────────────────────────────────────────────────────
describe('0051 no puede romper NADA de lo que ya existe', () => {
  it('no le agrega ni le saca una columna a ninguna tabla', () => {
    // LA TRAMPA DE POSTGREST: pedir una columna nueva en el mismo `select` que
    // las viejas hace fallar la consulta ENTERA. Esta migracion no toca ninguna
    // tabla: es una funcion y dos indices, y nada mas.
    expect(codigo).not.toMatch(/\balter table\b/i);
  });

  it('no redefine ni borra nada de las migraciones anteriores', () => {
    expect(codigo).not.toMatch(/\bdrop (table|policy|trigger|constraint)\b/i);
    expect(codigo).not.toMatch(/\bdelete from\b/i);
    expect(codigo).not.toMatch(/\bupdate public\./i);
    // La unica funcion que crea o reemplaza es la suya.
    const creadas = [...codigo.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map(
      (m) => m[1],
    );
    expect(creadas).toEqual(['mis_avisos']);
  });

  it('no toca el CHECK de tipo ni la Edge Function del dispatcher', () => {
    // Ampliar la lista de tipos es de otra tarea de la tanda. Esta solo LEE: si
    // aparece un tipo nuevo, la bandeja lo muestra con su texto generico.
    expect(codigo).not.toContain('notification_events_tipo_check');
    expect(codigo).not.toMatch(/\binsert into\b/i);
  });

  it('los indices que agrega son `if not exists` (reaplicable sin miedo)', () => {
    const indices = [...codigo.matchAll(/create index (if not exists )?(\w+)/g)];
    expect(indices.length).toBeGreaterThan(0);
    expect(indices.every((m) => !!m[1])).toBe(true);
  });
});

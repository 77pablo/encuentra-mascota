import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0042 (Tanda D · pieza 3b: los indices de
// `messages`).
//
// La migracion YA ESTA APLICADA en Supabase (verificado contra la base el
// 28-jul-2026: los dos indices existen). No la reapliques: tomaria un lock de
// escritura sobre `messages` sin necesidad. Este archivo no lee la base, asi
// que no puede confirmarlo por su cuenta —para eso hay que consultar
// `pg_indexes`—. Lo que SI puede hacer, y es lo que se rompe de verdad, es
// atar el indice a la consulta que lo
// necesita: si alguien cambia por que columnas filtra u ordena
// `listConversations` y el indice se queda con las viejas, deja de servir y
// nadie se entera —la consulta sigue andando, solo que barriendo la tabla—.
// Por eso los dos archivos se leen de verdad con readFileSync y se comparan
// entre si, en vez de repetir a mano lo que dice cada uno.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(DIR, '0042_indices_mensajes.sql'), 'utf8');
const init = readFileSync(join(DIR, '0001_init.sql'), 'utf8');
const servicio = readFileSync(
  join(__dirname, '..', '..', 'src', 'services', 'messages.ts'),
  'utf8',
);

// Los dos archivos EXPLICAN en sus comentarios lo mismo que estas pruebas
// verifican: el .sql nombra `mis_conversaciones` y `messages_to_user_leido_idx`
// para decir que NO los toca, y el servicio nombra `.limit(500)` para decir que
// no lo usa. Buscar esos textos sobre el archivo crudo da falsos positivos
// —paso al escribir este test—, asi que las aserciones corren sobre el CODIGO,
// con los comentarios afuera.
const sinComentariosSql = (s: string) => s.replace(/--[^\n]*/g, '');
const sinComentariosTs = (s: string) => s.replace(/\/\/[^\n]*/g, '');

const codigoSql = sinComentariosSql(sql);
const codigoServicio = sinComentariosTs(servicio);

// Todas las columnas de cada `create index ... on public.messages (...)` de un
// SQL, indexadas por nombre del indice. Los `desc`/espacios se normalizan.
function indicesDeMensajes(fuente: string): Record<string, string[]> {
  const re = /create index (?:if not exists )?(\w+)\s+on public\.messages \(([^)]*)\)/g;
  const salida: Record<string, string[]> = {};
  for (const m of fuente.matchAll(re)) {
    salida[m[1]] = m[2].split(',').map((c) => c.trim().replace(/\s+/g, ' '));
  }
  return salida;
}

const indices = indicesDeMensajes(codigoSql);

describe('0042 crea los dos indices que pide la consulta de conversaciones', () => {
  it('indexa (from_user, creado_en desc) y (to_user, creado_en desc)', () => {
    expect(indices).toEqual({
      messages_from_creado_idx: ['from_user', 'creado_en desc'],
      messages_to_creado_idx: ['to_user', 'creado_en desc'],
    });
  });

  it('los dos son `if not exists`: la migracion se puede reaplicar sin romper', () => {
    for (const nombre of Object.keys(indices)) {
      expect(codigoSql).toContain(`create index if not exists ${nombre}`);
    }
  });
});

describe('los indices calzan con lo que `listConversations` consulta de verdad', () => {
  // El cuerpo real de la consulta paginada, leido del servicio. Si el `.or()`
  // se moviera o cambiara de columnas, esto lo levanta.
  //
  // El `.range(` se busca DESDE la firma de la funcion, no desde el principio
  // del archivo: el comentario de `PAGINA_MENSAJES`, que esta mas arriba, ya
  // menciona `.range()` y el corte caia antes de la funcion (la rebanada salia
  // vacia y las tres pruebas de abajo pasaban sin mirar nada).
  const desde = codigoServicio.indexOf('export async function listConversations');
  const consulta = codigoServicio.slice(desde, codigoServicio.indexOf('.range(', desde));

  it('la rebanada de la consulta no esta vacia (si no, esto no probaria nada)', () => {
    expect(desde).toBeGreaterThanOrEqual(0);
    expect(consulta).toContain(".from('messages')");
  });

  it('la consulta sigue filtrando por from_user OR to_user', () => {
    expect(consulta).toContain('from_user.eq.${me},to_user.eq.${me}');
  });

  it('la consulta sigue ordenando por creado_en descendente', () => {
    expect(consulta).toMatch(/\.order\('creado_en',\s*\{\s*ascending:\s*false\s*\}\)/);
  });

  it('hay un indice por cada columna del OR, y la primera columna es esa', () => {
    // Un OR sobre dos columnas no lo resuelve un indice solo: Postgres arma un
    // BitmapOr con los dos. Por eso tienen que ser DOS indices simetricos.
    const primeras = Object.values(indices).map((cols) => cols[0]);
    expect(primeras.sort()).toEqual(['from_user', 'to_user']);
  });

  it('los dos indices llevan como segunda columna la que ordena la consulta', () => {
    for (const cols of Object.values(indices)) {
      expect(cols[1]).toBe('creado_en desc');
    }
  });

  it('la consulta sigue paginando (no volvio al barrido sin cota ni al .limit(500))', () => {
    // El `.limit(500)` fue rechazado por el spec: corta por recencia de MENSAJE,
    // no de CONVERSACION, asi que un hilo viejo pero vivo desaparece sin error.
    expect(codigoServicio).toContain('.range(desde, desde + PAGINA_MENSAJES - 1)');
    expect(codigoServicio).not.toMatch(/\.limit\(\s*500\s*\)/);
  });
});

describe('0042 se queda en lo barato y no se lleva puesto lo diferido', () => {
  it('no toca ninguna politica RLS', () => {
    // La reescritura de "leer solo mis mensajes" como `(select auth.uid())` va
    // JUNTO con la RPC `mis_conversaciones`, bajo la misma verificacion, no
    // suelta acá. Un drop+create de politica es una ventana sin esa politica.
    expect(codigoSql).not.toContain('create policy');
    expect(codigoSql).not.toContain('drop policy');
    expect(codigoSql).not.toContain('alter policy');
  });

  it('no crea la RPC diferida ni ninguna funcion', () => {
    expect(codigoSql).not.toContain('mis_conversaciones');
    expect(codigoSql).not.toMatch(/create (or replace )?function/);
  });

  it('no borra ni altera nada: solo agrega indices', () => {
    expect(codigoSql).not.toMatch(/\bdrop\b/i);
    expect(codigoSql).not.toMatch(/\bdelete from\b/i);
    expect(codigoSql).not.toMatch(/\balter table\b/i);
  });

  it('no pisa el indice de la 0001 que sirve al globito de sin-leer', () => {
    // `countUnread` filtra (to_user, leido) y corre en cada render. El indice
    // que lo cubre es el de la 0001; 0042 no lo reemplaza ni lo toca.
    expect(init).toContain('create index messages_to_user_leido_idx on public.messages (to_user, leido)');
    expect(codigoSql).not.toContain('messages_to_user_leido_idx');
  });
});

// El guardrail de "esta es la ultima migracion del repo" se mudo a
// migracion0044.test.ts al agregar la 0043/0044. Viaja siempre con la ultima.

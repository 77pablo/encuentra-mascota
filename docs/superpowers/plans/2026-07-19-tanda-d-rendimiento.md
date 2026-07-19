# Tanda D — Rendimiento y costos · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar lo que crece solo — y una cosa que ya está mal hoy: al borrar un reporte, sus fotos siguen públicas para siempre.

**Architecture:** Cuatro piezas independientes. Una es solo cliente (borrado de fotos), una es solo SQL nuevo (purga de la cola), y dos son de una línea (índices y frecuencia del cron). **Ninguna toca permisos ni columnas que la app lea**, así que —a diferencia de la tanda A— la migración y la web pueden desplegarse en cualquier orden.

**Tech Stack:** Expo (React Native + TypeScript), react-native-web, Supabase (Postgres + RLS + PostgREST + Storage + pg_cron), Jest.

Spec: `docs/superpowers/specs/2026-07-19-tanda-d-rendimiento-design.md`.

## Global Constraints

- **Español** en todo lo visible y en los comentarios de código.
- **Toda la suite verde:** `npm test` (actualmente **264 tests, 35 suites**) y `npx tsc --noEmit` (0 errores).
- **No aplicar migraciones contra Supabase** durante las tareas de código. Eso es la Task 4, con supervisión.
- Las funciones nuevas de Postgres van **sin parámetros** y con `security definer set search_path = public, pg_temp`, igual que `mi_perfil()` y `anonimizar_mi_cuenta()`. Es la propiedad de seguridad que este proyecto ya verificó dos veces.
- `create or replace` **no puede cambiar el tipo de retorno** de una función: si hace falta, `drop function if exists` antes.
- Los tests de servicios siguen el patrón de **builder falso encadenable** ya existente (ver `__tests__/services/pets.test.ts`).
- Commits en español, sin `--no-verify`.

## Orden

**1 → 2 → 3 → 4.** La Task 1 primero porque es la única que arregla algo que **ya está mal**. La Task 2 después porque es la única con SQL nuevo de verdad. La Task 3 son dos cambios triviales. La Task 4 aplica y verifica contra producción.

---

## Task 1: Borrar las fotos al borrar un reporte

**Files:**
- Create: `src/lib/rutaStorage.ts`
- Modify: `src/services/pets.ts` (`deletePet`, ~línea 100)
- Test: `__tests__/lib/rutaStorage.test.ts`, `__tests__/services/pets.test.ts`

**Interfaces:**
- Produces: `rutaDeFotoPropia(url: string, userId: string): string | null` — devuelve la ruta dentro del bucket (`<uid>/<archivo>.jpg`) si la URL es una foto del bucket `pet-photos` que pertenece a `userId`; `null` en cualquier otro caso.
- Modifies: `deletePet(id: string, userId: string): Promise<void>` — **gana un segundo parámetro**. Hoy es `deletePet(id)`.

**Por qué:** `src/services/pets.ts:100-103` borra la fila y nada más. El bucket `pet-photos` es **público**, así que la foto sigue accesible por URL para siempre. Cuando alguien borra su reporte lo que quiere decir es *"que esto deje de estar publicado"*, y la app le responde "listo" mientras la imagen sigue online.

**Contexto importante — por qué esto es barato:** el Critical de la tanda de borrado de cuenta existía porque `delete-account` corre con `service_role`, **que se saltea la RLS de Storage**. `deletePet` corre **como el usuario**, y `0001_init.sql:118-120` ya tiene `create policy "borrar mis fotos" ... using (bucket_id = 'pet-photos' and owner = auth.uid())`. La vía de escalada no existe acá: el peor caso es que Storage rechace el borrado y no pase nada.

- [ ] **Step 1: Escribir el test que falla, del helper puro**

Las fotos se guardan como **URL pública completa** (`uploadPetPhoto` devuelve `data.publicUrl`), así que el helper tiene que extraer la ruta de la URL. Confirmar el formato exacto mirando `src/services/storage.ts:21`.

```ts
// __tests__/lib/rutaStorage.test.ts
import { rutaDeFotoPropia } from '../../src/lib/rutaStorage';

const UID = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://ywlrcfaybnikaurxsgtj.supabase.co/storage/v1/object/public/pet-photos';

describe('rutaDeFotoPropia', () => {
  it('extrae la ruta de una foto propia', () => {
    expect(rutaDeFotoPropia(`${BASE}/${UID}/abc123.jpg`, UID)).toBe(`${UID}/abc123.jpg`);
  });

  // La defensa central: nunca devolver una ruta que no sea del propio usuario.
  it('rechaza la foto de otra persona', () => {
    expect(rutaDeFotoPropia(`${BASE}/${OTRO}/abc123.jpg`, UID)).toBeNull();
  });

  // Mismo caso que cazo el Critical de la tanda de borrado de cuenta.
  it('rechaza un intento de salirse de la carpeta propia', () => {
    expect(rutaDeFotoPropia(`${BASE}/${UID}/../${OTRO}/abc123.jpg`, UID)).toBeNull();
  });

  it('rechaza subcarpetas: la forma exigida es <uid>/<archivo>', () => {
    expect(rutaDeFotoPropia(`${BASE}/${UID}/sub/abc123.jpg`, UID)).toBeNull();
  });

  it('rechaza una URL de otro bucket', () => {
    const otroBucket = BASE.replace('pet-photos', 'avatares');
    expect(rutaDeFotoPropia(`${otroBucket}/${UID}/abc123.jpg`, UID)).toBeNull();
  });

  it('rechaza basura', () => {
    expect(rutaDeFotoPropia('', UID)).toBeNull();
    expect(rutaDeFotoPropia('no-es-una-url', UID)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx jest __tests__/lib/rutaStorage.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/rutaStorage'`

- [ ] **Step 3: Implementar el helper**

```ts
// src/lib/rutaStorage.ts

// Las fotos se guardan como URL publica completa (ver services/storage.ts), asi
// que para borrarlas de Storage hay que recuperar la ruta de adentro del bucket.
const BUCKET = 'pet-photos';
const MARCA = `/storage/v1/object/public/${BUCKET}/`;

// Devuelve la ruta dentro del bucket solo si la foto es del propio usuario.
//
// Exige la misma forma que `mis_fotos_a_borrar()` en 0017: UN solo segmento bajo
// la carpeta del usuario. No es la defensa principal —esa es la RLS de Storage,
// que no se puede evitar desde el cliente— pero deja escrita la invariante en el
// codigo, evita mandarle a Storage rutas que van a rebotar, y si alguna vez este
// camino se muda a una Edge Function con service_role, el filtro ya esta puesto.
export function rutaDeFotoPropia(url: string, userId: string): string | null {
  if (!url || !userId) return null;
  const i = url.indexOf(MARCA);
  if (i === -1) return null;

  const ruta = url.slice(i + MARCA.length);
  // `[^/]+` en el segundo segmento descarta subcarpetas y tambien el `..`, que
  // solo puede escalar si viene seguido de otra barra.
  const permitida = new RegExp(`^${userId}/[^/]+$`);
  return permitida.test(ruta) ? ruta : null;
}
```

⚠️ `userId` viene de la sesión, no del usuario, así que no hace falta escaparlo para la expresión regular. Aun así, si `userId` no tiene forma de UUID el `RegExp` podría comportarse raro: **no agregar validación extra** — el `test` fallaría y devolvería `null`, que es el lado seguro.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx jest __tests__/lib/rutaStorage.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Escribir el test que falla, de `deletePet`**

Añadir a `__tests__/services/pets.test.ts`, siguiendo el patrón de builder falso del archivo. Hay que mockear también `supabase.storage`.

```ts
it('borra las fotos ANTES de borrar la fila, incluida final_foto', async () => {
  const fotos = [`${BASE}/${UID}/a.jpg`, `${BASE}/${UID}/b.jpg`];
  // 1a llamada: el select que lee las rutas. 2a: el delete de la fila.
  mockFrom
    .mockReturnValueOnce(makeQueryBuilder({ data: { fotos, final_foto: `${BASE}/${UID}/c.jpg` }, error: null }))
    .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

  await deletePet('p1', UID);

  expect(mockRemove).toHaveBeenCalledWith([`${UID}/a.jpg`, `${UID}/b.jpg`, `${UID}/c.jpg`]);
});

// La leccion literal del Critical #2 del borrado de cuenta: si la fila se borra
// primero, las rutas se pierden y no hay reintento posible.
it('lee las rutas antes de destruir la fila', async () => {
  const orden: string[] = [];
  mockFrom.mockImplementation(() => makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }));
  mockRemove.mockImplementation(() => { orden.push('storage'); return Promise.resolve({ data: [], error: null }); });
  // registrar el orden real y afirmar que 'storage' ocurre antes que el delete
});

// Se elige el estado malo VISIBLE por sobre el silencioso: si abortaramos, un
// hipo de Storage dejaria a la persona sin poder borrar su propio reporte, que
// puede ser justo una urgencia de privacidad.
it('borra la fila igual si Storage falla', async () => {
  mockFrom
    .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [`${BASE}/${UID}/a.jpg`], final_foto: null }, error: null }))
    .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
  mockRemove.mockResolvedValue({ data: null, error: { message: 'boom' } });

  await expect(deletePet('p1', UID)).resolves.toBeUndefined();
});

it('no llama a Storage si el reporte no tiene fotos', async () => {
  mockFrom
    .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
    .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

  await deletePet('p1', UID);
  expect(mockRemove).not.toHaveBeenCalled();
});

it('ignora las fotos que no son del propio usuario', async () => {
  mockFrom
    .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [`${BASE}/${OTRO}/x.jpg`], final_foto: null }, error: null }))
    .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

  await deletePet('p1', UID);
  expect(mockRemove).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `npx jest __tests__/services/pets.test.ts`
Expected: FAIL

- [ ] **Step 7: Implementar `deletePet`**

```ts
// Borra el reporte y, con el, sus fotos del bucket publico.
//
// El ORDEN importa: primero se leen las rutas, despues se borra de Storage y al
// final la fila. Si se borrara la fila primero, las rutas se pierden y no hay
// reintento posible (es la leccion literal del Critical #2 del borrado de
// cuenta, donde las fotos quedaban para siempre en un bucket publico mientras
// respondiamos "listo").
//
// Si Storage falla, la fila se borra IGUAL: quedaria una foto huerfana, que es
// exactamente el estado de hoy, mientras que abortar dejaria a la persona sin
// poder borrar su propio reporte —que puede ser justo una urgencia de
// privacidad—. Se elige el estado malo visible por sobre el silencioso.
export async function deletePet(id: string, userId: string): Promise<void> {
  const { data: fila } = await supabase
    .from('pets')
    .select('fotos, final_foto')
    .eq('id', id)
    .maybeSingle();

  const urls: string[] = [...((fila?.fotos as string[]) ?? [])];
  // `final_foto` (el "final feliz", migracion 0008) vive en su propia columna y
  // es facil de olvidar: sin esto, cada reencuentro deja una huerfana.
  if (fila?.final_foto) urls.push(fila.final_foto as string);

  const rutas = urls
    .map((u) => rutaDeFotoPropia(u, userId))
    .filter((r): r is string => r !== null);

  if (rutas.length > 0) {
    const { error: errStorage } = await supabase.storage.from('pet-photos').remove(rutas);
    // A proposito no se corta el flujo: ver el comentario de arriba.
    if (errStorage) console.warn('No se pudieron borrar algunas fotos:', errStorage.message);
  }

  const { error } = await supabase.from('pets').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 8: Actualizar al único llamador**

`src/screens/ProfileScreen.tsx:110` llama `deletePet(id)`. Pasa a `deletePet(id, user.id)`. Verificar con `grep -rn "deletePet" src/` que no haya otro.

- [ ] **Step 9: Suite completa y commit**

```bash
npx tsc --noEmit && npm test
git add src/lib/rutaStorage.ts __tests__/lib/rutaStorage.test.ts src/services/pets.ts __tests__/services/pets.test.ts src/screens/ProfileScreen.tsx
git commit -m "fix(privacidad): borrar las fotos del bucket al borrar un reporte"
```
Expected: ~275 tests verdes.

---

## Task 2: Purga de la cola de avisos

**Files:**
- Create: `supabase/migrations/0019_rendimiento.sql`
- Modify: `docs/agendar-avisos.sql`

**Interfaces:**
- Produces (en Postgres): `avisos_a_purgar()` (solo lectura) y `purgar_avisos()` (borra, con tope). **Ambas sin parámetros.**

**Por qué:** `notification_events` es una cola que funciona como bitácora permanente — no existe **un solo `delete`** sobre ella en todo el repo. Lo que importa no es el espacio sino que el índice `(estado, creado_en)` se degrada: el despachador hace `where estado='pendiente' order by creado_en limit 50` cada corrida, y con 500.000 filas de las cuales 3 están pendientes, recorre una estructura mucho más grande. Se vuelve lento de forma **creciente y silenciosa**: nadie ve un error, los avisos solo tardan más.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/0019_rendimiento.sql
-- Tanda D. No toca permisos ni columnas que la app lea: se puede aplicar en
-- cualquier orden respecto del despliegue de la web.

-- ---------------------------------------------------------------------------
-- 1. Purga de la cola de avisos ya despachados
-- ---------------------------------------------------------------------------
-- Que se borra y que NO:
--   estado = 'enviado'  y procesado_en < now() - 90 dias  -> SE BORRA
--   estado = 'error'                                       -> NUNCA
--   estado = 'pendiente'                                   -> NUNCA
--
-- `error` no se toca jamas: son las unicas filas que dicen "este aviso no salio
-- y por que" (`error_detalle`). Son un punado por definicion (un evento llega a
-- error recien tras 3 intentos) y hoy, con el correo todavia sin activar, es
-- justo la informacion que sirve.
--
-- `pendiente` tampoco, obviamente. Se escribe el `estado = 'enviado'` EXPLICITO
-- y no se confia en que `procesado_en` sea nulo: alcanza con que alguien agregue
-- un procesado_en provisorio en un reintento futuro para que la purga se empiece
-- a comer la cola viva.
--
-- 90 dias y no 7 ni 30 porque el borrado es IRREVERSIBLE y a esta escala 90 dias
-- son unos pocos miles de filas: la retencion larga no cuesta nada y permite
-- investigar "por que no me llego el aviso de hace dos meses".

-- Indice parcial: el que ya existe, (estado, creado_en), sirve para LEER la
-- cola, no para purgar (que filtra por procesado_en). Este es chiquito porque
-- solo indexa lo purgable.
create index if not exists notification_events_purga_idx
  on public.notification_events (procesado_en) where estado = 'enviado';

-- Solo lectura: contesta que se llevaria la purga, sin borrar nada.
create or replace function public.avisos_a_purgar()
returns table (cuantos bigint, mas_viejo timestamptz, mas_nuevo timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select count(*), min(procesado_en), max(procesado_en)
    from public.notification_events
   where estado = 'enviado'
     and procesado_en < now() - interval '90 days';
$$;

create or replace function public.purgar_avisos()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare borradas bigint;
begin
  -- Tope de 5000 por corrida: la PRIMERA purga sobre un atraso grande no puede
  -- quedarse minutos con la tabla tomada mientras los triggers de publicacion
  -- intentan insertar. Si sobra trabajo, la corrida semanal siguiente lo
  -- termina: se autocura sin intervencion.
  with victimas as (
    select ctid from public.notification_events
     where estado = 'enviado'
       and procesado_en < now() - interval '90 days'
     limit 5000
  )
  delete from public.notification_events e
   using victimas v where e.ctid = v.ctid;
  get diagnostics borradas = row_count;
  return borradas;
end; $$;

-- Sin parametros las dos, a proposito: no existe una firma que permita pedir
-- "borra hasta tal fecha". La ventana de 90 dias esta compilada adentro y
-- cambiarla exige una migracion, que se revisa. Y sin execute para anon ni
-- authenticated: solo las llama el postgres del cron.
revoke all on function public.avisos_a_purgar() from public, anon, authenticated;
revoke all on function public.purgar_avisos()   from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Indices de messages
-- ---------------------------------------------------------------------------
-- Aceleran countUnread (que corre en cada render de la campanita) y listMessages,
-- y dejan el terreno listo para la RPC de conversaciones que quedo diferida.
create index if not exists messages_from_creado_idx on public.messages (from_user, creado_en desc);
create index if not exists messages_to_creado_idx   on public.messages (to_user,   creado_en desc);
```

⚠️ **Antes de escribirla, confirmar contra el repo** que la tabla `notification_events` tiene las columnas `estado`, `procesado_en` y `error_detalle` con esos nombres exactos (ver `0011_avisos.sql` y `0013_error_avisos.sql`), y el nombre real del índice existente. Si algo no calza, ajustar **la migración**, no inventar nombres.

- [ ] **Step 2: Agendar la purga**

Añadir al final de `docs/agendar-avisos.sql`, con el mismo patrón de `unschedule` condicional que ya usa el archivo:

```sql
-- Purga semanal de la cola, domingo a las 04:00. Job SEPARADO del despachador
-- a proposito: si la purga rompe el despacho sigue, y si el despacho rompe la
-- purga sigue. Ademas corre como SQL puro dentro de Postgres, sin HTTP y sin
-- service_role viajando por la red.
select cron.unschedule('purgar-avisos')
where exists (select 1 from cron.job where jobname = 'purgar-avisos');

select cron.schedule('purgar-avisos', '0 4 * * 0', $$ select public.purgar_avisos(); $$);
```

- [ ] **Step 3: Verificar que no rompe nada**

Run: `npx tsc --noEmit && npm test`
Expected: 275 tests verdes, sin cambios (esta tarea no toca TypeScript).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_rendimiento.sql docs/agendar-avisos.sql
git commit -m "feat(rendimiento): purga de la cola de avisos e indices de mensajes"
```

---

## Task 3: Bajar la frecuencia del cron

**Files:**
- Modify: `docs/agendar-avisos.sql` (la expresión de `despachar-avisos`, ~línea 19)

**Por qué:** `'* * * * *'` son ~43.200 invocaciones al mes de la Edge Function, y la abrumadora mayoría lee la cola, encuentra `[]` y se va. **No cuesta dinero hoy** (el plan gratis da 500.000 y esto es el ~8,6%), pero es desperdicio y margen gastado en nada.

**Lo que NO se hace, y por qué:** disparar el despacho desde el trigger con `pg_net` es lo teóricamente correcto, pero (a) la entrega se quedaría **sin red de seguridad** —si el worker de `pg_net` se cae, el evento queda `pendiente` para siempre y nadie reintenta, mientras que hoy el cron es exactamente esa red—, (b) metería una credencial dentro de un trigger que corre en cada publicación, y (c) obligaría a tocar los tres encoladores, que son justo lo que rompería la publicación de reportes si tuvieran un error. Se difiere hasta que **los avisos lleguen de verdad** (hoy el correo sigue sin activarse) y la latencia se note.

- [ ] **Step 1: Cambiar la expresión**

```sql
-- ANTES
select cron.schedule('despachar-avisos', '* * * * *', $$ ... $$);

-- DESPUÉS  (-80% de invocaciones; latencia máxima del aviso: 5 minutos)
select cron.schedule('despachar-avisos', '*/5 * * * *', $$ ... $$);
```

Y un comentario en español explicando que un aviso atrasado **no se pierde**, solo llega más tarde: los eventos siguen `pendiente` hasta que alguien los procese, y eso es lo que hace seguro bajar la frecuencia.

- [ ] **Step 2: Commit**

```bash
git add docs/agendar-avisos.sql
git commit -m "perf(avisos): despachar cada 5 minutos en vez de cada minuto"
```

---

## Task 4: Aplicar y verificar contra producción

⚠️ Requiere el token de Supabase, que entrega Pablo en un archivo (nunca pegado en el chat) y se borra al terminar.

**Sin restricción de orden:** `0019` no toca permisos ni columnas que la app lea, así que la migración y la web pueden ir en cualquier orden.

- [ ] **Step 1: Antes de agendar nada, mirar qué se llevaría la purga**

```sql
select * from public.avisos_a_purgar();
```
Expected: **0**. Con la base de hoy no hay ningún evento de hace 90 días, y ese cero es la prueba de que la purga no se va a llevar nada por sorpresa.

- [ ] **Step 2: Prueba de sobrevivencia de la purga**

Insertar tres filas a mano: una `enviado` de hace 200 días, una `enviado` de hace 10 días, una `error` de hace 200 días. Correr `select public.purgar_avisos();`.
Expected: devuelve **1**, y sobreviven exactamente las otras dos. Borrar las de prueba después.

- [ ] **Step 3: Comprobar que las funciones no son invocables desde la app**

`avisos_a_purgar()` y `purgar_avisos()` sin sesión y con una sesión `authenticated` → **`42501` en los cuatro casos**.

- [ ] **Step 4: Confirmar los dos jobs**

```sql
select jobname, schedule, active from cron.job;
```
Expected: `despachar-avisos` con `*/5 * * * *` y `purgar-avisos` con `0 4 * * 0`, ambos activos.

- [ ] **Step 5: La prueba que de verdad importa — que la foto desaparezca**

Contra la base real, con la app: publicar un reporte con foto, **guardar la URL pública**, comprobar con `curl` que devuelve `200`, borrar el reporte desde la app, y comprobar que la misma URL ahora devuelve **`400`/`404`**. Sin este paso no se puede afirmar que el problema esté resuelto.

- [ ] **Step 6: El ataque**

Desde la cuenta A, meter por API la ruta de una foto de la cuenta B dentro de un reporte propio, borrarlo, y confirmar que **la foto de B sigue online**. Verifica que la RLS de Storage sostiene lo que este diseño le delega.

- [ ] **Step 7: Dejar la base limpia y anotar el estado**

Borrar todo dato de prueba. Actualizar `ESTADO.md`.

```bash
git add ESTADO.md
git commit -m "docs: tanda D aplicada y verificada en produccion"
```

---

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| La purga se come la cola viva | `estado = 'enviado'` explícito, no se confía en que `procesado_en` sea nulo. Y `avisos_a_purgar()` deja verlo antes |
| La primera purga bloquea la tabla | Tope de 5.000 por corrida; lo que sobra lo termina la semana siguiente |
| Borrar la fila antes de leer las rutas deja fotos huérfanas sin reintento | Orden explícito en la Task 1 y un test que lo verifica |
| Un fallo de Storage impide borrar el reporte | Se borra la fila igual: se degrada al estado de hoy, no a algo peor |
| `final_foto` se olvida y cada reencuentro deja una huérfana | Test específico en la Task 1, Step 5 |
| El helper de rutas se cree la defensa principal | La defensa real es la RLS de Storage; el filtro es defensa en profundidad, y el ataque de la Task 4 Step 6 lo comprueba |

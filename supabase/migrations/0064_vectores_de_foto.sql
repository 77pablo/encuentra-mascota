-- 0064: vectores de foto para la coincidencia (tanda 14, area B).
--
-- TABLA APARTE, NO UNA COLUMNA EN `pets`: media app lee pets con select('*') y
-- una columna nueva que falte rompe la ficha entera. Es la misma razon de
-- `pet_chips` (0054) y de las tres tablas de la cuadrilla (0048).
--
-- QUE SE VECTORIZA: SOLO fotos de reportes, que ya son publicas. Las fotos de
-- avisos anonimos viven en el bucket privado `avisos-anonimos` (0062) y NO se
-- tocan: su vector seria un dato derivado de una imagen que su autor mando en
-- privado.
--
-- QUIEN ESCRIBE, Y POR QUE ES EL CLIENTE: la Task B1 midio que CLIP no corre en
-- una Edge Function de Supabase (el runtime Deno no registra ningun backend de
-- ONNX Runtime, tres variantes de import probadas) y que Cloudflare Workers AI
-- no tiene ningun modelo de embedding que acepte imagenes. Con las dos rutas de
-- servidor cerradas, Pablo decidio calcular el vector EN EL NAVEGADOR. Asi que
-- escribe el cliente, acotado por RLS a sus propios reportes.
--
-- LO QUE ESO CONCEDE, DICHO DE FRENTE: alguien puede plantar en SU reporte un
-- vector que no corresponde a su foto —por ejemplo el de la foto publica de otro
-- reporte— y fabricarse una coincidencia hacia esa persona. No es un agujero
-- nuevo: subir directamente la foto ajena como foto del reporte consigue lo
-- mismo y ya era posible. Lo que la RLS SI impide es tocar el vector de un
-- reporte ajeno.
--
-- Y EL VECTOR (columna `embedding`) NO SE PUEDE LEER: a nadie, ni siquiera al
-- dueño, se le concede el privilegio de columna sobre `embedding` (ver el
-- grant mas abajo). Si saliera seria un oraculo de parecido — cualquiera
-- podria medir cuanto se parece su foto a la de un reporte ajeno sin que
-- nadie se entere. Postgres tiene privilegios POR COLUMNA ademas de RLS por
-- fila: la fila puede ser visible y aun asi `select embedding` da 42501.
--
-- ¿POR QUE HAY POLICY DE SELECT ENTONCES, si el punto es que no se lea? Sin
-- ninguna policy de SELECT, Postgres no tiene como evaluar el `where` de un
-- UPDATE (necesita el privilegio de SELECT sobre las columnas referidas ahi
-- para decidir que filas tocar) ni el `where` que emite `supabase-js` desde
-- el cliente. El resultado, medido en la base real: `update ... where
-- pet_id = X and foto_url = Y` le daba 42501 AL PROPIO DUEÑO. Recalcular el
-- vector de una foto ya vectorizada fallaba siempre, para todos — la policy
-- de UPDATE de mas abajo era letra muerta. La policy de SELECT que sigue
-- resuelve eso: expone la FILA (sin `embedding`, por el grant de columna) al
-- dueño, para que el `where` la encuentre. No es un oraculo: sólo deja ver
-- `id, pet_id, foto_url, creado_en` de SUS PROPIOS reportes, dato que ya es
-- suyo.
--
-- LO QUE ESTO NO ARREGLA: `insert ... on conflict (pet_id, foto_url) do
-- update set embedding = ...` — el patron literal de `.upsert()` — sigue
-- fallando con 42501 incluso para el dueño y sin ningun conflicto real.
-- Medido: Postgres exige privilegio de SELECT sobre TODAS las columnas
-- alcanzadas por el `do update set` (aca, `embedding`) para plantear el
-- posible camino de actualizacion del ON CONFLICT, sin importar el recorte
-- por columna. Concederlo rompería la garantia de arriba (el dueño leeria su
-- propio vector, y de ahí a exponerlo a cualquiera hay un paso). La via que
-- SI funciona, verificada abajo: un `insert` liso para fotos nuevas y un
-- `update ... where pet_id = X and foto_url = Y` liso para recalcular una
-- foto existente — exactamente el patron "escribir, mirar si volvio fila"
-- que el resto del proyecto ya usa para la RLS silenciosa. Quien escriba el
-- cliente (Task B3) NO puede usar `.upsert()` contra esta tabla.
--
-- Ojo también con .select() SIN argumentos contra esta tabla: supabase-js lo traduce a select=*,
-- que toca embedding y da 42501 aunque la escritura haya funcionado. Siempre columnas explícitas:
-- .select('id'). El patrón establecido en el resto del proyecto (.select() pelado) acá NO sirve.

create extension if not exists vector;

create table public.pet_fotos_vector (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  foto_url text not null,
  embedding vector(512) not null,
  creado_en timestamptz not null default now(),
  unique (pet_id, foto_url)
);

create index pet_fotos_vector_pet_idx on public.pet_fotos_vector (pet_id);

alter table public.pet_fotos_vector enable row level security;

-- Policy de SELECT acotada al dueño — SOLO para que el `where` de un UPDATE
-- (o de un `.eq(...).eq(...)` de supabase-js) encuentre la fila. No es un
-- oraculo: el grant de columna de mas abajo NUNCA incluye `embedding`, asi
-- que ver la fila no concede ver el vector. `buscar_coincidencias` (security
-- definer) sigue leyendo `embedding` sin pasar por este grant.
create policy "el dueño ve sus propias filas (nunca el vector)"
  on public.pet_fotos_vector for select to authenticated
  using (
    exists (select 1 from public.pets p
             where p.id = pet_fotos_vector.pet_id and p.user_id = auth.uid())
  );

-- INSERT y UPDATE acotados al dueño del reporte. El `with check` es lo que de
-- verdad ata la escritura: sin el, la policy solo filtraria que filas se pueden
-- mirar para actualizar, no cuales se pueden crear (es exactamente la forma del
-- agujero de escalada de privilegios que aparecio en `profiles`, donde un
-- `for update using (...)` SIN `with check` dejaba a cualquiera hacerse admin).
create policy "el vector es del dueño del reporte"
  on public.pet_fotos_vector for insert to authenticated
  with check (
    exists (select 1 from public.pets p
             where p.id = pet_fotos_vector.pet_id and p.user_id = auth.uid())
  );

create policy "el dueño puede recalcular el vector de su foto"
  on public.pet_fotos_vector for update to authenticated
  using (
    exists (select 1 from public.pets p
             where p.id = pet_fotos_vector.pet_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.pets p
             where p.id = pet_fotos_vector.pet_id and p.user_id = auth.uid())
  );

-- Fail-closed y explicito, con los roles NOMBRADOS: `revoke ... from public` NO
-- le saca el privilegio a `anon` ni a `authenticated`, porque las default
-- privileges de Supabase se lo conceden a ellos de forma directa y no via
-- PUBLIC. Es la trampa que la 0058 ya documenta y que la 0063 de esta misma
-- tanda se comio en la primera pasada.
revoke all on public.pet_fotos_vector from public, anon, authenticated;
grant insert, update on public.pet_fotos_vector to authenticated;
-- SELECT por COLUMNA, no de tabla completa — y `embedding` deliberadamente
-- AFUERA de la lista. `authenticated` puede ver que fotos suyas ya tienen
-- vector (id, pet_id, foto_url, creado_en: su propio dato), pero
-- `select embedding` da 42501 aunque la fila sea la del propio dueño.
grant select (id, pet_id, foto_url, creado_en) on public.pet_fotos_vector to authenticated;

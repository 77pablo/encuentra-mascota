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
-- Y NO SE PUEDE LEER: sin policy de SELECT, el vector no sale nunca al cliente.
-- Si saliera seria un oraculo de parecido — cualquiera podria medir cuanto se
-- parece su foto a la de un reporte ajeno sin que nadie se entere.

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

-- SIN policy de SELECT a proposito: el vector no sale nunca al cliente (ver
-- arriba). Quien lo lee es `buscar_coincidencias`, que es security definer.
--
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

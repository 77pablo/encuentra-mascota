-- ============================================================
-- SEÑA SECRETA DE VERIFICACIÓN (protección contra estafas)
--
-- Al publicar una pérdida, el dueño puede guardar 1 o 2 señas particulares que
-- NO se publican: una cicatriz en la panza, la oreja izquierda mordida, que se
-- sienta cuando le decís "cama". Sirven para UNA sola cosa: cuando alguien
-- escribe diciendo "la tengo", se le pide que las describa. El que de verdad la
-- tiene enfrente las ve; el que la sacó de la foto del aviso, no.
--
-- El FBI, la BBB y varias policías estatales tienen alertas activas sobre
-- estafas con mascotas perdidas, incluida la variante con fotos generadas por
-- IA. Contra una foto falsa el "mandame una foto" ya no sirve; la seña sí.
--
-- ------------------------------------------------------------
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN `pets`
--
-- `pets` se lee con `select('*')` en media app, y además la exponen las RPC
-- públicas de búsqueda (0014/0015/0021/0028) y el detalle público. Una columna
-- nueva ahí habría estado a UN `select('*')` de distancia de salir impresa, y
-- cerrarla habría exigido el revoke-por-columna de la 0018 sobre una tabla con
-- veinte columnas y una lista de grants imposible de mantener (la propia 0018
-- deja escrita la advertencia: ese esquema es fail-closed y hay que acordarse de
-- cada columna nueva a mano).
--
-- En una tabla aparte, para filtrar la seña hay que ir a buscarla A PROPÓSITO.
-- La defensa es estructural, no una policy con suerte.
--
-- ------------------------------------------------------------
-- DEGRADACIÓN SIN ESTA MIGRACIÓN APLICADA
--
-- La app anda igual sin esto. `src/services/senasPrivadas.ts` es el ÚNICO lugar
-- que nombra la tabla, y trata "la tabla no existe" (42P01 / PGRST205) como
-- "la función todavía no está desplegada": leer devuelve null y guardar devuelve
-- false, sin tirar. Publicar un reporte nunca falla por esto.
--
-- Y nada de esto viaja en el mismo `select` que las columnas de `pets`: es otra
-- consulta, a otra tabla. Es la trampa clásica de PostgREST —pedir una columna
-- nueva junto a las viejas hace fallar la consulta ENTERA—, y acá no aplica
-- porque no hay ninguna consulta mezclada.
-- ============================================================

create table public.pet_senas_privadas (
  -- Una fila por reporte. `pet_id` es la PK: no hace falta un id propio y el
  -- upsert por `pet_id` queda natural.
  pet_id uuid primary key references public.pets(id) on delete cascade,
  -- Se guarda el dueño en la propia fila para que la policy no tenga que salir a
  -- buscarlo a `pets` en CADA lectura. El `with check` de abajo se encarga de que
  -- este `user_id` no pueda mentir.
  user_id uuid not null references public.profiles(id) on delete cascade,
  sena_1 text,
  sena_2 text,
  creado_en timestamptz not null default now(),
  -- Mismos topes que el formulario (criterio de la 0016: la API es pública, la
  -- base repite los límites para quien escriba por fuera de la app).
  constraint pet_senas_1_largo check (sena_1 is null or length(sena_1) <= 200),
  constraint pet_senas_2_largo check (sena_2 is null or length(sena_2) <= 200)
);

alter table public.pet_senas_privadas enable row level security;

-- UNA sola policy, y es del dueño. Que sea una sola importa: en Postgres varias
-- policies permisivas se SUMAN (son un OR), así que una segunda más laxa anularía
-- a esta sin que nadie lo note. El guardián
-- `__tests__/db/senasPrivadas.test.ts` falla si aparece una segunda.
--
-- El `with check` mira DOS cosas: que el `user_id` que se escribe sea el propio
-- (si no, cualquiera se colgaría de otro), y que el reporte también sea suyo (si
-- no, se podría escribir una "seña" en el reporte de un vecino y ensuciárselo).
create policy "solo el dueño ve y edita sus señas privadas"
  on public.pet_senas_privadas for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.pets p where p.id = pet_id and p.user_id = auth.uid())
  );

create index pet_senas_privadas_user_id_idx on public.pet_senas_privadas (user_id);

-- Fail-closed, mismo criterio que la 0018. Supabase le da permisos por defecto a
-- `anon` y `authenticated` sobre el esquema `public`; la RLS de arriba ya
-- alcanzaría, pero preferimos que el permiso NO EXISTA antes que depender de una
-- sola capa. `public` va en el revoke a propósito: es el pseudo-rol del que
-- heredan todos, y dejarlo afuera haría que un grant heredado anulara todo esto
-- en silencio (la lección literal de la 0018).
revoke all on public.pet_senas_privadas from public, anon;

-- `anon` no aparece en NINGÚN grant. Un visitante sin sesión no tiene por qué
-- llegar ni a la puerta.
grant select, insert, update, delete on public.pet_senas_privadas to authenticated;

-- A PROPÓSITO no se crea ninguna función `security definer` sobre esta tabla.
-- Una RPC así corre con los permisos del dueño de la función y se saltea la RLS:
-- es la puerta trasera clásica que dejaría todo lo de arriba de adorno. La app no
-- la necesita, porque el único que lee la seña es el dueño y la RLS ya se la da.

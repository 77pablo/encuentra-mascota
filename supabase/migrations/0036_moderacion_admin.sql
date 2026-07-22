-- 0036_moderacion_admin.sql
-- Admin, suspension de cuentas y ciclo de estado de las denuncias.
-- El privilegio NO se abre con RLS ancha: todo pasa por RPC security definer
-- (0036b) que chequean es_admin() por dentro, el patron de mi_perfil().

-- 1) Bandera de admin y de suspension en profiles.
alter table public.profiles add column if not exists es_admin boolean not null default false;
alter table public.profiles add column if not exists suspendido_en timestamptz;

-- profiles tiene grant fail-closed por columna (0018). es_admin es un dato del
-- dueño: se expone SOLO por mi_perfil() (0036c), no se agrega al grant publico.
-- suspendido_en tampoco se concede a nadie: solo lo leen funciones definer.

-- 2) Ciclo de estado de las denuncias.
alter table public.denuncias add column if not exists estado text not null default 'pendiente'
  check (estado in ('pendiente','resuelta','descartada'));
alter table public.denuncias add column if not exists resuelto_en timestamptz;
alter table public.denuncias add column if not exists resuelto_por uuid references public.profiles(id) on delete set null;
alter table public.denuncias add column if not exists accion text;
create index if not exists denuncias_estado_idx on public.denuncias (estado, creado_en);

-- 3) Gate de admin. security definer para poder mirar profiles.es_admin aunque
--    la RLS/grants no lo expongan al llamador.
create or replace function public.es_admin()
returns boolean
language sql security definer set search_path = public, pg_temp stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and es_admin);
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- 4) Gate de suspension. Lo consultan las policies de insert de contenido.
create or replace function public.estoy_suspendido()
returns boolean
language sql security definer set search_path = public, pg_temp stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and suspendido_en is not null);
$$;
revoke all on function public.estoy_suspendido() from public, anon;
grant execute on function public.estoy_suspendido() to authenticated;

-- 5) Enforcement: un suspendido no publica ni escribe. Se recrea cada policy
--    de INSERT conservando VERBATIM su condicion vigente y sumando el gate.
--
--    Verificado leyendo el estado actual de cada policy (no el brief a
--    ciegas) al dia de la 0035:
--      - pets/adoptions/sightings: columna de dueño `user_id` (0001/0030/0007).
--      - pet_tips: columna de dueño `user_id` (0012), NO `autor` — el nombre
--        `autor` no existe en esta tabla.
--      - adoption_questions: la policy de insert vigente se llama "preguntar"
--        (0032), NO "crear mis preguntas", columna de dueño `user_id` (no
--        `autor`), y trae ADEMAS la condicion `exists(...)` que valida que la
--        adopcion exista — se conserva completa, no solo el auth.uid().
--      - messages: condicion vigente desde 0022 (from_user + cuenta borrada +
--        hay_bloqueo_con), verbatim.

drop policy if exists "crear mis reportes" on public.pets;
create policy "crear mis reportes" on public.pets for insert to authenticated
  with check (auth.uid() = user_id and not public.estoy_suspendido());

drop policy if exists "crear mis adopciones" on public.adoptions;
create policy "crear mis adopciones" on public.adoptions for insert to authenticated
  with check (auth.uid() = user_id and not public.estoy_suspendido());

drop policy if exists "crear mis pistas" on public.pet_tips;
create policy "crear mis pistas" on public.pet_tips for insert to authenticated
  with check (auth.uid() = user_id and not public.estoy_suspendido());

drop policy if exists "crear mis avistamientos" on public.sightings;
create policy "crear mis avistamientos" on public.sightings for insert to authenticated
  with check (auth.uid() = user_id and not public.estoy_suspendido());

drop policy if exists "preguntar" on public.adoption_questions;
create policy "preguntar" on public.adoption_questions for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.adoptions a where a.id = adoption_id)
    and not public.estoy_suspendido()
  );

drop policy if exists "enviar mensajes como yo" on public.messages;
create policy "enviar mensajes como yo" on public.messages for insert to authenticated
  with check (
    auth.uid() = from_user
    and not exists (
      select 1 from public.profiles p
       where p.id = messages.to_user and p.eliminado_en is not null
    )
    and not public.hay_bloqueo_con(messages.to_user)
    and not public.estoy_suspendido()
  );

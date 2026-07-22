-- IMPACTO DE LA COMUNIDAD
-- RPC publica (security definer) con conteos agregados globales para una
-- tarjeta en Inicio: reencuentros, mascotas buscando, adopciones y aportes
-- de vecinos (avistamientos + pistas). Sin datos personales, visible para
-- invitados y autenticados por igual.
create or replace function public.impacto_comunidad()
returns table (reencuentros bigint, buscando bigint, adopciones bigint, aportes bigint)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    (select count(*) from public.pets where reunida_en is not null and oculto = false),
    (select count(*) from public.pets where activo = true and oculto = false),
    (select count(*) from public.adoptions where adoptada_en is not null),
    (select (select count(*) from public.sightings) + (select count(*) from public.pet_tips));
$$;
revoke all on function public.impacto_comunidad() from public;
grant execute on function public.impacto_comunidad() to anon, authenticated;

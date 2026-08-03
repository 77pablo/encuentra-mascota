-- 0059: interruptor "mostrar mi red social en mi perfil público" (tanda 13).
--
-- APLICAR ANTES DEL DEPLOY WEB (F8, revisión adversarial final): `updateMyProfile`
-- manda `mostrar_red_social` en el `update` de perfil. Con la web nueva arriba
-- y esta migración sin aplicar, PostgREST rechaza el UPDATE ENTERO (columna
-- inexistente), no solo el campo nuevo: guardar el perfil se rompe para todos,
-- no solo para quien toque el interruptor.
--
-- La red social era LO ÚNICO realmente público del contacto (spec 2026-08-02):
-- el teléfono está revocado por columna desde la tanda A y el correo no existe
-- en profiles. El filtro va acá adentro y no en el cliente porque la columna
-- red_social está revocada desde la 0018: perfil_publico es el ÚNICO camino
-- por el que sale. Filtrando acá, apagarla es real incluso contra curl.

alter table public.profiles
  add column if not exists mostrar_red_social boolean not null default true;

-- El grant de UPDATE se rehace ENTERO (mismo criterio fail-closed de la 0057).
-- ADVERTENCIA heredada de la 0057: toda columna editable nueva se suma acá o
-- guardar el perfil falla con 42501. El guardián de __tests__/db ahora lee el
-- ÚLTIMO grant del directorio (ver tarea B2), así que este es el vigente.
revoke update on public.profiles from public, anon, authenticated;
grant update (nombre, foto_perfil, telefono, red_social, mostrar_red_social)
  on public.profiles to authenticated;

-- perfil_publico: MISMA firma que la 0058 (create or replace), cuerpo copiado
-- VERBATIM de 0058:140-193 con UN cambio: red_social sale filtrada.
create or replace function public.perfil_publico(p_user_id uuid)
returns table (
  id uuid, nombre text, foto_perfil text, red_social text, creado_en timestamptz,
  reencuentros bigint, reportes bigint, aportes bigint, adopciones bigint,
  institucion_tipo text, institucion_nombre text, institucion_comuna text,
  institucion_contacto text, institucion_verificada_en timestamptz
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    p.id, p.nombre, p.foto_perfil,
    case when p.mostrar_red_social then p.red_social else null end,
    p.creado_en,
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.reunida_en is not null and pe.oculto = false),
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.oculto = false),
    (select count(*) from public.sightings s where s.user_id = p.id)
      + (select count(*) from public.pet_tips t where t.user_id = p.id),
    (select count(*) from public.adoptions ad
       where ad.user_id = p.id and ad.activo = true and ad.oculto = false
         and ad.adoptada_en is null
         -- IDENTICA a la de `buscar_adopciones` (0052) y a la de la 0053.
         and coalesce(ad.renovado_en, ad.creado_en) >= now() - interval '90 days'),
    i.institucion_tipo, i.institucion_nombre, i.institucion_comuna,
    i.institucion_contacto, i.institucion_verificada_en
  from public.profiles p
  left join lateral public._insignia_publica(p.id) i on true
  where p.id = p_user_id
    and p.eliminado_en is null;
$$;

revoke all on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to anon;
grant execute on function public.perfil_publico(uuid) to authenticated;

-- mi_perfil: cambia el tipo de retorno -> drop + create + re-grant (misma
-- trampa documentada en la 0024: create or replace no puede cambiar el returns).
drop function public.mi_perfil();
create function public.mi_perfil()
returns table (
  id uuid, nombre text, foto_perfil text, telefono text, red_social text,
  fecha_nacimiento date, creado_en timestamptz, es_admin boolean,
  institucion_tipo text, institucion_nombre text, institucion_comuna text,
  institucion_contacto text, institucion_verificada_en timestamptz,
  mostrar_red_social boolean
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select p.id, p.nombre, p.foto_perfil, p.telefono, p.red_social,
         p.fecha_nacimiento, p.creado_en, p.es_admin,
         p.institucion_tipo, p.institucion_nombre, p.institucion_comuna,
         p.institucion_contacto, p.institucion_verificada_en,
         p.mostrar_red_social
  from public.profiles p
  where p.id = auth.uid()
$$;
revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;

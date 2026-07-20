-- ============================================================
-- PERFIL PÚBLICO (Tanda 2)
--
-- Deja que cualquiera (incluido el invitado) vea el perfil de otra persona:
-- nombre, foto, antigüedad, red social (link) y estadísticas de comunidad.
-- El TELÉFONO nunca se expone -- coherente con 0018.
-- ============================================================

-- La funcion recibe un `user_id` a proposito: la info que devuelve es PUBLICA,
-- a diferencia de `mi_perfil()` (que no recibe parametros porque el telefono es
-- privado). Es `security definer` para poder contar filas de `pets`, `sightings`
-- y `pet_tips` salteando la RLS, pero SOLO devuelve columnas seguras: el telefono
-- no aparece en la lista de retorno, asi que no hay forma de sacarlo por aca,
-- aunque el llamador pase cualquier user_id.
--
-- `drop` primero: `create or replace` NO puede cambiar el tipo de retorno de una
-- funcion (ya nos paso en 0017/0018). Sin esto, reaplicar con otra firma falla.
drop function if exists public.perfil_publico(uuid);

create function public.perfil_publico(p_user_id uuid)
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  red_social text,
  creado_en timestamptz,
  reencuentros bigint,
  reportes bigint,
  aportes bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.id, p.nombre, p.foto_perfil, p.red_social, p.creado_en,
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.reunida_en is not null and pe.oculto = false),
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.oculto = false),
    (select count(*) from public.sightings s where s.user_id = p.id)
      + (select count(*) from public.pet_tips t where t.user_id = p.id)
  from public.profiles p
  where p.id = p_user_id
    -- Las cuentas borradas (lapidas) no exponen perfil publico -> cero filas.
    and p.eliminado_en is null;
$$;

revoke all on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Politica aditiva: el invitado tambien ve los REENCUENTROS.
--
-- La RLS de `pets` para `anon` (0004) solo deja leer `activo = true`. Los
-- reportes reunidos tienen `activo = false`, asi que un invitado no los podia
-- leer: la seccion "Reencuentros" del perfil (y la tira "Finales felices" de
-- Inicio) le salian vacias. Esta politica se SUMA (las politicas se combinan con
-- OR) y deja leer los reencuentros -- que son informacion para celebrarse en
-- publico y no agregan ningun campo sensible nuevo. Un reporte cerrado SIN
-- reencuentro (activo=false, reunida_en null) sigue oculto al invitado.
drop policy if exists "reencuentros visibles publicamente" on public.pets;
create policy "reencuentros visibles publicamente"
  on public.pets for select to anon
  using (activo = false and reunida_en is not null and oculto = false);

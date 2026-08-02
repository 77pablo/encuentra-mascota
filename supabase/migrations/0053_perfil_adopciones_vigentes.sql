-- ============================================================
-- 0053 — el perfil publico cuenta las adopciones que se PUEDEN VER
--
-- Que arregla: la 0052 sumo la cuenta de adopciones al perfil publico y, en su
-- MISMA migracion, le puso vigencia al feed (auto-archivado perezoso a los 90
-- dias). Las dos mitades quedaron contando cosas distintas:
--
--   · `buscar_adopciones` excluye lo que nadie renovo en 90 dias;
--   · `perfil_publico` las contaba todas.
--
-- El caso real: un refugio publica 40 animales en enero y no renueva. En mayo
-- su perfil dice "40 · En adopcion" y el feed de Adopcion no muestra ninguna.
-- El visitante toca la baldosa, va a Adopcion y no encuentra nada de esa
-- persona. Es exactamente el problema de "dos piezas con dos numeros" que ya
-- nos paso con el radio de busqueda.
--
-- El comentario de la propia 0052 afirmaba "lo que dice el numero es
-- exactamente lo que un visitante puede llegar a ver", y dejo de ser cierto en
-- una linea posterior de esa misma migracion.
--
-- ADITIVA Y SEGURA: solo recrea una funcion, con el MISMO tipo de retorno (asi
-- que `create or replace` alcanza y no hace falta drop). No toca tablas,
-- policies ni datos, y se puede aplicar en cualquier momento.
--
-- SE PARTE DE LA VERSION DE LA 0052, que es la mas nueva: es la que sumo la
-- columna `adopciones`. Recrear desde la 0019 la borraria sin que nada se
-- pusiera rojo — paso tal cual con `buscar_reportes` en una tanda anterior.
-- El unico cambio respecto de la 0052 es la condicion de vigencia marcada
-- abajo.
-- ============================================================

create or replace function public.perfil_publico(p_user_id uuid)
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  red_social text,
  creado_en timestamptz,
  reencuentros bigint,
  reportes bigint,
  aportes bigint,
  adopciones bigint
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
      + (select count(*) from public.pet_tips t where t.user_id = p.id),
    (select count(*) from public.adoptions ad
       where ad.user_id = p.id and ad.activo = true and ad.oculto = false
         and ad.adoptada_en is null
         -- LA UNICA LINEA NUEVA respecto de la 0052, y tiene que ser IDENTICA a
         -- la de `buscar_adopciones` (0052): mismo `coalesce`, mismo intervalo.
         -- Si una de las dos cambia sin la otra, el numero del perfil vuelve a
         -- prometer publicaciones que el feed no muestra. Hay un test que
         -- compara las dos expresiones entre si.
         and coalesce(ad.renovado_en, ad.creado_en) >= now() - interval '90 days')
  from public.profiles p
  where p.id = p_user_id
    -- Las cuentas borradas (lapidas) no exponen perfil publico -> cero filas.
    and p.eliminado_en is null;
$$;

revoke all on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to anon;
grant execute on function public.perfil_publico(uuid) to authenticated;

-- CICLO DE VIDA DEL REPORTE (Función 3)
--
-- Lo que envenena estas apps son los reportes viejos que nadie actualizó: el
-- mapa se llena de casos que quizás ya se resolvieron y deja de sentirse
-- confiable. Solución sin cron y sin perder nada:
--
--  1. Columna `renovado_en`: última vez que el dueño confirmó que el reporte
--     sigue vigente (o la creación). El dueño la reinicia en un toque.
--  2. Auto-archivado PEREZOSO: `buscar_reportes` deja de mostrar los reportes
--     no renovados en 45 días. No hace falta cron: simplemente dejan de aparecer.
--     No se borra nada; el dueño los reactiva desde "Mis reportes".
--
-- IMPORTANTE — por qué NO se reusa `activo` ni `oculto`:
--   `activo=false` significa "reunida/cerrada" (lo cuenta countReunidas y las
--   "Finales felices"); `oculto` es moderación. Archivar por inactividad es un
--   tercer concepto, así que va en su propia columna `renovado_en`.

-- ---------------------------------------------------------------------------
-- 1. Columna `renovado_en` + backfill
-- ---------------------------------------------------------------------------
-- default now() para los reportes nuevos. Los viejos (renovado_en null tras el
-- add) se anclan a su fecha de creación, para que el reloj de 45 días empiece
-- desde que se publicaron y no desde la migración.
alter table public.pets
  add column if not exists renovado_en timestamptz default now();

update public.pets set renovado_en = creado_en where renovado_en is null;

-- ---------------------------------------------------------------------------
-- 2. `buscar_reportes` recreada: excluye los vencidos + devuelve `renovado_en`
-- ---------------------------------------------------------------------------
-- Se parte de la versión de la 0021 (feed por comuna), que a su vez conserva
-- VERBATIM el arreglo del cursor de la 0015 (la distancia redondeada a numeric
-- con 6 decimales, calculada una sola vez en la CTE `calc`, y la comparación
-- del cursor sobre ese mismo valor redondeado). Esta migración agrega SOLO:
--   (a) la condición de vencimiento en el WHERE de `calc`, y
--   (b) la columna `renovado_en` al retorno.
-- Como cambia el TIPO DE RETORNO (columna nueva), `create or replace` no
-- alcanza: hay que dropear la firma exacta vieja (14 params, la de la 0021) y
-- recrear. El default null de `p_comuna` mantiene compatibles a los llamadores.
drop function if exists public.buscar_reportes(
  double precision, double precision, double precision, text, text, text,
  boolean, timestamptz, text, timestamptz, uuid, double precision, int, text
);

create function public.buscar_reportes(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radio_km double precision default null,
  p_estado text default null,
  p_especie text default null,
  p_texto text default null,
  p_con_recompensa boolean default false,
  p_desde timestamptz default null,
  p_orden text default 'recientes',
  p_cursor_fecha timestamptz default null,
  p_cursor_id uuid default null,
  p_cursor_dist double precision default null,
  p_limite int default 20,
  p_comuna text default null
)
returns table (
  id uuid,
  user_id uuid,
  estado pet_estado,
  especie pet_especie,
  raza text,
  nombre text,
  descripcion text,
  fotos text[],
  lat double precision,
  lng double precision,
  recompensa text,
  activo boolean,
  oculto boolean,
  creado_en timestamptz,
  reunida_en timestamptz,
  final_feliz text,
  final_foto text,
  renovado_en timestamptz,
  distancia_km double precision
)
language sql
stable
as $$
  with centro as (
    select case
      when p_lat is null or p_lng is null then null
      else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    end as punto
  ),
  calc as (
    select
      p.id, p.user_id, p.estado, p.especie, p.raza, p.nombre, p.descripcion,
      p.fotos, p.lat, p.lng, p.recompensa, p.activo, p.oculto, p.creado_en,
      p.reunida_en, p.final_feliz, p.final_foto, p.renovado_en,
      case when c.punto is null then null
           else round((st_distance(p.ubicacion, c.punto) / 1000.0)::numeric, 6)
      end as dist
    from public.pets p, centro c
    where p.activo = true
      and p.oculto = false
      and (c.punto is null or p_radio_km is null
           or st_dwithin(p.ubicacion, c.punto, p_radio_km * 1000))
      and (p_estado is null or p.estado::text = p_estado)
      and (p_especie is null or p.especie::text = p_especie)
      and (p_con_recompensa is not true or coalesce(trim(p.recompensa), '') <> '')
      and (p_desde is null or p.creado_en >= p_desde)
      and (p_texto is null or trim(p_texto) = '' or
           (coalesce(p.nombre, '') || ' ' || coalesce(p.raza, '') || ' ' || p.descripcion)
             ilike '%' || trim(p_texto) || '%')
      and (p_comuna is null or p.comuna = p_comuna or p_comuna = any(p.comunas_alcance))
      -- NUEVO (0028): auto-archivado perezoso. Un reporte no renovado en 45 días
      -- sale de las búsquedas. coalesce por si algún reporte quedara sin backfill.
      and coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'
  )
  select
    calc.id, calc.user_id, calc.estado, calc.especie, calc.raza, calc.nombre,
    calc.descripcion, calc.fotos, calc.lat, calc.lng, calc.recompensa,
    calc.activo, calc.oculto, calc.creado_en, calc.reunida_en,
    calc.final_feliz, calc.final_foto, calc.renovado_en,
    calc.dist::double precision as distancia_km
  from calc
  where
    case
      when p_orden = 'cerca' and calc.dist is not null then
        p_cursor_dist is null
        or (calc.dist, calc.id) > (round(p_cursor_dist::numeric, 6), p_cursor_id)
      else
        p_cursor_fecha is null
        or (calc.creado_en, calc.id) < (p_cursor_fecha, p_cursor_id)
    end
  order by
    case when p_orden = 'cerca' then calc.dist end asc nulls last,
    case when p_orden = 'cerca' then calc.id end asc nulls last,
    case when p_orden = 'cerca' then null else calc.creado_en end desc nulls last,
    case when p_orden = 'cerca' then null else calc.id end desc nulls last
  limit least(coalesce(p_limite, 20), 100);
$$;

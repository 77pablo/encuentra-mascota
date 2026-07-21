-- FEED POR COMUNA (Tanda 3, Fase 2)
--
-- Extiende `buscar_reportes` con un filtro opcional por comuna. Cuando `p_comuna`
-- viene, se muestran los reportes cuya comuna "casa" es esa O que la tienen en su
-- alcance (comunas vecinas que el autor sumó). Con `p_comuna` nulo, se comporta
-- exactamente como antes.
--
-- Se agrega SOLO una condición al WHERE; la lógica de cursor/orden (arreglada en
-- 0015) NO se toca. Como agregar un parámetro cambia la firma, hay que dropear la
-- firma exacta vieja (13 params) y recrear con la nueva (misma lección que
-- 0017/0018). El default null mantiene compatibles a los llamadores que no pasan
-- comuna.

drop function if exists public.buscar_reportes(
  double precision, double precision, double precision, text, text, text,
  boolean, timestamptz, text, timestamptz, uuid, double precision, int
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
      p.reunida_en, p.final_feliz, p.final_foto,
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
      -- NUEVO: filtro por comuna (casa o alcance). Lo único que agrega esta migración.
      and (p_comuna is null or p.comuna = p_comuna or p_comuna = any(p.comunas_alcance))
  )
  select
    calc.id, calc.user_id, calc.estado, calc.especie, calc.raza, calc.nombre,
    calc.descripcion, calc.fotos, calc.lat, calc.lng, calc.recompensa,
    calc.activo, calc.oculto, calc.creado_en, calc.reunida_en,
    calc.final_feliz, calc.final_foto,
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

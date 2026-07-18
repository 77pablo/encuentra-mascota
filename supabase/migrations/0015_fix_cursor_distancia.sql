-- FIX: la paginación por cercanía repetía una fila en el borde de cada página.
--
-- Causa: el cursor usaba la distancia como `double precision`. Esa distancia se
-- recalcula en cada consulta, viaja al cliente como JSON y vuelve; con la
-- aritmética de punto flotante, el valor que vuelve puede diferir del calculado
-- en el último bit. Cuando eso pasa, la fila del borde satisface la comparación
-- "mayor que el cursor" y aparece de nuevo en la página siguiente.
--
-- Detectado con datos reales: 31 reportes paginados de a 8 devolvían 32 filas,
-- con la distancia 13.32 km repetida entre la página 3 y la 4.
--
-- Solución: redondear a numeric con precisión fija (6 decimales de km = 1 mm)
-- TANTO al devolver el valor COMO al compararlo. Así el cursor es exacto y la
-- comparación deja de depender de los bits bajos del float.
--
-- De paso, la distancia se calcula UNA sola vez por fila (antes se computaba en
-- el select, en el where del cursor y en el order by).

create or replace function public.buscar_reportes(
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
  p_limite int default 20
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
      -- ST_DWithin va acá para que use el índice GIST.
      and (c.punto is null or p_radio_km is null
           or st_dwithin(p.ubicacion, c.punto, p_radio_km * 1000))
      and (p_estado is null or p.estado::text = p_estado)
      and (p_especie is null or p.especie::text = p_especie)
      and (p_con_recompensa is not true or coalesce(trim(p.recompensa), '') <> '')
      and (p_desde is null or p.creado_en >= p_desde)
      and (p_texto is null or trim(p_texto) = '' or
           (coalesce(p.nombre, '') || ' ' || coalesce(p.raza, '') || ' ' || p.descripcion)
             ilike '%' || trim(p_texto) || '%')
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
      -- Orden por cercanía: comparamos sobre el MISMO valor redondeado que
      -- devolvimos en la página anterior, así el borde es exacto.
      when p_orden = 'cerca' and calc.dist is not null then
        p_cursor_dist is null
        or (calc.dist, calc.id) > (round(p_cursor_dist::numeric, 6), p_cursor_id)
      else
        p_cursor_fecha is null
        or (calc.creado_en, calc.id) < (p_cursor_fecha, p_cursor_id)
    end
  -- El desempate por id TIENE que ir en la misma dirección que la comparación
  -- del cursor, o se saltan filas: 'cerca' compara con `>` (ascendente) y
  -- 'recientes' con `<` (descendente). Tenerlos cruzados es un bug silencioso.
  order by
    case when p_orden = 'cerca' then calc.dist end asc nulls last,
    case when p_orden = 'cerca' then calc.id end asc nulls last,
    case when p_orden = 'cerca' then null else calc.creado_en end desc nulls last,
    case when p_orden = 'cerca' then null else calc.id end desc nulls last
  limit least(coalesce(p_limite, 20), 100);
$$;

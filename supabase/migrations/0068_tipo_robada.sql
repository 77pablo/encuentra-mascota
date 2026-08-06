-- 0068 — TIPO "ROBADA": una marca, no un estado nuevo.
--
-- POR QUÉ MARCA Y NO ESTADO. `pets.estado` es un enum `pet_estado` con dos
-- valores, y ~25 lugares del cliente asumen lo binario (`estado === 'perdida'
-- ? lost : found`, `estado !== 'perdida'` como guarda). Un tercer valor de enum
-- rompería todos esos ternarios en silencio: una robada se pintaría
-- "Encontrada". Una mascota robada SIGUE siendo `estado='perdida'` para
-- buscador, matching, plan y colores; lo único distinto es la etiqueta y la
-- guía. Por eso: columna booleana, aditiva, que degrada (reportes viejos
-- = false).
alter table public.pets add column if not exists robada boolean not null default false;

-- ───────────────────────────────────────────────────────────────────────────
-- Recrear buscar_reportes para que el FEED pueda pintar el badge "ROBADA".
--
-- ⚠️ ESTE CUERPO SE COPIÓ DEL CUERPO VIVO DE LA BASE (pg_get_functiondef,
-- 6-ago-2026), NO de la 0028. La versión viva tiene DIECISÉIS parámetros —los
-- dos últimos, `p_color`/`p_tamano`, los agregó la tanda de señas (0054/0055)—
-- y dos condiciones WHERE que la 0028 no tiene. Recrear desde la 0028 habría
-- revertido el filtro de señas en silencio (el bug clásico de este repo:
-- recrear una función desde una migración vieja en vez de su cuerpo vivo).
--
-- El ÚNICO cambio respecto del cuerpo vivo es la lista de COLUMNAS: `robada`
-- en el RETURNS, `p.robada` en el select de `calc`, `calc.robada` en el select
-- final. El WHERE, el cursor y el order by van VERBATIM: ahí vivían los bugs
-- históricos de paginación y no se tocan. La firma de parámetros tampoco cambia
-- (robada no es filtro, es una columna que se devuelve).
drop function if exists public.buscar_reportes(
  double precision, double precision, double precision, text, text, text,
  boolean, timestamptz, text, timestamptz, uuid, double precision, int, text,
  text, text
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
  p_comuna text default null,
  p_color text default null,
  p_tamano text default null
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
  robada boolean,
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
      p.reunida_en, p.final_feliz, p.final_foto, p.renovado_en, p.robada,
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
      and coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'
      -- NUEVO (0054). Opcionales: un reporte viejo sin señas sigue apareciendo
      -- en la búsqueda de siempre. Solo se filtra a quien pidió el filtro, y ahí
      -- sí desaparecen los reportes sin el dato — es lo que la persona pidió.
      and (p_color is null or p.colores @> array[p_color]::text[])
      and (p_tamano is null or p.tamano = p_tamano)
  )
  select
    calc.id, calc.user_id, calc.estado, calc.especie, calc.raza, calc.nombre,
    calc.descripcion, calc.fotos, calc.lat, calc.lng, calc.recompensa,
    calc.activo, calc.oculto, calc.creado_en, calc.reunida_en,
    calc.final_feliz, calc.final_foto, calc.renovado_en, calc.robada,
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

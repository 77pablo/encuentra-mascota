-- ============================================================
-- FILTRO POR COMUNA EN ADOPCION (F5)
--
-- `adoptions.comuna` ya existe (0030) y `buscar_adopciones` ya la devuelve;
-- faltaba poder FILTRAR por ella. Ver docs/superpowers/specs/
-- 2026-07-22-tanda-6funciones-pulido-design.md, seccion "F5".
--
-- `drop function` con la firma COMPLETA antes del `create`: agregar un
-- parametro nuevo sin dropear primero crea una SOBRECARGA (misma funcion, dos
-- firmas) y PostgREST falla por ambiguedad al resolver cual invocar.
--
-- El cuerpo de abajo es una COPIA VERBATIM del de la 0030, con dos unicos
-- cambios: el parametro `p_comuna` (agregado DESPUES de `p_tamano`, con
-- default null para no romper a quien llama sin ese argumento — via
-- `supabase.rpc` los parametros van por nombre, asi que la posicion no rompe
-- a los llamadores existentes) y la condicion
-- `and (p_comuna is null or a.comuna = p_comuna)` junto a los demas filtros de
-- la CTE `calc`. El arreglo del cursor (0015/0028: `round(::numeric, 6)` +
-- desempate) queda intacto, ni una coma tocada.
-- ============================================================

drop function public.buscar_adopciones(text, text, double precision, double precision, double precision, text, timestamptz, uuid, double precision, int);

create function public.buscar_adopciones(
  p_especie text default null,
  p_tamano text default null,
  p_comuna text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radio_km double precision default null,
  p_orden text default 'recientes',            -- 'recientes' | 'cerca'
  p_cursor_fecha timestamptz default null,
  p_cursor_id uuid default null,
  p_cursor_dist double precision default null,
  p_limite int default 20
)
returns table (
  id uuid,
  user_id uuid,
  especie pet_especie,
  nombre text,
  descripcion text,
  fotos text[],
  lat double precision,
  lng double precision,
  comuna text,
  edad text,
  tamano text,
  esterilizado text,
  vacunas text,
  convive_ninos text,
  convive_perros text,
  convive_gatos text,
  requisitos text,
  creado_en timestamptz,
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
      a.id, a.user_id, a.especie, a.nombre, a.descripcion, a.fotos,
      a.lat, a.lng, a.comuna, a.edad, a.tamano, a.esterilizado, a.vacunas,
      a.convive_ninos, a.convive_perros, a.convive_gatos, a.requisitos,
      a.creado_en,
      case when c.punto is null then null
           else round((st_distance(a.ubicacion, c.punto) / 1000.0)::numeric, 6)
      end as dist
    from public.adoptions a, centro c
    where a.activo = true
      and a.oculto = false
      and a.adoptada_en is null
      -- Radio: ST_DWithin usa el indice GIST; recibe metros.
      and (c.punto is null or p_radio_km is null
           or st_dwithin(a.ubicacion, c.punto, p_radio_km * 1000))
      and (p_especie is null or a.especie::text = p_especie)
      and (p_tamano is null or a.tamano = p_tamano)
      and (p_comuna is null or a.comuna = p_comuna)
  )
  select
    calc.id, calc.user_id, calc.especie, calc.nombre, calc.descripcion,
    calc.fotos, calc.lat, calc.lng, calc.comuna, calc.edad, calc.tamano,
    calc.esterilizado, calc.vacunas, calc.convive_ninos, calc.convive_perros,
    calc.convive_gatos, calc.requisitos, calc.creado_en,
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
  limit least(coalesce(p_limite, 20), 100);   -- techo duro: nadie pide 10.000 de una
$$;

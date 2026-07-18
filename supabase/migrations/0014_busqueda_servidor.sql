-- BÚSQUEDA EN EL SERVIDOR
--
-- Problema que resuelve: hasta ahora la app se traía TODOS los reportes activos
-- al teléfono (`select * from pets where activo`) y filtraba, buscaba y ordenaba
-- por distancia en memoria del cliente. Con 200 reportes anda; con 50.000
-- descarga decenas de megas y se congela antes de dibujar nada.
--
-- A partir de acá el trabajo lo hace Postgres y el cliente recibe una página.

-- ---------------------------------------------------------------------------
-- 1. Extensiones
-- ---------------------------------------------------------------------------
-- PostGIS: búsquedas por radio exactas y con índice de verdad.
create extension if not exists postgis;
-- pg_trgm: búsqueda por texto parcial ("pelu" encuentra "Pelusa") con índice.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. Columna geográfica
-- ---------------------------------------------------------------------------
-- Generada a partir de lat/lng, así no hay que mantenerla ni puede quedar
-- desincronizada: Postgres la recalcula sola en cada insert/update.
-- Ojo con el orden: ST_MakePoint recibe (lng, lat), no (lat, lng).
alter table public.pets
  add column if not exists ubicacion geography(Point, 4326)
  generated always as (
    st_setsrid(st_makepoint(lng, lat), 4326)::geography
  ) stored;

-- El índice que hace rápida la búsqueda por radio. El btree de (lat, lng) que
-- ya existía NO sirve para esto: un btree no sabe ordenar por cercanía.
create index if not exists pets_ubicacion_idx on public.pets using gist (ubicacion);

-- Índice para la búsqueda por texto sobre los tres campos juntos.
create index if not exists pets_texto_idx on public.pets using gin (
  (coalesce(nombre, '') || ' ' || coalesce(raza, '') || ' ' || descripcion) gin_trgm_ops
);

-- Índice compuesto para el orden por defecto (más recientes primero) sobre los
-- reportes visibles, que es la consulta más frecuente de toda la app.
create index if not exists pets_visibles_recientes_idx
  on public.pets (creado_en desc, id desc)
  where activo = true and oculto = false;

-- ---------------------------------------------------------------------------
-- 3. La función de búsqueda
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (el default): la función corre con los permisos de quien la
-- llama, así que las políticas RLS de `pets` se siguen aplicando. Un invitado ve
-- solo los reportes activos y no ocultos, igual que antes.
--
-- Paginación por CURSOR, no por OFFSET: con offset, si alguien publica un
-- reporte mientras estás scrolleando, se te repiten o se te saltan filas. El
-- cursor apunta a "el último que ya viste" y es estable.
create or replace function public.buscar_reportes(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radio_km double precision default null,
  p_estado text default null,
  p_especie text default null,
  p_texto text default null,
  p_con_recompensa boolean default false,
  p_desde timestamptz default null,
  p_orden text default 'recientes',           -- 'recientes' | 'cerca'
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
  )
  select
    p.id, p.user_id, p.estado, p.especie, p.raza, p.nombre, p.descripcion,
    p.fotos, p.lat, p.lng, p.recompensa, p.activo, p.oculto, p.creado_en,
    p.reunida_en, p.final_feliz, p.final_foto,
    case when c.punto is null then null
         else st_distance(p.ubicacion, c.punto) / 1000.0
    end as distancia_km
  from public.pets p, centro c
  where p.activo = true
    and p.oculto = false
    -- Radio: ST_DWithin usa el índice GIST; recibe metros.
    and (c.punto is null or p_radio_km is null
         or st_dwithin(p.ubicacion, c.punto, p_radio_km * 1000))
    and (p_estado is null or p.estado::text = p_estado)
    and (p_especie is null or p.especie::text = p_especie)
    and (p_con_recompensa is not true or coalesce(trim(p.recompensa), '') <> '')
    and (p_desde is null or p.creado_en >= p_desde)
    and (p_texto is null or trim(p_texto) = '' or
         (coalesce(p.nombre, '') || ' ' || coalesce(p.raza, '') || ' ' || p.descripcion)
           ilike '%' || trim(p_texto) || '%')
    -- Cursor. Cada orden tiene su desempate por id, para que nunca haya empates
    -- ambiguos entre dos filas con la misma fecha o la misma distancia.
    and (
      case
        when p_orden = 'cerca' then
          p_cursor_dist is null or c.punto is null or
          (st_distance(p.ubicacion, c.punto) / 1000.0, p.id) > (p_cursor_dist, p_cursor_id)
        else
          p_cursor_fecha is null or
          (p.creado_en, p.id) < (p_cursor_fecha, p_cursor_id)
      end
    )
  order by
    case when p_orden = 'cerca' and c.punto is not null
         then st_distance(p.ubicacion, c.punto) end asc nulls last,
    case when p_orden = 'cerca' then null else p.creado_en end desc nulls last,
    p.id desc
  limit least(coalesce(p_limite, 20), 100);   -- techo duro: nadie pide 10.000 de una
$$;

-- ---------------------------------------------------------------------------
-- 4. Coincidencias perdido ↔ encontrado
-- ---------------------------------------------------------------------------
-- Antes se calculaban en el cliente sobre TODOS los reportes. Ahora las resuelve
-- la base: estado opuesto, especie compatible ('otro' es comodín), dentro del
-- radio y ordenadas por cercanía.
create or replace function public.buscar_coincidencias(
  p_pet_id uuid,
  p_radio_km double precision default 15,
  p_limite int default 10
)
returns table (
  id uuid,
  estado pet_estado,
  especie pet_especie,
  nombre text,
  descripcion text,
  fotos text[],
  lat double precision,
  lng double precision,
  creado_en timestamptz,
  distancia_km double precision
)
language sql
stable
as $$
  with base as (
    select p.id, p.estado, p.especie, p.ubicacion
    from public.pets p
    where p.id = p_pet_id
  )
  select
    p.id, p.estado, p.especie, p.nombre, p.descripcion, p.fotos,
    p.lat, p.lng, p.creado_en,
    st_distance(p.ubicacion, b.ubicacion) / 1000.0 as distancia_km
  from public.pets p, base b
  where p.id <> b.id
    and p.activo = true
    and p.oculto = false
    and p.reunida_en is null
    -- Estado opuesto: a un perdido le sugerimos encontrados, y viceversa.
    and p.estado <> b.estado
    -- Especie compatible: 'otro' hace de comodín en cualquiera de los dos lados.
    and (p.especie = b.especie or p.especie = 'otro' or b.especie = 'otro')
    and st_dwithin(p.ubicacion, b.ubicacion, p_radio_km * 1000)
  order by st_distance(p.ubicacion, b.ubicacion) asc, p.id
  limit least(coalesce(p_limite, 10), 50);
$$;

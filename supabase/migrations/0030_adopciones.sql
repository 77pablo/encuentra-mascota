-- ============================================================
-- APARTADO DE ADOPCION — FUNDACION (Tarea 1)
--
-- Feed tipo Instagram de mascotas en adopcion, en su propia tabla (NO un
-- tercer estado de `pets`, para no mezclarlo con perdida/encontrada). Ver
-- docs/superpowers/specs/2026-07-21-adopcion-design.md, seccion "Migracion 0030".
--
-- Esta migracion entrega:
--   1. Tabla `adoptions` (con CHECKs de tri-estado/longitud/cantidad de
--      fotos, columna `ubicacion` geography generada + indice GIST, indice
--      parcial de activas recientes) + RLS.
--   2. `messages.adoption_id` (el chat se generaliza para poder hablar de
--      una adopcion ademas de un reporte) + indice.
--   3. Tabla `adoption_saves` (el corazon/guardado, paralela a `favorites`
--      para no acoplar ni volver polimorfico lo existente).
--   4. RPC `buscar_adopciones` — espejo simplificado de `buscar_reportes`
--      (0028), con el MISMO arreglo del cursor de distancia (redondeo a
--      numeric en el calculo y en la comparacion).
--   5. Ampliar el CHECK de `denuncias.tipo` (0025) con 'adopcion'.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA adoptions
-- ------------------------------------------------------------
create table public.adoptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  especie       pet_especie not null,          -- reusa el enum de 0001
  nombre        text,                           -- opcional
  descripcion   text not null,
  fotos         text[] not null default '{}',   -- 1..4, ver CHECK abajo
  lat           double precision not null,      -- punto DIFUMINADO (se aplica en el cliente, createAdoption)
  lng           double precision not null,
  comuna        text,
  -- Extras, todos opcionales. Tri-estado 'si'|'no'|'no_se' donde aplica.
  -- Valores EXACTOS del spec, verbatim.
  edad          text check (edad in ('cachorro', 'adulto', 'senior') or edad is null),
  tamano        text check (tamano in ('chico', 'mediano', 'grande') or tamano is null),
  esterilizado  text check (esterilizado in ('si', 'no', 'no_se') or esterilizado is null),
  vacunas       text check (vacunas in ('al_dia', 'no', 'no_se') or vacunas is null),
  convive_ninos text check (convive_ninos in ('si', 'no', 'no_se') or convive_ninos is null),
  convive_perros text check (convive_perros in ('si', 'no', 'no_se') or convive_perros is null),
  convive_gatos text check (convive_gatos in ('si', 'no', 'no_se') or convive_gatos is null),
  requisitos    text,                            -- opcional, corto
  activo        boolean not null default true,
  adoptada_en   timestamptz,                     -- final feliz
  oculto        boolean not null default false,  -- moderacion (paridad con pets)
  creado_en     timestamptz not null default now(),

  -- Longitud/rango/cantidad — mismos numeros que `pets` donde aplica
  -- (0016_validacion_servidor.sql). La API es publica (anon key): la base
  -- repite los limites del formulario para que solo los toque quien escriba
  -- por fuera de la app.
  constraint adoptions_descripcion_largo
    check (length(btrim(descripcion)) between 1 and 1000),
  constraint adoptions_nombre_largo
    check (nombre is null or length(nombre) <= 60),
  -- No hay numero de referencia en `pets` para "requisitos" (campo nuevo de
  -- este apartado); 500 sigue el mismo orden de magnitud que otros campos
  -- cortos del proyecto (sightings.nota, pet_tips.texto).
  constraint adoptions_requisitos_largo
    check (requisitos is null or length(requisitos) <= 500),
  constraint adoptions_lat_rango check (lat between -90 and 90),
  constraint adoptions_lng_rango check (lng between -180 and 180),
  -- A diferencia de `pets` (que solo topea el MAXIMO de fotos), acá el spec
  -- pide explicitamente "1..4": se exige al menos una foto tambien en el
  -- servidor, no solo en el formulario.
  constraint adoptions_fotos_cantidad
    check (coalesce(array_length(fotos, 1), 0) between 1 and 4),
  constraint adoptions_fotos_largo
    check (length(array_to_string(fotos, ',')) <= 2000)
);

alter table public.adoptions enable row level security;

-- RLS: lectura publica de SOLO las adopciones activas/no ocultas/no
-- adoptadas (invitado incluido — hay ruta publica /adopcion/:id, "modo
-- invitado"), MAS las propias filas del dueno aunque esten inactivas,
-- ocultas o ya adoptadas (para "Mis adopciones"). `using (true)` exponia por
-- la API REST de PostgREST filas ocultadas por moderacion, inactivas y ya
-- adoptadas a `anon` y a cualquier `authenticated` — exactamente lo que
-- `buscar_adopciones` excluye por su cuenta, pero la tabla se puede leer
-- directo sin pasar por la RPC. Mismo patron que la publica de `pets` en
-- 0004_public_read.sql, con el agregado de `auth.uid() = user_id` porque acá
-- el propio dueno SI necesita ver sus filas ocultas/inactivas.
create policy "adopciones visibles"
  on public.adoptions for select
  using ((activo = true and oculto = false and adoptada_en is null) or auth.uid() = user_id);

create policy "crear mis adopciones"
  on public.adoptions for insert to authenticated with check (auth.uid() = user_id);
create policy "editar mis adopciones"
  on public.adoptions for update to authenticated using (auth.uid() = user_id);
create policy "borrar mis adopciones"
  on public.adoptions for delete to authenticated using (auth.uid() = user_id);

-- Columna geografica generada (igual que `pets` en 0014): Postgres la
-- recalcula sola en cada insert/update, nunca queda desincronizada. Ojo con
-- el orden: ST_MakePoint recibe (lng, lat), no (lat, lng).
alter table public.adoptions
  add column ubicacion geography(Point, 4326)
  generated always as (
    st_setsrid(st_makepoint(lng, lat), 4326)::geography
  ) stored;

-- Indice GIST para el orden por cercania (ST_DWithin/ST_Distance lo usan).
create index adoptions_ubicacion_idx on public.adoptions using gist (ubicacion);

-- Indice parcial para el orden por defecto: activas, no ocultas, no
-- adoptadas, mas recientes primero — la consulta mas frecuente del feed.
create index adoptions_visibles_recientes_idx
  on public.adoptions (creado_en desc, id desc)
  where activo = true and oculto = false and adoptada_en is null;

-- Para "Mis adopciones" (listMyAdoptions) — mismo patron que pets_user_id_idx
-- y my_pets_user_id_idx.
create index adoptions_user_id_idx on public.adoptions (user_id);

-- ------------------------------------------------------------
-- 2. messages.adoption_id — el chat se generaliza
-- ------------------------------------------------------------
-- `messages.pet_id` ya es nullable (0017: sobrevive al reporte borrado). Un
-- mensaje pertenece a UN contexto: un reporte (pet_id), una adopcion
-- (adoption_id), o un reporte ya borrado (los dos null). No se agrega un
-- CHECK de "exactamente uno" a proposito: el caso de reporte borrado deja
-- ambos en null, y un CHECK estricto lo rompería.
--
-- La RLS de `messages` (por from_user/to_user) no cambia: no mira el
-- contexto, asi que no hay nada que tocar aca.
alter table public.messages
  add column adoption_id uuid references public.adoptions(id) on delete set null;

create index messages_adoption_id_idx on public.messages (adoption_id);

-- ------------------------------------------------------------
-- 3. adoption_saves — el corazon/guardado
-- ------------------------------------------------------------
-- Tabla paralela a `favorites` (que referencia pets(id)), para no acoplar ni
-- volver polimorficos los favoritos existentes. Mismo patron que 0009.
create table public.adoption_saves (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  adoption_id  uuid not null references public.adoptions(id) on delete cascade,
  creado_en    timestamptz not null default now(),
  primary key (user_id, adoption_id)
);
alter table public.adoption_saves enable row level security;

-- Cada quien gestiona SOLO sus propios guardados (leer, crear y borrar).
create policy "gestionar mis adopciones guardadas"
  on public.adoption_saves for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index adoption_saves_user_id_idx on public.adoption_saves (user_id);

-- ------------------------------------------------------------
-- 4. RPC buscar_adopciones — espejo simplificado de buscar_reportes
-- ------------------------------------------------------------
-- SECURITY INVOKER (el default, no se declara explicito): corre con los
-- permisos de quien llama. La RLS de `adoptions` ya solo deja ver
-- activa/no-oculta/no-adoptada (mas las propias filas del dueno), asi que el
-- WHERE de abajo es un segundo filtro redundante con esa parte de la
-- politica — se deja explicito igual, por claridad y porque documenta el
-- criterio del feed independiente de como evolucione la RLS.
--
-- SIN FILTRO DE BLOQUEO: `buscar_reportes` tampoco lo aplica, y
-- `hay_bloqueo_con` es SECURITY DEFINER solo para `authenticated` (revoca
-- public/anon en la 0022) — llamarlo aca rompería el feed en modo invitado,
-- que es publico a proposito. El ocultado de contenido de usuarios
-- bloqueados se maneja fuera de la RPC (como en reportes).
--
-- CURSOR: mismo arreglo VERBATIM que `buscar_reportes` desde la 0028/0015 —
-- la distancia se calcula UNA sola vez en la CTE `calc`, redondeada a
-- `numeric` (6 decimales), y la comparacion del cursor de "cerca" usa ese
-- mismo valor redondeado (`round(p_cursor_dist::numeric, 6)`). Sin este
-- redondeo, el double precision calculado en el SELECT puede diferir en el
-- ultimo digito del que se comparo en el WHERE de la pagina siguiente (dos
-- evaluaciones de ST_Distance no siempre son bit-a-bit iguales) y se
-- repiten o se saltean filas cerca del limite de pagina.
create function public.buscar_adopciones(
  p_especie text default null,
  p_tamano text default null,
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

-- ------------------------------------------------------------
-- 5. denuncias.tipo suma 'adopcion'
-- ------------------------------------------------------------
-- La 0025 agrego la columna `tipo` con un CHECK inline via
-- `alter table ... add column ... check (...)`, sin nombrarlo: Postgres le
-- puso el nombre automatico `<tabla>_<columna>_check` (`denuncias_tipo_check`
-- de asumirse el patron estandar). Pero asumir ese nombre es fragil: si por
-- lo que sea difiere (renombrado a mano, migracion aplicada distinto, etc.),
-- un simple `drop constraint if exists denuncias_tipo_check` no borraria
-- nada y quedarian DOS CHECK sobre `tipo` — el viejo (sin 'adopcion') y el
-- nuevo — y Postgres
-- exige que TODOS los CHECK pasen, asi que 'adopcion' quedaria rechazado en
-- silencio pese a que esta migracion "corrio bien". Por eso, en vez de
-- adivinar el nombre, se recorre `pg_constraint` buscando CUALQUIER CHECK de
-- `public.denuncias` cuya definicion mencione la columna `tipo` y se borra
-- por su nombre real antes de agregar el nuevo.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.denuncias'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%tipo%'
  loop
    execute format('alter table public.denuncias drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.denuncias
  add constraint denuncias_tipo_check
  check (tipo in ('reporte', 'usuario', 'mensaje', 'pista', 'avistamiento', 'adopcion'));

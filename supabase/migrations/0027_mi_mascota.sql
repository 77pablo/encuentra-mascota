-- ============================================================
-- FICHA "MI MASCOTA" + COLLAR CON QR (Función 2 · Tanda de 4)
--
-- Dos piezas nuevas de producto:
--   1. `my_pets`: una ficha PERMANENTE de la mascota (distinta de `pets`, que
--      son reportes). Se registra una vez y sirve para pre-cargar un reporte
--      "perdida" en un toque, y para imprimir una placa de collar con QR.
--   2. Lectura pública por QR: la única vía de lectura pública es la RPC
--      `mascota_por_collar`, que FILTRA columnas y NUNCA devuelve user_id,
--      contacto, chip ni señas. La tabla en sí queda cerrada por RLS (solo dueño).
--
-- Privacidad (crítico): el contacto del dueño solo se alcanza si hay un reporte
-- perdido ACTIVO vinculado (a través de `/mascota/<id>`, que ya tiene su propio
-- flujo de contacto). El QR de una mascota que NO está perdida solo permite
-- "avisar que la vi" — sin exponer identidad ni contacto.
-- ============================================================

-- gen_random_bytes vive en pgcrypto. gen_random_uuid() ya se usa en 0001, pero
-- gen_random_bytes NO es built-in, así que lo aseguramos explícitamente.
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABLA my_pets
-- ------------------------------------------------------------
create table public.my_pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nombre text not null,
  especie pet_especie not null,            -- reusa el enum de 0001
  raza text,
  foto text,                                -- una sola; URL pública en el bucket pet-photos
  senas text,                               -- señas particulares / notas
  chip text,                                -- número de microchip, opcional
  -- Token de 128 bits generado EN EL SERVIDOR (no adivinable, mismo criterio que
  -- las rutas de foto). El `default` impide que el cliente lo fije: aunque mande
  -- un `collar_token`, PostgREST solo lo usaría si la columna lo permitiera, y la
  -- RLS + este default lo mantienen del lado del servidor.
  collar_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  creado_en timestamptz not null default now(),
  -- Límites de longitud (misma defensa que 0016: la API es pública, la base
  -- repite los topes del formulario para que solo los toque quien escriba por
  -- fuera de la app).
  constraint my_pets_nombre_largo check (length(btrim(nombre)) between 1 and 60),
  constraint my_pets_raza_largo check (raza is null or length(raza) <= 60),
  constraint my_pets_senas_largo check (senas is null or length(senas) <= 1000),
  constraint my_pets_chip_largo check (chip is null or length(chip) <= 40),
  constraint my_pets_foto_largo check (foto is null or length(foto) <= 500)
);
alter table public.my_pets enable row level security;

-- La tabla NO es pública: la lectura pública va EXCLUSIVAMENTE por la RPC de
-- abajo, que filtra columnas. Acá solo el dueño ve/edita sus fichas.
create policy "gestionar mis mascotas"
  on public.my_pets for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index my_pets_user_id_idx on public.my_pets (user_id);

-- ------------------------------------------------------------
-- VÍNCULO reporte -> ficha
--
-- Cuando se reporta una mascota como perdida DESDE la ficha, el reporte guarda
-- `origen_my_pet = <my_pet.id>`. La RPC del collar hace el join por esta columna
-- para saber si la mascota del QR tiene un reporte perdido activo. Un reporte
-- publicado a mano (sin ficha) simplemente no se vincula (queda null).
-- ------------------------------------------------------------
alter table public.pets
  add column origen_my_pet uuid references public.my_pets(id) on delete set null;

create index pets_origen_my_pet_idx on public.pets (origen_my_pet);

-- ------------------------------------------------------------
-- RPC pública mascota_por_collar(p_token)
--
-- La ÚNICA lectura pública de una ficha. Devuelve SOLO nombre, especie, foto y
-- el id del reporte perdido activo vinculado (si existe). NUNCA user_id,
-- contacto, chip ni señas: esas columnas no aparecen en la lista de retorno, así
-- que no hay forma de sacarlas por acá aunque el llamador pruebe cualquier token.
-- Token inexistente -> 0 filas (no se distingue de "no existe", a propósito).
-- ------------------------------------------------------------
create function public.mascota_por_collar(p_token text)
returns table (
  nombre text,
  especie pet_especie,
  foto text,
  reporte_perdida_id uuid
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    mp.nombre,
    mp.especie,
    mp.foto,
    (
      -- El reporte perdido, activo y no oculto vinculado a esta ficha, si lo hay.
      -- Si hay más de uno (se reportó dos veces), tomamos el más reciente.
      select pe.id
      from public.pets pe
      where pe.origen_my_pet = mp.id
        and pe.estado = 'perdida'
        and pe.activo = true
        and pe.oculto = false
      order by pe.creado_en desc
      limit 1
    ) as reporte_perdida_id
  from public.my_pets mp
  where mp.collar_token = p_token;
$$;

revoke all on function public.mascota_por_collar(text) from public;
-- Dos grants separados a propósito (mismo criterio que 0019): un statement por
-- rol es más robusto al copiar/pegar.
grant execute on function public.mascota_por_collar(text) to anon;
grant execute on function public.mascota_por_collar(text) to authenticated;

-- ------------------------------------------------------------
-- CAMBIOS A LA COLA notification_events (COMPARTIDO con la Función 1)
--
-- Aditivos y defensivos. El orquestador reconcilia el CHECK de `tipo` con la
-- 0026 en el merge; por eso acá escribimos ya la lista UNIÓN completa, para que
-- el último migración aplicada deje el estado correcto sin importar el orden.
-- ------------------------------------------------------------
-- Un escaneo de collar sin reporte activo NO tiene pet_id.
alter table public.notification_events alter column pet_id drop not null;

-- Destinatario directo para avisos dirigidos a UNA persona (no a un reporte).
alter table public.notification_events
  add column if not exists target_user_id uuid references public.profiles(id) on delete cascade;

-- CHECK de `tipo` con la lista UNIÓN (0026 agrega 'coincidencia'; nosotros
-- 'escaneo_collar'). El nombre coincide con el auto-nombre del CHECK inline de
-- 0011, así que drop+add reemplaza limpio sin importar cuál migración se aplique
-- de último.
alter table public.notification_events drop constraint if exists notification_events_tipo_check;
alter table public.notification_events
  add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo', 'avistamiento', 'pista', 'coincidencia', 'escaneo_collar'));

-- ------------------------------------------------------------
-- RPC avisar_escaneo_collar(p_token, p_nota, p_lat, p_lng)
--
-- La llama la página pública del collar cuando la mascota NO tiene reporte
-- activo y alguien toca "Avisar que la vi". Encola un aviso dirigido al DUEÑO.
--   · Resuelve la ficha por token; si no existe, retorna sin error (no filtra
--     existencia — mismo criterio de privacidad que la RPC de lectura).
--   · security definer y SOLO inserta en la cola (no lee ni devuelve nada
--     sensible). El que escanea puede ser anónimo (actor_id = null).
--   · Anti-abuso: rate-limit simple — no encola si ya hay un 'escaneo_collar'
--     para ESTA ficha en los últimos 5 minutos (evita martillar el botón).
--
-- `datos.my_pet_id` se guarda para poder aplicar el rate-limit por ficha (la
-- cola no referencia my_pets con una FK). No es sensible: es un uuid interno y
-- la tabla notification_events es invisible para la app (sin RLS pública).
-- ------------------------------------------------------------
create function public.avisar_escaneo_collar(
  p_token text,
  p_nota text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pet public.my_pets%rowtype;
begin
  select * into v_pet from public.my_pets where collar_token = p_token;
  -- Ficha inexistente: no encolamos nada y NO delatamos que no existe.
  if not found then
    return;
  end if;

  -- Rate-limit por ficha: si ya avisamos en los últimos 5 min, no repetimos.
  if exists (
    select 1 from public.notification_events ne
    where ne.tipo = 'escaneo_collar'
      and ne.datos->>'my_pet_id' = v_pet.id::text
      and ne.creado_en > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
  values (
    'escaneo_collar',
    null,
    v_pet.user_id,
    null,
    jsonb_build_object(
      'my_pet_id', v_pet.id::text,
      'nombre_mascota', v_pet.nombre,
      'nota', left(coalesce(p_nota, ''), 200),
      'lat', p_lat,
      'lng', p_lng
    )
  );
end;
$$;

revoke all on function public.avisar_escaneo_collar(text, text, double precision, double precision) from public;
grant execute on function public.avisar_escaneo_collar(text, text, double precision, double precision) to anon;
grant execute on function public.avisar_escaneo_collar(text, text, double precision, double precision) to authenticated;

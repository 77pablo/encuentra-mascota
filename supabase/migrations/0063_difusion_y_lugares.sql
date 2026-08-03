-- 0063: el tablero de "a quien le avise" y la semilla de lugares (tanda 14, area A).
--
-- POR QUE EXISTE: hay CUATRO caminos de salida hacia afuera de la app (texto a
-- WhatsApp, tarjeta PNG, afiche imprimible, placa de collar) y NINGUNO deja
-- registro. `compartirTarjeta` incluso devuelve un ResultadoCompartir que ningun
-- llamador lee. Se comparte y se olvida.
--
-- NO SE MANDA NINGUN AVISO AUTOMATICO A UN LUGAR DE LA SEMILLA. Una veterinaria
-- que nunca se registro no recibe correo ni push: la lista es una ayuda para que
-- LA PERSONA avise. Decision de Pablo (3-ago) y ademas evita el problema de spam
-- y de la Ley 21.719. El aviso automatico sigue existiendo solo para las
-- instituciones registradas de la 0057, que lo aceptaron.
--
-- MEDICION QUE ORDENO EL DISENO (Overpass, RM, 3-ago-2026): 332 veterinarias y
-- refugios; 91% con nombre, 8% con TELEFONO, 12% con algun contacto, 66% con
-- calle, y UN SOLO refugio en toda la region. Por eso la pantalla promete un
-- RECORRIDO ("estas estan cerca") y no una lista de llamados. La columna de
-- telefono no existe a proposito: prometer menos de lo que se cumple.

-- ── La semilla de lugares ────────────────────────────────────────────────
-- Foto de los datos de OSM en nuestra base. NO se consulta Overpass en vivo:
-- es lento, tiene limites de uso y no esta pensado para trafico de app.
-- Se pobla con scripts/semilla-lugares.js, no desde una migracion: los datos
-- cambian y una migracion los congelaria.
--
-- LICENCIA: los datos son de OpenStreetMap bajo ODbL, que OBLIGA a atribuir.
-- El credito va visible en la pantalla, no escondido en un about.
create table public.lugares (
  id uuid primary key default gen_random_uuid(),
  osm_tipo text not null,
  osm_id bigint not null,
  nombre text not null,
  categoria text not null,
  lat double precision not null,
  lng double precision not null,
  direccion text,
  comuna text,
  actualizado_en timestamptz not null default now(),
  -- Reimportable: volver a correr la semilla ACTUALIZA en vez de duplicar.
  unique (osm_tipo, osm_id)
);

alter table public.lugares drop constraint if exists lugares_categoria_valida;
alter table public.lugares
  add constraint lugares_categoria_valida
  check (categoria in ('veterinaria', 'refugio'));

create index lugares_punto_idx on public.lugares
  using gist ((st_setsrid(st_makepoint(lng, lat), 4326)::geography));

alter table public.lugares enable row level security;
create policy "los lugares son publicos"
  on public.lugares for select to anon, authenticated using (true);

-- Lectura para todos, escritura para NADIE desde la app: la semilla entra por
-- el script de mantenimiento (service_role). Sin esto, cualquiera podria
-- inventar una "veterinaria" y aparecer en el recorrido de un caso real.
grant select on public.lugares to anon;
grant select on public.lugares to authenticated;
revoke insert, update, delete on public.lugares from anon, authenticated;

-- ── El tablero ───────────────────────────────────────────────────────────
create table public.difusion_destinos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  tipo text not null,
  -- Un destino 'persona' guarda su texto aca y deja los dos punteros en null.
  etiqueta text,
  lugar_id uuid references public.lugares(id) on delete set null,
  institucion_id uuid references public.profiles(id) on delete set null,
  estado text not null default 'pendiente',
  avisado_en timestamptz,
  creado_en timestamptz not null default now()
);

alter table public.difusion_destinos
  add constraint difusion_destinos_tipo_valido
  check (tipo in ('persona', 'lugar', 'institucion'));
alter table public.difusion_destinos
  add constraint difusion_destinos_estado_valido
  check (estado in ('pendiente', 'avisado'));
-- Coherencia estado/fecha, del mismo modo que la 0048 ata estado y tomada_por.
alter table public.difusion_destinos
  add constraint difusion_destinos_avisado_coherente
  check ((estado = 'avisado') = (avisado_en is not null));
-- Cada tipo cuelga de lo suyo y de nada mas.
alter table public.difusion_destinos
  add constraint difusion_destinos_puntero_por_tipo
  check (
    (tipo = 'persona' and lugar_id is null and institucion_id is null
       and length(btrim(coalesce(etiqueta, ''))) between 1 and 80)
    or (tipo = 'lugar' and lugar_id is not null and institucion_id is null)
    or (tipo = 'institucion' and institucion_id is not null and lugar_id is null)
  );
-- Un mismo lugar no se agrega dos veces al mismo reporte.
create unique index difusion_destinos_lugar_unico
  on public.difusion_destinos (pet_id, lugar_id) where lugar_id is not null;
create index difusion_destinos_pet_idx on public.difusion_destinos (pet_id);

alter table public.difusion_destinos enable row level security;

-- El tablero es del dueño del reporte y de nadie mas: dice a quien le aviso,
-- que es informacion sobre SU red de contactos.
create policy "el tablero es del dueño del reporte"
  on public.difusion_destinos for all to authenticated
  using (exists (select 1 from public.pets p
                  where p.id = difusion_destinos.pet_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.pets p
                       where p.id = difusion_destinos.pet_id and p.user_id = auth.uid()));

-- ── Los lugares cerca de un reporte ──────────────────────────────────────
-- `security definer` para poder leer pets.lat/lng sin exponer la fila entera.
-- El TOPE DE RADIO es la leccion de la 0058: sin el, un p_radio_km de 99.999
-- barre el pais en una funcion concedida a anon.
create or replace function public.lugares_cerca(
  p_pet_id uuid,
  p_radio_km double precision default 5
)
returns table (
  id uuid, nombre text, categoria text, lat double precision,
  lng double precision, direccion text, comuna text, distancia_km double precision
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select l.id, l.nombre, l.categoria, l.lat, l.lng, l.direccion, l.comuna,
         st_distance(
           st_setsrid(st_makepoint(l.lng, l.lat), 4326)::geography,
           st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geography
         ) / 1000 as distancia_km
    from public.pets b
    join public.lugares l
      on st_dwithin(
           st_setsrid(st_makepoint(l.lng, l.lat), 4326)::geography,
           st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geography,
           least(coalesce(p_radio_km, 5), 50) * 1000
         )
   where b.id = p_pet_id
     and b.oculto = false
   order by distancia_km asc, l.id
   limit 60;
$$;

revoke all on function public.lugares_cerca(uuid, double precision) from public;
grant execute on function public.lugares_cerca(uuid, double precision) to authenticated;

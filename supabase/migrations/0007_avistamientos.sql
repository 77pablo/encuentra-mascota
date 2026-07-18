-- AVISTAMIENTOS ("Visto por acá")
-- Cualquiera con sesión puede reportar dónde vio a una mascota de un reporte,
-- armando un rastro de pistas que se pinta en el mapa del detalle.
create table public.sightings (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  nota text,
  foto text,
  creado_en timestamptz not null default now()
);
alter table public.sightings enable row level security;

-- Los avistamientos son públicos entre usuarios con sesión: la gracia es que
-- todos vean el rastro de dónde fue visto el animalito.
create policy "avistamientos visibles para autenticados"
  on public.sightings for select to authenticated using (true);

-- Solo puedo crear avistamientos a mi nombre.
create policy "crear mis avistamientos"
  on public.sightings for insert to authenticated
  with check (auth.uid() = user_id);

-- Puede borrar el que reportó el avistamiento O el dueño del reporte
-- (para limpiar pistas falsas o desactualizadas de su propia mascota).
create policy "borrar mi avistamiento o el dueño del reporte"
  on public.sightings for delete to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = (select p.user_id from public.pets p where p.id = pet_id)
  );

-- ÍNDICES: por reporte (para listar el rastro de una mascota) y por fecha.
create index sightings_pet_id_idx on public.sightings (pet_id);
create index sightings_creado_en_idx on public.sightings (creado_en desc);

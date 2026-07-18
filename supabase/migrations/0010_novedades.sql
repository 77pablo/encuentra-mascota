-- NOVEDADES ("Actualizaciones del dueño")
-- El dueño de un reporte publica notas cortas de novedad ("sigo buscando",
-- "posible pista en el sur"). Todos los que tienen sesión las leen como una
-- bitácora del caso: así el barrio sabe que el reporte sigue vivo.
create table public.pet_updates (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  creado_en timestamptz not null default now()
);
alter table public.pet_updates enable row level security;

-- Las novedades son públicas entre usuarios con sesión: la gracia es que todos
-- puedan seguir el hilo del caso.
create policy "novedades visibles para autenticados"
  on public.pet_updates for select to authenticated using (true);

-- Solo el DUEÑO del reporte puede publicar novedades, y siempre a su nombre:
-- exigimos que quien inserta sea el user_id de la fila Y el dueño del pet.
create policy "publicar novedades del dueño"
  on public.pet_updates for insert to authenticated
  with check (
    auth.uid() = user_id
    and auth.uid() = (select p.user_id from public.pets p where p.id = pet_id)
  );

-- El autor puede borrar su propia novedad (corregir o retractarse).
create policy "borrar mi novedad"
  on public.pet_updates for delete to authenticated
  using (auth.uid() = user_id);

-- ÍNDICES: por reporte (para listar la bitácora de una mascota) y por fecha.
create index pet_updates_pet_id_idx on public.pet_updates (pet_id);
create index pet_updates_creado_en_idx on public.pet_updates (creado_en desc);

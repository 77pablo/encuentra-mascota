-- FAVORITOS (guardar / seguir reportes)
-- El usuario guarda reportes que le importan para verlos juntos después.
create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (user_id, pet_id)
);
alter table public.favorites enable row level security;

-- Cada quien gestiona SOLO sus propios favoritos (leer, crear y borrar).
create policy "gestionar mis favoritos"
  on public.favorites for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Índice para listar rápido los favoritos de un usuario.
create index favorites_user_id_idx on public.favorites (user_id);

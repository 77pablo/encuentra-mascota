-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  foto_perfil text,
  creado_en timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "perfiles visibles para autenticados"
  on public.profiles for select to authenticated using (true);
create policy "editar mi propio perfil"
  on public.profiles for update to authenticated using (auth.uid() = id);
create policy "crear mi propio perfil"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- PETS
create type pet_estado as enum ('perdida', 'encontrada');
create type pet_especie as enum ('perro', 'gato', 'otro');

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  estado pet_estado not null,
  especie pet_especie not null,
  raza text,
  nombre text,
  descripcion text not null,
  fotos text[] not null default '{}',
  lat double precision not null,
  lng double precision not null,
  recompensa text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.pets enable row level security;

create policy "reportes visibles para autenticados"
  on public.pets for select to authenticated using (true);
create policy "crear mis reportes"
  on public.pets for insert to authenticated with check (auth.uid() = user_id);
create policy "editar mis reportes"
  on public.pets for update to authenticated using (auth.uid() = user_id);
create policy "borrar mis reportes"
  on public.pets for delete to authenticated using (auth.uid() = user_id);

-- MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  leido boolean not null default false,
  creado_en timestamptz not null default now()
);
alter table public.messages enable row level security;

create policy "leer solo mis mensajes"
  on public.messages for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);
create policy "enviar mensajes como yo"
  on public.messages for insert to authenticated with check (auth.uid() = from_user);
create policy "marcar leido mis mensajes recibidos"
  on public.messages for update to authenticated using (auth.uid() = to_user);

-- PUSH TOKENS
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  creado_en timestamptz not null default now()
);
alter table public.push_tokens enable row level security;

create policy "gestionar mis tokens"
  on public.push_tokens for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ÍNDICES (para que las búsquedas no recorran toda la tabla — como no buscar
-- una llave en un cajón lleno de ropa)
create index pets_activo_idx on public.pets (activo);
create index pets_user_id_idx on public.pets (user_id);
create index pets_creado_en_idx on public.pets (creado_en desc);
create index pets_estado_especie_idx on public.pets (estado, especie);
create index pets_lat_lng_idx on public.pets (lat, lng);
create index messages_pet_id_idx on public.messages (pet_id);
create index messages_to_user_leido_idx on public.messages (to_user, leido);
create index messages_creado_en_idx on public.messages (creado_en);
create index push_tokens_user_id_idx on public.push_tokens (user_id);

-- STORAGE: bucket de fotos
insert into storage.buckets (id, name, public) values ('pet-photos', 'pet-photos', true);

create policy "fotos legibles por todos"
  on storage.objects for select using (bucket_id = 'pet-photos');
create policy "subir mis fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-photos' and owner = auth.uid());
create policy "borrar mis fotos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pet-photos' and owner = auth.uid());

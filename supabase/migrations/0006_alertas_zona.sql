-- ALERTAS POR ZONA
-- Cada usuario define UNA zona de alerta (un centro + radio) y la app le avisa
-- cuando aparecen reportes nuevos dentro de ella. Una fila por usuario: la
-- llave primaria es el propio user_id, así que el upsert por user_id reemplaza
-- la zona anterior sin duplicar.
create table public.alert_zones (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision,
  lng double precision,
  radio_km int not null default 5,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);
alter table public.alert_zones enable row level security;

-- El usuario solo puede ver y gestionar su propia zona (mismo patrón que
-- push_tokens en 0001_init.sql).
create policy "gestionar mi zona de alerta"
  on public.alert_zones for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

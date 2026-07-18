-- AVISOS: preferencias por usuario + cola de eventos escrita SOLO por triggers.

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  zona boolean not null default true,
  avistamientos boolean not null default true,
  pistas boolean not null default true,
  coincidencias boolean not null default true,
  canal_email boolean not null default true,
  canal_push boolean not null default true,
  actualizado_en timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;

create policy "gestionar mis preferencias de aviso"
  on public.notification_prefs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cola cruda. SIN políticas: invisible para anon y authenticated.
-- Solo la Edge Function la toca, con la service role key (que salta RLS).
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('reporte_nuevo', 'avistamiento', 'pista')),
  pet_id uuid not null references public.pets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  datos jsonb not null default '{}',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  intentos int not null default 0,
  creado_en timestamptz not null default now(),
  procesado_en timestamptz
);
alter table public.notification_events enable row level security;

create index notification_events_pendientes_idx
  on public.notification_events (estado, creado_en);

-- Encoladores. Solo insertan: nada de lógica de targeting acá.
-- `especie` y `estado` son enums (ver 0001_init.sql): se castean a text para
-- que jsonb_build_object los guarde como cadenas simples.
create or replace function public.enqueue_reporte_nuevo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_events (tipo, pet_id, actor_id, datos)
  values ('reporte_nuevo', new.id, new.user_id,
          jsonb_build_object('lat', new.lat, 'lng', new.lng,
                             'especie', new.especie::text, 'estado_pet', new.estado::text));
  return new;
end; $$;

create trigger pets_notificar after insert on public.pets
  for each row execute function public.enqueue_reporte_nuevo();

create or replace function public.enqueue_avistamiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_events (tipo, pet_id, actor_id, datos)
  values ('avistamiento', new.pet_id, new.user_id,
          jsonb_build_object('lat', new.lat, 'lng', new.lng));
  return new;
end; $$;

create trigger sightings_notificar after insert on public.sightings
  for each row execute function public.enqueue_avistamiento();

create or replace function public.enqueue_pista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_events (tipo, pet_id, actor_id, datos)
  values ('pista', new.pet_id, new.user_id,
          jsonb_build_object('extracto', left(new.texto, 120)));
  return new;
end; $$;

-- pet_tips puede no existir todavía (la crea 0012). Si existe, enganchamos ya.
do $$
begin
  if to_regclass('public.pet_tips') is not null then
    execute 'drop trigger if exists pet_tips_notificar on public.pet_tips';
    execute 'create trigger pet_tips_notificar after insert on public.pet_tips
             for each row execute function public.enqueue_pista()';
  end if;
end $$;

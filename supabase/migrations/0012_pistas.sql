-- PISTAS DEL BARRIO: cualquiera con cuenta aporta datos sobre un reporte.
create table public.pet_tips (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  oculto boolean not null default false,
  creado_en timestamptz not null default now()
);
alter table public.pet_tips enable row level security;

create index pet_tips_pet_id_idx on public.pet_tips (pet_id, creado_en desc);

-- Lectura pública (coherente con 0004: los reportes activos se ven sin sesión).
create policy "pistas visibles para todos"
  on public.pet_tips for select to anon, authenticated
  using (oculto = false);

create policy "crear mis pistas"
  on public.pet_tips for insert to authenticated
  with check (auth.uid() = user_id);

-- Borra el autor de la pista o el dueño del reporte.
create policy "borrar mis pistas o las de mi reporte"
  on public.pet_tips for delete to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = (select p.user_id from public.pets p where p.id = pet_id)
  );

-- Anti-spam: máximo 10 pistas por usuario por hora (mismo patrón que 0002).
create or replace function public.check_tip_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare recientes int;
begin
  select count(*) into recientes
  from public.pet_tips
  where user_id = new.user_id and creado_en > now() - interval '1 hour';
  if recientes >= 10 then
    raise exception 'Dejaste muchas pistas por ahora. Intenta de nuevo en un rato.';
  end if;
  return new;
end; $$;

create trigger pet_tips_rate_limit
  before insert on public.pet_tips
  for each row execute function public.check_tip_rate_limit();

-- Si la migración 0011 (avisos) ya está aplicada, enganchamos el aviso al dueño.
do $$
begin
  if to_regprocedure('public.enqueue_pista()') is not null then
    execute 'drop trigger if exists pet_tips_notificar on public.pet_tips';
    execute 'create trigger pet_tips_notificar after insert on public.pet_tips
             for each row execute function public.enqueue_pista()';
  end if;
end $$;

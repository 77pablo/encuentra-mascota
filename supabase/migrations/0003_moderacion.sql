-- Columna para ocultar reportes moderados
alter table public.pets add column if not exists oculto boolean not null default false;
create index if not exists pets_oculto_idx on public.pets (oculto);

-- Denuncias
create table public.denuncias (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  reporter_user uuid not null references public.profiles(id) on delete cascade,
  motivo text not null,
  creado_en timestamptz not null default now(),
  unique (pet_id, reporter_user)   -- una denuncia por persona por reporte
);
alter table public.denuncias enable row level security;

create policy "crear mis denuncias"
  on public.denuncias for insert to authenticated
  with check (auth.uid() = reporter_user);
create policy "leer mis denuncias"
  on public.denuncias for select to authenticated
  using (auth.uid() = reporter_user);

-- Auto-ocultar un reporte cuando acumula 3+ denuncias
create or replace function public.check_denuncias()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare total int;
begin
  select count(*) into total from public.denuncias where pet_id = new.pet_id;
  if total >= 3 then
    update public.pets set oculto = true where id = new.pet_id;
  end if;
  return new;
end;
$$;
create trigger denuncias_auto_ocultar
  after insert on public.denuncias
  for each row execute function public.check_denuncias();

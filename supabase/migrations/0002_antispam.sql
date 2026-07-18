-- Límite anti-spam: máximo 5 publicaciones por usuario por hora.
create or replace function public.check_pet_rate_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare recientes int;
begin
  select count(*) into recientes
  from public.pets
  where user_id = new.user_id
    and creado_en > now() - interval '1 hour';
  if recientes >= 5 then
    raise exception 'Alcanzaste el límite de publicaciones por ahora. Intenta de nuevo en un rato.';
  end if;
  return new;
end;
$$;

create trigger pets_rate_limit
  before insert on public.pets
  for each row execute function public.check_pet_rate_limit();

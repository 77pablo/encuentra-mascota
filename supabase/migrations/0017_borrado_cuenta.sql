-- ============================================================
-- BORRAR MI CUENTA (soft delete de filas + anonimizacion de datos)
--
-- Regla: lo que es solo tuyo se destruye; lo que ademas es de otro
-- sobrevive sin vos.
-- Ver docs/superpowers/specs/2026-07-19-borrado-cuenta-design.md
-- ============================================================

-- 1. SOLTAR LA FK A auth.users
--
-- Hoy `profiles.id` referencia `auth.users(id) on delete cascade`. Mientras eso
-- exista, borrar el usuario de Auth arrastra el perfil y, en cascada, cada
-- mensaje, pista y avistamiento de esa persona. Justo lo que NO queremos: la
-- fila de `profiles` tiene que sobrevivir como lapida anonima.
alter table public.profiles drop constraint profiles_id_fkey;

-- 2. LA MARCA DE LA LAPIDA
--
-- La UI decide que mostrar mirando esta columna, no el texto del nombre:
-- en las pistas se firma "Un vecino" y en el chat "Cuenta eliminada".
alter table public.profiles add column eliminado_en timestamptz;

-- 3. HELPER: URL publica de Storage -> ruta dentro del bucket
--
-- Las fotos se guardan como URL publica completa
-- (.../storage/v1/object/public/pet-photos/<uid>/<ts>.jpg) pero la API de
-- Storage borra por ruta relativa (<uid>/<ts>.jpg).
create or replace function public.ruta_storage(url text)
returns text
language sql
immutable
as $$
  select case
    when url is null then null
    when position('/pet-photos/' in url) = 0 then null
    else substring(url from position('/pet-photos/' in url) + length('/pet-photos/'))
  end;
$$;

-- 4a. QUE FOTOS HAY QUE BORRAR (solo lectura)
--
-- Va SEPARADA de la anonimizacion y se llama ANTES, a proposito. Si estuviera
-- adentro de `anonimizar_mi_cuenta`, las rutas se devolverian una sola vez:
-- cuando el borrado de Storage fallara y se reintentara, la RPC ya estaria en
-- su camino idempotente, devolveria vacio, y las fotos quedarian para siempre
-- en un bucket publico mientras la funcion responde "listo". Separadas, un
-- fallo antes de anonimizar no deja rastro y el reintento arranca limpio.
create or replace function public.mis_fotos_a_borrar()
returns table (ruta text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Hace falta la sesion abierta para borrar la cuenta'
      using errcode = '42501';
  end if;

  -- El avatar y las fotos de los reportes que estan por morir. Las fotos de
  -- avistamientos en reportes AJENOS no se tocan: esos avistamientos
  -- sobreviven anonimizados y su foto le sirve a quien busca su mascota.
  return query
    select r.ruta from (
      select public.ruta_storage(p.foto_perfil) as ruta
        from public.profiles p where p.id = uid
      union all
      select public.ruta_storage(f)
        from public.pets pe, unnest(pe.fotos) as f where pe.user_id = uid
      union all
      select public.ruta_storage(pe.final_foto)
        from public.pets pe where pe.user_id = uid
    ) r
    where r.ruta is not null
      -- SOLO lo que cuelga de la carpeta del propio usuario.
      --
      -- NO ES OPCIONAL: `pets.fotos` y `profiles.foto_perfil` son texto que
      -- escribe el usuario (la base solo le valida el largo). Sin este filtro,
      -- alguien puede guardar en SU reporte la URL de la foto de OTRA persona
      -- y despues borrarse la cuenta: la Edge Function corre con service_role,
      -- que se saltea la RLS de Storage, y le borraria la foto a esa otra
      -- persona. El precio de entrada seria sacrificar la cuenta propia, que
      -- ademas se puede volver a crear.
      and r.ruta like uid::text || '/%';
end;
$$;

revoke all on function public.mis_fotos_a_borrar() from public, anon;
grant execute on function public.mis_fotos_a_borrar() to authenticated;

-- 4b. LA ANONIMIZACION
--
-- SIN PARAMETROS A PROPOSITO. La identidad sale de auth.uid(), nunca de un
-- argumento: una firma `anonimizar_cuenta(user_id uuid)` con security definer
-- le permitiria a cualquiera borrarle la cuenta a cualquier otro.
create or replace function public.anonimizar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Hace falta la sesion abierta para borrar la cuenta'
      using errcode = '42501';
  end if;

  -- Idempotente: si ya se anonimizo, no hay nada que hacer. La Edge Function
  -- puede reintentar sin miedo si fallo en un paso posterior.
  if exists (
    select 1 from public.profiles p where p.id = uid and p.eliminado_en is not null
  ) then
    return;
  end if;

  -- Se borra de verdad: puramente personal, sin valor para terceros.
  delete from public.notification_events where actor_id = uid;
  delete from public.push_tokens        where user_id  = uid;
  delete from public.notification_prefs where user_id  = uid;
  delete from public.favorites          where user_id  = uid;
  delete from public.alert_zones        where user_id  = uid; -- donde vive la persona
  -- Cascadea a sightings, pet_tips y pet_updates DE ESOS reportes (incluidos
  -- los de terceros): consecuencia aceptada de que el reporte se vaya de verdad.
  delete from public.pets               where user_id  = uid;

  -- Sobreviven apuntando a la lapida: messages (ambas direcciones), y los
  -- sightings/pet_tips que dejo en reportes AJENOS. No se tocan aca.

  update public.profiles
     set nombre       = 'Cuenta eliminada', -- el CHECK no permite vacio
         foto_perfil  = null,
         telefono     = null,
         red_social   = null,
         eliminado_en = now()
   where id = uid;

  return;
end;
$$;

-- Solo alguien con sesion puede invocarla, y solo se borra a si mismo.
revoke all on function public.anonimizar_mi_cuenta() from public, anon;
grant execute on function public.anonimizar_mi_cuenta() to authenticated;

-- 5. NO SE LE ESCRIBE A UNA CUENTA ELIMINADA
--
-- Que la UI esconda el campo de texto no alcanza: con el token en la mano se
-- puede insertar igual por la API. Esto lo corta en la base.
drop policy "enviar mensajes como yo" on public.messages;
create policy "enviar mensajes como yo"
  on public.messages for insert to authenticated
  with check (
    auth.uid() = from_user
    and not exists (
      select 1 from public.profiles p
       where p.id = messages.to_user and p.eliminado_en is not null
    )
  );

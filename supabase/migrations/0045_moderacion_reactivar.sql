-- 0045 — Se puede DESHACER una suspension.
--
-- `moderar_suspender` (0040) pone `suspendido_en = now()` y hasta acá no habia
-- nada que lo volviera a null. El panel lo opera una sola persona a mano, con
-- "Suspender" al lado de "Descartar": un toque equivocado solo se arreglaba
-- entrando al SQL Editor de Supabase. Y una vez resuelta la denuncia la cuenta
-- suspendida no aparecia en ninguna pantalla, asi que tampoco se podia saber a
-- quien se habia suspendido.
--
-- Las dos funciones son `security definer` porque desde la 0018 `authenticated`
-- no puede leer `profiles` (los grants son por columna) y `suspendido_en` de la
-- 0036 nunca se le concedio a nadie: una funcion definer es la unica via.
--
-- Es aditiva: no toca tablas, policies ni datos, y no redefine ninguna funcion
-- anterior. Se puede aplicar en cualquier momento, antes o despues de subir la
-- web (si la web va primero, las dos pantallas degradan: la bandeja de
-- suspendidos muestra su estado de error y nada mas se rompe).

-- Bandeja de cuentas suspendidas, mas reciente primero.
create or replace function public.moderacion_suspendidos()
returns table (id uuid, nombre text, suspendido_en timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  return query
    select p.id, p.nombre, p.suspendido_en
      from public.profiles p
     -- `eliminado_en is null`: una cuenta borrada deja su fila lapida (0017).
     -- Si estaba suspendida al borrarse, sin este filtro quedaria para siempre
     -- en la bandeja como algo pendiente, y reactivarla no significaria nada.
     where p.suspendido_en is not null
       and p.eliminado_en is null
     order by p.suspendido_en desc;
end;
$$;
revoke all on function public.moderacion_suspendidos() from public, anon;
grant execute on function public.moderacion_suspendidos() to authenticated;

-- Levanta la suspension. Recibe el id del USUARIO y no el de una denuncia: al
-- suspender, la denuncia queda resuelta y sale de la bandeja, asi que a la hora
-- de reactivar ya no hay denuncia de donde derivar el usuario.
create or replace function public.moderar_reactivar(p_usuario_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;

  -- El `and suspendido_en is not null` + el `if not found` van juntos a
  -- proposito: sin ellos, reactivar un id inexistente o una cuenta que ya
  -- estaba activa devolveria exito habiendo hecho cero. Es la misma forma del
  -- bug de la 0017 (200 sin haber borrado nada), y en el panel se veria como
  -- "listo, reactivada" sobre una cuenta que sigue suspendida.
  update public.profiles
     set suspendido_en = null
   where id = p_usuario_id
     and suspendido_en is not null;
  if not found then
    raise exception 'la cuenta no esta suspendida';
  end if;
end;
$$;
revoke all on function public.moderar_reactivar(uuid) from public, anon;
grant execute on function public.moderar_reactivar(uuid) to authenticated;

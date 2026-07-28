-- ============================================================
-- 0043 — RETIRAR UN MENSAJE TAMBIEN BORRA SU FOTO DEL BUCKET
--
-- Diferido I-2 de la tanda 8. `moderar_retirar` (0040) resuelve el caso
-- 'mensaje' con `delete from public.messages`: la fila se va, pero el archivo
-- de `messages.imagen_url` (0038) sigue vivo en el bucket `pet-photos` y
-- accesible por su URL publica para siempre. Desde SQL no se puede borrar un
-- objeto de Storage: hace falta una Edge Function con service_role
-- (`moderar-borrar-foto`).
--
-- EL PROBLEMA DE ORDEN, que es el que manda todo el diseno:
--   el retiro BORRA la fila del mensaje, asi que despues del retiro ya no hay
--   de donde derivar la ruta. Si la Edge Function la pidiera "del mensaje
--   retirado" llegaria tarde: no existe. Y si la RPC entregara la ruta una
--   sola vez y el borrado de Storage fallara, el reintento se quedaria sin
--   rutas y devolveria 200 sin haber borrado nada (ese bug exacto ya paso en
--   este proyecto, ver el comentario de `mis_fotos_a_borrar` en la 0017).
--
-- Por eso el retiro ENCOLA la ruta en una tabla antes de borrar la fila, y la
-- fila de la cola sobrevive hasta que Storage confirme el borrado. Mientras no
-- confirme, sigue pendiente y se reintenta. Es el mismo patron de la 0017
-- ("una RPC de solo lectura devuelve las rutas, la Edge Function las borra"),
-- pero con estado persistido porque acá la fuente de la ruta se destruye.
--
-- Y LA RUTA NUNCA VIENE DEL CLIENTE. `messages.imagen_url` es texto que
-- escribe el usuario; la Edge Function corre con service_role y se saltea la
-- RLS de Storage, asi que una ruta arbitraria le borraria el archivo a
-- CUALQUIERA (esto ya fue un Critical acá, ver 0017). La cola se llena del
-- lado del servidor y solo con rutas que cuelgan de la carpeta del AUTOR del
-- mensaje.
-- ============================================================

-- 1. LA COLA DE BARRIDO
--
-- Una fila por foto que hay que sacar del bucket. `borrado_en` la cierra;
-- `intentos` evita que una ruta que Storage nunca confirma se reintente para
-- siempre en cada retiro (se abandona a los 5 intentos y queda registrada).
create table if not exists public.moderacion_fotos_pendientes (
  id          bigint generated always as identity primary key,
  denuncia_id uuid references public.denuncias(id) on delete set null,
  mensaje_id  uuid not null,
  ruta        text not null,
  creado_en   timestamptz not null default now(),
  intentos    int not null default 0,
  borrado_en  timestamptz
);

create index if not exists moderacion_fotos_pendientes_abiertas_idx
  on public.moderacion_fotos_pendientes (creado_en)
  where borrado_en is null;

-- Cerrada de punta a punta: RLS activa y SIN NINGUNA POLICY, mas revoke de los
-- grants de tabla. Nadie la lee ni la escribe por PostgREST; solo la tocan las
-- funciones security definer de mas abajo, que ya chequean es_admin(). Si
-- authenticated pudiera leerla, cualquiera sacaria las rutas de las fotos
-- retiradas por moderacion (que son justo el contenido que se quiso sacar de
-- circulacion).
alter table public.moderacion_fotos_pendientes enable row level security;
revoke all on table public.moderacion_fotos_pendientes from public, anon, authenticated;

-- 2. EL RETIRO ENCOLA LA RUTA ANTES DE BORRAR LA FILA
--
-- Copia VERBATIM de `moderar_retirar` (0040) salvo la rama 'mensaje', que ahora
-- encola primero. Misma firma y mismo tipo de retorno (void) → `create or
-- replace` alcanza, no hace falta `drop function` (que si haria falta si
-- cambiara el tipo de retorno: Postgres corta con "cannot change return type").
-- El insert va en la MISMA transaccion que el delete: o se encola y se borra,
-- o no pasa ninguna de las dos. Nunca se pierde una ruta por un fallo a medias.
create or replace function public.moderar_retirar(p_denuncia_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare d public.denuncias%rowtype;
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  select * into d from public.denuncias where id = p_denuncia_id;
  if not found then raise exception 'denuncia inexistente'; end if;

  case d.tipo
    when 'reporte'  then update public.pets set oculto = true where id = d.pet_id;
    when 'adopcion' then update public.adoptions set oculto = true where id = d.objeto_id;
    when 'pista'    then delete from public.pet_tips where id = d.objeto_id;
    when 'avistamiento' then delete from public.sightings where id = d.objeto_id;
    when 'pregunta_adopcion' then delete from public.adoption_questions where id = d.objeto_id;
    when 'mensaje'  then
      -- La ruta se DERIVA del mensaje (0038 guarda la URL publica completa;
      -- `ruta_storage` de la 0017 la convierte en ruta relativa del bucket).
      --
      -- El filtro `~ ('^' || m.from_user || '/[^/]+$')` NO ES OPCIONAL, es el
      -- mismo de `mis_fotos_a_borrar`: la URL la escribio el autor del mensaje,
      -- asi que puede apuntar a la foto de OTRA persona. Sin esto, alcanzaria
      -- con mandarse un mensaje con la URL del avatar ajeno y auto-denunciarse
      -- para que un admin de buena fe le borre el archivo a un tercero. Un solo
      -- segmento despues del uid (y no `like '<uid>/%'`) para que
      -- `<miuid>/../<uid-ajeno>/foto.jpg` tampoco entre: que eso haga dano
      -- depende de si Storage normaliza el `..`, y un borrado irreversible que
      -- se saltea la RLS no puede depender de esa suposicion.
      --
      -- Si la foto es ajena no se encola nada y el mensaje se retira igual: el
      -- retiro es lo importante, el archivo ajeno no era del retirado.
      insert into public.moderacion_fotos_pendientes (denuncia_id, mensaje_id, ruta)
      select p_denuncia_id, m.id, public.ruta_storage(m.imagen_url)
        from public.messages m
       where m.id = d.objeto_id
         and m.imagen_url is not null
         and public.ruta_storage(m.imagen_url) ~ ('^' || m.from_user::text || '/[^/]+$');

      delete from public.messages where id = d.objeto_id;
    else null;
  end case;

  update public.denuncias
     set estado='resuelta', resuelto_en=now(), resuelto_por=auth.uid(), accion='retirado'
   where id = p_denuncia_id;

  -- otras denuncias del mismo objeto salen de la bandeja
  update public.denuncias
     set estado='resuelta', resuelto_en=now(), resuelto_por=auth.uid(), accion='retirado (en lote)'
   where estado='pendiente' and id <> p_denuncia_id and tipo = d.tipo
     and coalesce(objeto_id, pet_id) = coalesce(d.objeto_id, d.pet_id);
end;
$$;
revoke all on function public.moderar_retirar(uuid) from public, anon;
grant execute on function public.moderar_retirar(uuid) to authenticated;

-- 3. QUE RUTAS HAY QUE BORRAR (solo lectura, gateada por es_admin)
--
-- Recibe el id de la DENUNCIA, nunca una ruta: lo unico que el cliente elige es
-- de que denuncia hablamos, y las rutas salen de la cola que llenó el servidor.
--
-- Ademas de las de esa denuncia devuelve los REZAGADOS: rutas de retiros
-- anteriores cuyo borrado en Storage nunca se confirmo. Sin esto, un fallo de
-- Storage dejaria la foto para siempre, porque la denuncia ya salio de la
-- bandeja y nadie va a volver a apretar "Retirar" sobre ella. Asi, cada retiro
-- de mensaje barre tambien lo que quedo colgado.
-- El `limit` acota el trabajo de una sola invocacion (Storage borra de a lotes);
-- lo que sobra lo levanta el retiro siguiente.
drop function if exists public.moderacion_fotos_a_borrar(uuid);
create function public.moderacion_fotos_a_borrar(p_denuncia_id uuid)
returns table (id bigint, ruta text)
language plpgsql security definer set search_path = public, pg_temp stable
as $$
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  return query
    select f.id, f.ruta
      from public.moderacion_fotos_pendientes f
     where f.borrado_en is null
       and f.intentos < 5
     order by (f.denuncia_id is distinct from p_denuncia_id), f.creado_en
     limit 50;
end;
$$;
revoke all on function public.moderacion_fotos_a_borrar(uuid) from public, anon;
grant execute on function public.moderacion_fotos_a_borrar(uuid) to authenticated;

-- 4. CERRAR (o reintentar) LAS RUTAS SEGUN LO QUE CONTESTO STORAGE
--
-- `p_borradas`: las que Storage confirmo → se cierran.
-- `p_fallidas`: las que se pidieron y Storage NO confirmo → siguen pendientes
--   con un intento mas. `storage.remove()` devuelve `error` solo si se cae la
--   request entera; las que no borro simplemente faltan en `data`, asi que la
--   Edge Function compara lo pedido contra lo devuelto y manda la diferencia
--   acá. A los 5 intentos la fila deja de entregarse (punto 3) y queda como
--   registro de que ese archivo no se pudo borrar.
--
-- Devuelve las filas que realmente toco: un update que no matchea NO es un
-- error, solo afecta 0 filas, y la Edge Function tiene que poder darse cuenta
-- de que marco menos de lo que creia.
--
-- Las dos ramas se excluyen entre si (`not (f.id = any(p_borradas))` en la
-- segunda): dos updates a la misma fila dentro de una misma sentencia se pisan
-- de forma silenciosa, y no queremos que un id repetido en las dos listas
-- decida al azar.
drop function if exists public.moderacion_fotos_marcar(bigint[], bigint[]);
create function public.moderacion_fotos_marcar(p_borradas bigint[], p_fallidas bigint[])
returns table (id bigint, estado text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_borradas bigint[] := coalesce(p_borradas, '{}');
  v_fallidas bigint[] := coalesce(p_fallidas, '{}');
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  return query
    with cerradas as (
      update public.moderacion_fotos_pendientes f
         set borrado_en = now(), intentos = f.intentos + 1
       where f.id = any(v_borradas) and f.borrado_en is null
      returning f.id
    ), reintentos as (
      update public.moderacion_fotos_pendientes f
         set intentos = f.intentos + 1
       where f.id = any(v_fallidas) and f.borrado_en is null
         and not (f.id = any(v_borradas))
      returning f.id
    )
    select cerradas.id, 'borrada'::text from cerradas
    union all
    select reintentos.id, 'reintentar'::text from reintentos;
end;
$$;
revoke all on function public.moderacion_fotos_marcar(bigint[], bigint[]) from public, anon;
grant execute on function public.moderacion_fotos_marcar(bigint[], bigint[]) to authenticated;

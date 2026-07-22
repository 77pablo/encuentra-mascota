-- ============================================================
-- FOTOS EN EL CHAT
--
-- Un mensaje puede llevar una foto (con o sin texto), no solo texto. La
-- columna nueva es la URL pública del bucket `pet-photos` (mismo bucket y
-- convención de ruta que ya usa `uploadPetPhoto`, ver src/services/storage.ts:
-- `<uid>/<idAleatorio>.jpg`).
-- ============================================================

alter table public.messages add column if not exists imagen_url text;

-- Relajar el texto: ahora un mensaje puede ser solo-foto. Se cambia el CHECK
-- de "1 a 2000 caracteres, siempre" (0016) por "si hay texto, entre 1 y 2000;
-- y al menos uno de los dos (texto o imagen) tiene que estar".
alter table public.messages drop constraint if exists messages_texto_largo;
alter table public.messages alter column texto drop not null;
alter table public.messages add constraint messages_texto_o_imagen check (
  (texto is null or length(btrim(texto)) between 1 and 2000)
  and (texto is not null or imagen_url is not null)
);

-- `mis_fotos_a_borrar()` (0017) lee qué fotos hay que barrer de Storage al
-- borrar la cuenta. Las fotos de chat viven en el mismo bucket bajo <uid>/,
-- así que hay que sumarlas ahí también: si no, borrar la cuenta deja fotos de
-- chat huérfanas en un bucket público para siempre.
--
-- Cuerpo copiado VERBATIM de la 0017 (mismo `if uid is null`, mismos
-- comentarios de por qué el filtro `~ ('^' || uid::text || '/[^/]+$')` no es
-- opcional) + un nuevo `union all` con los mensajes propios que llevan foto.
-- Misma firma (`returns table (ruta text)`) → alcanza con `create or
-- replace`, no hace falta `drop function` primero.
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

  -- El avatar, las fotos de los reportes que estan por morir, y las fotos que
  -- mande en el chat (0038). Las fotos de avistamientos en reportes AJENOS no
  -- se tocan: esos avistamientos sobreviven anonimizados y su foto le sirve a
  -- quien busca su mascota. Los mensajes tambien sobreviven (0017, paso 6) con
  -- foto y todo: solo se borra el ARCHIVO de Storage, no la fila.
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
      union all
      select public.ruta_storage(m.imagen_url)
        from public.messages m where m.from_user = uid and m.imagen_url is not null
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
      -- Un unico segmento despues del uid, que es exactamente la forma que
      -- genera la app (`${userId}/${idAleatorio()}.jpg`, ver src/services/storage.ts).
      -- Con `like '<uid>/%'` alcanzaba para el ataque directo, pero dejaba pasar
      -- `<miuid>/../<uid-de-otro>/foto.jpg`. Que eso haga dano depende de si
      -- Storage normaliza el `..`, y no queremos que un borrado irreversible
      -- que se saltea la RLS dependa de esa suposicion.
      and r.ruta ~ ('^' || uid::text || '/[^/]+$');
end;
$$;

revoke all on function public.mis_fotos_a_borrar() from public, anon;
grant execute on function public.mis_fotos_a_borrar() to authenticated;

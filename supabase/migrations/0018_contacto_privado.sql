-- ============================================================
-- CERRAR LA FUGA DE CONTACTO EN `profiles`
--
-- La politica de FILAS es `for select to authenticated using (true)`
-- (0001_init.sql), asi que cualquier cuenta -- incluida una descartable
-- creada al momento -- puede leer el telefono y la red social de todos
-- los demas usuarios. Comprobado el 19-jul leyendo los datos reales del
-- dueño del proyecto desde una cuenta descartable.
--
-- La politica de FILAS no cambia: nombre y foto siguen siendo publicos a
-- proposito (firman las pistas, aparecen en los chats y sostienen el modo
-- invitado). Lo que se cierra son dos COLUMNAS.
-- ============================================================

revoke select on public.profiles from anon, authenticated;
grant  select (id, nombre, foto_perfil, creado_en, eliminado_en)
       on public.profiles to anon, authenticated;

-- `update` no se toca: editar el perfil propio sigue funcionando. `id` queda
-- legible porque lo necesitan el `where` de los updates y la propia RLS.

-- El dueño recupera sus datos por aca. SIN PARAMETROS a proposito: no existe
-- una firma que permita pedir la fila de otra persona. Es la misma tecnica de
-- `anonimizar_mi_cuenta()`, que el 19-jul devolvio PGRST202 a un intento de
-- pasarle un user_id.
--
-- El `drop` no es decorativo: si esta funcion ya existiera con otra firma,
-- `create or replace` NO puede cambiar el tipo de retorno de una funcion
-- Postgres (ya nos paso con `anonimizar_mi_cuenta()` en la 0017). Sin esto, la
-- migracion fallaria a la mitad en cualquier base donde ya se haya corrido
-- una version anterior de `mi_perfil()`.
drop function if exists public.mi_perfil();

create function public.mi_perfil()
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  telefono text,
  red_social text,
  creado_en timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.nombre, p.foto_perfil, p.telefono, p.red_social, p.creado_en
  from public.profiles p
  where p.id = auth.uid()
$$;

revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;

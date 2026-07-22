-- 0036c_mi_perfil_es_admin.sql
-- create or replace NO puede cambiar el tipo de retorno: drop primero.
--
-- OJO: la firma vigente de mi_perfil() NO es la del brief original (que se
-- quedo en la version de la 0018). La 0024 ya la amplio con
-- `fecha_nacimiento`. Recrear con la firma vieja del brief habria borrado esa
-- columna del RPC en silencio (mismo peligro que documenta la 0018/0024: un
-- select que ya no trae una columna no tira error, el dato simplemente deja
-- de llegar). Se conserva `fecha_nacimiento` y se agrega `es_admin` al final.
drop function if exists public.mi_perfil();
create function public.mi_perfil()
returns table (
  id uuid, nombre text, foto_perfil text, telefono text, red_social text,
  fecha_nacimiento date, creado_en timestamptz, es_admin boolean
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select p.id, p.nombre, p.foto_perfil, p.telefono, p.red_social,
         p.fecha_nacimiento, p.creado_en, p.es_admin
  from public.profiles p
  where p.id = auth.uid()
$$;
revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;

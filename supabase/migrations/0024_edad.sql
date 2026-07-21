-- ============================================================
-- CONTROL DE EDAD MINIMA (14 AÑOS)
--
-- La ley chilena distingue "niño" (<14) de "adolescente" (14-17): un
-- adolescente puede consentir por si mismo el tratamiento de sus datos no
-- sensibles, un niño necesita autorizacion de su madre/padre/tutor, que no
-- tenemos forma seria de verificar. Por eso el corte es 14 (no 13 de COPPA,
-- que es otro pais, ni 18, que nadie respetaria). Ver el spec de la Tanda C.
--
-- El corte se aplica en el registro (schema `registerSchema` + pantalla). Aca
-- solo se GUARDA la fecha declarada, para poder:
--   1) recalcular la edad (alguien cumple 14 estando en la app), y
--   2) demostrar sobre que base se tomo la decision si algun dia hay reclamo.
-- Se guarda la fecha completa, no un booleano `es_mayor`.
-- ============================================================

-- Columna privada. NO se agrega al `grant select (...)` de `anon`/
-- `authenticated` de la 0018: ese grant es una lista explicita de columnas y
-- el esquema de permisos es fail-closed, asi que una columna que no esta en la
-- lista NO es legible por nadie salvo el dueño via `mi_perfil()`. Mismo
-- tratamiento que `telefono` y `red_social`: no aparece en el perfil publico,
-- no la ve nadie mas.
alter table public.profiles
  add column if not exists fecha_nacimiento date;

-- El trigger que crea el perfil al registrarse ahora tambien guarda la fecha
-- que viaja en la metadata del signUp (`options.data.fecha_nacimiento`), en
-- formato 'YYYY-MM-DD'. `nullif(...,'')::date` deja la columna en NULL si el
-- dato falta o viene vacio (cuentas viejas, o algun camino de registro que no
-- la mande), sin romper el registro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, fecha_nacimiento)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''), 'Usuario'),
    nullif(new.raw_user_meta_data->>'fecha_nacimiento', '')::date
  );
  return new;
end;
$$;

-- `mi_perfil()` es el unico camino por el que el dueño lee sus propios datos
-- privados. Se le agrega `fecha_nacimiento`. El `drop` es necesario porque
-- `create or replace` no puede cambiar el tipo de retorno de una funcion (ya
-- paso con `anonimizar_mi_cuenta()` en la 0017 y con `mi_perfil()` en la 0018).
-- SIN PARAMETROS a proposito: no existe firma para pedir la fila de otra
-- persona.
drop function if exists public.mi_perfil();

create function public.mi_perfil()
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  telefono text,
  red_social text,
  fecha_nacimiento date,
  creado_en timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.id, p.nombre, p.foto_perfil, p.telefono, p.red_social,
         p.fecha_nacimiento, p.creado_en
  from public.profiles p
  where p.id = auth.uid()
$$;

revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;

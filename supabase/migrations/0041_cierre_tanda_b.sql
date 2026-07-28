-- ============================================================
-- CIERRE DE LA TANDA B — los cabos sueltos de bloqueo + denuncia
--
-- Todo lo que quedo pendiente y se resuelve del lado del SERVIDOR. El analisis
-- de brecha esta en docs/superpowers/tanda-b-cierre-pendiente.md.
--
--   1. `anonimizar_mi_cuenta()` borra tambien las filas de `bloqueos`
--      (AGUJERO DE PRIVACIDAD REAL: hoy sobreviven al borrado de cuenta).
--   2. CHECK de largo en `denuncias`: `motivo` (1-60) y `detalle` (<=500).
--   3. Se REPONE `denuncias_objeto_por_tipo`, que se perdio en silencio en la
--      0030/0032, extendido a 'adopcion' y 'pregunta_adopcion'.
--   4. Guard explicito en el trigger de auto-ocultado (`check_denuncias`).
--   5. `profiles.terminos_aceptados_en` + que `handle_new_user` la llene.
--
-- ⚠️ El codigo del cliente que acompaña a esta migracion NO la necesita para
--    funcionar: todo lo nuevo del lado de la app degrada con elegancia si esta
--    migracion todavia no esta aplicada (ver los comentarios de cada punto).
-- ============================================================


-- ------------------------------------------------------------
-- 1. BORRAR LA CUENTA TIENE QUE LLEVARSE LOS BLOQUEOS
-- ------------------------------------------------------------
-- A quien bloqueaste es un dato personal y sensible: dice con quien tuviste un
-- problema. Hoy sobrevive al borrado de la cuenta, porque `anonimizar_mi_cuenta()`
-- NO borra `bloqueos` y el `on delete cascade` del FK NUNCA dispara: la fila de
-- `profiles` no se borra, queda como lapida anonima (`eliminado_en`).
--
-- Se borran las filas en LAS DOS direcciones:
--   · `bloqueador = uid` → mis bloqueos, que es el dato personal a proteger.
--   · `bloqueado  = uid` → los bloqueos que OTROS me pusieron. Se borran porque
--     ya no protegen de nada: `delete-account` (paso 4 de su Edge Function)
--     llama a `auth.admin.deleteUser(uid)` justo despues de esta funcion, asi
--     que nadie puede volver a autenticarse como ese id. Dejarlos seria guardar
--     "fulano bloqueo a un fantasma" para siempre.
--
-- `create or replace` alcanza: la firma NO cambia (`() returns void`). Cuerpo
-- copiado VERBATIM de la 0037 (la ultima version) + la linea nueva.
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
  -- Nueva en 0037: las suscripciones de Web Push, mismo motivo que push_tokens.
  delete from public.web_push_subscriptions where user_id = uid;
  -- Nueva en 0041: a quien bloqueaste (y quien te bloqueo). Ver el comentario
  -- largo de arriba: el cascade del FK no dispara porque `profiles` sobrevive.
  delete from public.bloqueos where bloqueador = uid or bloqueado = uid;
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

-- Mismo grant que en 0017/0037: solo alguien con sesion puede invocarla, y solo
-- se borra a si mismo. `create or replace` no toca los grants existentes, pero
-- se repite explicito para que esta migracion quede autocontenida.
revoke all on function public.anonimizar_mi_cuenta() from public, anon;
grant execute on function public.anonimizar_mi_cuenta() to authenticated;


-- ------------------------------------------------------------
-- 2. LARGO MAXIMO EN `denuncias` (validacion de servidor)
-- ------------------------------------------------------------
-- La anon key es publica: el formulario no defiende nada (regla de la casa,
-- ver 0016_validacion_servidor.sql). La 0025 agrego `detalle` sin ningun tope,
-- asi que hoy entra un `detalle` de 5.000 caracteres por API directa y llena la
-- bandeja de quien modera. `motivo` tampoco tenia tope (la app manda una lista
-- cerrada de <=25 caracteres, pero eso es la app).
--
-- ⚠️ Si en la base real existiera una fila que ya viola alguno de estos topes,
--    el `add constraint` FALLA (valida las filas existentes). Es lo correcto:
--    hay que mirar esa fila antes de dejar pasar la restriccion, no ocultarla
--    con un `not valid`.
--
-- Los nombres siguen la convencion `<tabla>_<columna>_largo` de la 0016, que es
-- lo que `src/lib/dbErrors.ts` usa para traducirlos a un mensaje en español.
alter table public.denuncias drop constraint if exists denuncias_motivo_largo;
alter table public.denuncias
  add constraint denuncias_motivo_largo
  check (char_length(motivo) between 1 and 60);

alter table public.denuncias drop constraint if exists denuncias_detalle_largo;
alter table public.denuncias
  add constraint denuncias_detalle_largo
  check (detalle is null or char_length(detalle) <= 500);


-- ------------------------------------------------------------
-- 3. REPONER `denuncias_objeto_por_tipo` (se perdio en silencio)
-- ------------------------------------------------------------
-- HALLAZGO de esta pasada, no estaba en el analisis de brecha:
--
-- La 0025 creo `denuncias_objeto_por_tipo` (cada tipo debe traer su objeto).
-- Despues, la 0030 y la 0032 necesitaron ampliar la lista de `tipo` y, como la
-- 0025 habia creado el CHECK de `tipo` sin nombrarlo, ambas recorrieron
-- `pg_constraint` borrando CUALQUIER CHECK de `public.denuncias` cuya
-- definicion mencionara la columna `tipo`:
--
--     where conrelid = 'public.denuncias'::regclass
--       and contype = 'c'
--       and pg_get_constraintdef(oid) like '%tipo%'
--
-- La definicion de `denuncias_objeto_por_tipo` menciona `tipo` en cada rama, asi
-- que ese barrido TAMBIEN se la llevo, y ninguna de las dos migraciones la
-- repuso. Resultado en la base real de hoy: no existe. Se puede insertar una
-- denuncia de tipo 'mensaje' sin `objeto_id` y queda una fila que no apunta a
-- nada (quien modera ve "acoso" contra la nada).
--
-- Se repone con los DOS tipos que se agregaron despues ('adopcion' de la 0030 y
-- 'pregunta_adopcion' de la 0032), que usan `objeto_id` igual que 'mensaje'.
--
-- ⚠️ TRAMPA PARA EL FUTURO: si alguna migracion posterior vuelve a ampliar
--    `denuncias.tipo` con ese mismo barrido por '%tipo%', se va a llevar esta
--    restriccion OTRA VEZ. Quien la escriba tiene que reponerla (o filtrar el
--    barrido por `conname = 'denuncias_tipo_check'`). Las dos CHECK del punto 2
--    NO corren ese riesgo: su definicion no menciona `tipo`.
alter table public.denuncias drop constraint if exists denuncias_objeto_por_tipo;
alter table public.denuncias add constraint denuncias_objeto_por_tipo check (
  (tipo = 'reporte' and pet_id is not null)
  or (tipo = 'usuario' and usuario_denunciado is not null)
  or (tipo in ('mensaje', 'pista', 'avistamiento', 'adopcion', 'pregunta_adopcion')
      and objeto_id is not null)
);


-- ------------------------------------------------------------
-- 4. GUARD EXPLICITO EN EL TRIGGER DE AUTO-OCULTADO
-- ------------------------------------------------------------
-- `check_denuncias()` (0003) auto-oculta un REPORTE cuando junta 3 denuncias.
-- Desde la 0025 tambien se denuncian personas, mensajes, pistas, avistamientos,
-- adopciones y preguntas: en esos casos `new.pet_id` es NULL, el `count(*)` da 0
-- y no oculta nada. Funciona, pero POR ACCIDENTE — bastaria que alguien agregue
-- un tipo nuevo que si lleve `pet_id` para que tres denuncias a un mensaje
-- oculten un reporte que nadie denuncio.
--
-- El guard lo vuelve correcto por diseño y ademas ahorra un count por cada
-- denuncia que no es de un reporte. `coalesce` por si alguna fila historica
-- quedara con `tipo` nulo (no deberia: la columna es NOT NULL con default).
create or replace function public.check_denuncias()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare total int;
begin
  if coalesce(new.tipo, 'reporte') <> 'reporte' then
    return new;
  end if;
  select count(*) into total from public.denuncias where pet_id = new.pet_id;
  if total >= 3 then
    update public.pets set oculto = true where id = new.pet_id;
  end if;
  return new;
end;
$$;
-- El trigger `denuncias_auto_ocultar` (0003) sigue apuntando a esta funcion:
-- `create or replace` reemplaza el cuerpo sin tocar el trigger.


-- ------------------------------------------------------------
-- 5. CUANDO SE ACEPTARON LOS TERMINOS
-- ------------------------------------------------------------
-- La casilla de "Acepto los Terminos y la Politica de Privacidad" existe en
-- `RegisterScreen` desde la Tanda C, pero no se guardaba NADA: si mañana hay un
-- reclamo, no hay forma de demostrar que esa persona acepto, ni cuando.
--
-- Columna PRIVADA: igual que `fecha_nacimiento` (0024), NO se agrega al
-- `grant select (...)` por columnas de la 0018, asi que ni `anon` ni
-- `authenticated` la pueden leer. Solo la escribe el trigger (security definer).
alter table public.profiles
  add column if not exists terminos_aceptados_en timestamptz;

-- El trigger que crea el perfil ahora tambien sella la aceptacion.
--
-- Se sella con `now()` DEL SERVIDOR y no con una fecha que mande el cliente: un
-- timestamp que escribe el propio usuario no prueba nada. Lo unico que se lee de
-- la metadata es el booleano `acepta_terminos` (que `RegisterScreen` manda en
-- `options.data`), y solo decide si se sella o se deja NULL.
--
-- Compatibilidad hacia atras: una cuenta creada por un camino que no mande ese
-- booleano (o por la app vieja, antes de este cambio) simplemente queda con la
-- columna en NULL, y el registro NO se rompe. Cuerpo copiado de la 0024 + la
-- columna nueva.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, fecha_nacimiento, terminos_aceptados_en)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''), 'Usuario'),
    nullif(new.raw_user_meta_data->>'fecha_nacimiento', '')::date,
    case
      when lower(coalesce(new.raw_user_meta_data->>'acepta_terminos', '')) in ('true', 't', '1')
        then now()
      else null
    end
  );
  return new;
end;
$$;

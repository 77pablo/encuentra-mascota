-- ============================================================
-- OTORGAR (Y QUITAR) LA INSIGNIA INSTITUCIONAL — runbook
--
-- Para: veterinarias, refugios y municipios verificados a mano (migración 0057).
-- Dónde se corre: SQL Editor del panel de Supabase.
--
-- ------------------------------------------------------------
-- POR QUÉ ESTE ARCHIVO EXISTE (leer antes de improvisar)
--
-- Lo obvio NO funciona:
--
--     select public.institucion_otorgar('...uuid...', 'veterinaria', 'Vet Ñuñoa');
--     -- ERROR: no autorizado
--
-- `institucion_otorgar` es `security definer` y su primera línea es
-- `if not public.es_admin() then raise exception 'no autorizado'`. `es_admin()`
-- resuelve con `auth.uid()`, que sale del JWT de la petición. En el SQL Editor
-- NO hay JWT: la consulta entra como `postgres`, `auth.uid()` devuelve NULL, y
-- el gate corta antes de hacer nada.
--
-- Es la misma trampa que ya nos costó una verificación de la 0045: llamar estas
-- funciones desde la Management API tampoco prueba nada, porque entra igual como
-- `postgres`. La salida NO es hacer el `update` a mano —eso saltea la validación
-- del tipo, la normalización del nombre y deja `institucion_verificada_por` en
-- NULL, que es justo el registro de quién firmó— sino ponerse el sombrero del
-- admin dentro de la transacción.
--
-- ------------------------------------------------------------
-- ANTES DE EMPEZAR: hace falta el uuid de un admin y el de la cuenta a verificar.
--
--   select id, nombre, es_admin from public.profiles where es_admin;
--   select id, nombre from auth.users u join public.profiles p on p.id = u.id
--    where u.email = 'contacto@la-veterinaria.cl';
-- ============================================================


-- ------------------------------------------------------------
-- 1) OTORGAR
--
-- Reemplazar los dos uuid y los cuatro datos. Va TODO junto: el `set local`
-- solo vive dentro de la transacción, así que separar los pasos no sirve.
--
-- ⚠️ QUÉ SIGNIFICA CADA VALOR EN `p_comuna` Y `p_contacto` (migración 0058).
-- Los dos tienen `default null`, y desde la 0058 la ausencia y el vacío dejaron
-- de significar lo mismo:
--
--     null   → "no te lo mandé"      → NO se toca lo que ya estaba
--     ''     → "te lo mandé vacío"   → se BORRA lo que ya estaba
--     'Ñuñoa'→ se escribe
--
-- O sea que para corregir SOLO el nombre alcanza con llamarla con tres
-- argumentos, y el teléfono que la insignia venía mostrando se queda donde
-- estaba. Antes de la 0058 esa misma llamada lo borraba en silencio y devolvía
-- éxito. Para vaciar un dato mal cargado, pasale `''` (no null).
--
-- El tipo y el nombre no tienen esta distinción: son obligatorios y siempre se
-- escriben (llamarla sin nombre aborta con "la institucion necesita un nombre
-- publico").
-- ------------------------------------------------------------
begin;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID-DEL-ADMIN","role":"authenticated"}';

  -- Control de que el sombrero quedó puesto. Si esto da `false`, NO sigas: la
  -- llamada de abajo va a fallar con "no autorizado" y no se hizo nada.
  select public.es_admin() as soy_admin;

  select public.institucion_otorgar(
    'UUID-DE-LA-CUENTA'::uuid,
    'veterinaria',              -- 'veterinaria' | 'refugio' | 'municipio'
    'Veterinaria Ñuñoa',        -- nombre público, el que ve la gente
    'Ñuñoa',                    -- comuna:   null = dejar como está,  '' = borrar
    '+56 9 1234 5678'           -- contacto: null = dejar como está,  '' = borrar
  );

commit;


-- ------------------------------------------------------------
-- 2) COMPROBAR que quedó (fuera de la transacción, como cualquiera)
--
-- `institucion_verificada_por` tiene que traer el uuid del admin: si viene en
-- NULL, la insignia se puso por un `update` a mano y no quedó registro de quién
-- firmó.
-- ------------------------------------------------------------
select id,
       institucion_tipo,
       institucion_nombre,
       institucion_comuna,
       institucion_verificada_en,
       institucion_verificada_por
  from public.profiles
 where id = 'UUID-DE-LA-CUENTA';


-- ------------------------------------------------------------
-- 3) QUITARLA (mismo sombrero)
--
-- Limpia las seis columnas de una. Es DEFINITIVO: se usa cuando la institución
-- deja de serlo, o cuando resultó no ser lo que decía.
--
-- Desde la 0058 ya NO hace falta correrlo detrás de cada suspensión: una cuenta
-- suspendida deja de mostrar la insignia sola (el filtro está en `perfil_publico`
-- y en `autor_publico`, los dos caminos por los que la app la dibuja). Los datos
-- se conservan a propósito, porque suspender se puede deshacer (`moderar_reactivar`,
-- 0045) y reactivar tiene que devolver la cuenta a como estaba.
--
-- O sea: para un "refugio" que era una estafa, suspender ya alcanza para que la
-- app deje de ponerle su sello. Esto se corre cuando la decisión es que no
-- vuelve.
-- ------------------------------------------------------------
begin;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID-DEL-ADMIN","role":"authenticated"}';

  select public.institucion_revocar('UUID-DE-LA-CUENTA'::uuid);

commit;

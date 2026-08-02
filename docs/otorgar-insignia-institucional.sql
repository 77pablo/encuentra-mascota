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
-- ⚠️ Pasar SIEMPRE los cinco argumentos. `p_comuna` y `p_contacto` tienen
-- `default null` y el update los pisa igual, así que llamarla con tres
-- argumentos para "corregir el nombre" borra la comuna y el contacto sin decir
-- nada. Si no querés tocarlos, volvé a escribir los valores que ya tenía.
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
    'Ñuñoa',                    -- comuna (o null)
    '+56 9 1234 5678'           -- contacto público (o null)
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
-- Limpia las seis columnas de una. Se usa cuando la institución deja de serlo, y
-- cuando resultó no ser lo que decía: hoy suspender una cuenta NO le saca la
-- insignia, así que si moderación suspende a un "refugio" que era una estafa,
-- hay que correr esto además de suspenderlo.
-- ------------------------------------------------------------
begin;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID-DEL-ADMIN","role":"authenticated"}';

  select public.institucion_revocar('UUID-DE-LA-CUENTA'::uuid);

commit;

-- ============================================================
-- 0058 — TRES AGUJEROS QUE DEJÓ ABIERTOS LA TANDA ANTERIOR
--
--   1. La insignia institucional sobrevivía a la suspensión y al borrado de la
--      cuenta. Un "refugio" verificado que resulta ser una estafa quedaba
--      suspendido —no puede publicar más (RLS, 0036)— pero sus fichas vivas
--      seguían firmadas "Refugio verificado" CON EL SELLO DE LA APP y su perfil
--      público seguía mostrando la insignia con el teléfono. Y en una cuenta
--      borrada, `institucion_nombre` e `institucion_contacto` quedaban legibles
--      para cualquiera: son datos personales de un tercero identificable.
--
--   2. `institucion_otorgar` con tres argumentos borraba la comuna y el
--      contacto. En silencio y devolviendo éxito.
--
--   3. `buscar_coincidencias` no tenía tope de radio, y desde la 0054 es
--      `security definer` con `execute` para `anon`: un barrido de todo el país
--      salía gratis y sin sesión.
--
-- ------------------------------------------------------------------
-- LA DECISIÓN DE FONDO DEL PUNTO 1: SUSPENDER NO DESTRUYE, DEJA DE MOSTRAR
-- ------------------------------------------------------------------
-- Suspender es REVERSIBLE desde la 0045 (`moderar_reactivar`). Si suspender
-- borrara `institucion_nombre` y `institucion_contacto`, reactivar no devolvería
-- la cuenta a como estaba: quedaría una veterinaria de verdad, reactivada
-- después de una denuncia falsa, sin la insignia que se ganó y sin nadie que
-- sepa qué decía. Por eso el filtro NO va en `moderar_suspender`: va en los
-- caminos de LECTURA.
--
-- Borrar la cuenta es al revés y por eso se resuelve al revés: no vuelve nunca,
-- y ahí el nombre y el teléfono de la institución son datos personales de un
-- tercero identificable que no tenemos por qué seguir guardando. Se limpian de
-- verdad. Es la misma regla que ya escribió la 0017: "lo que es solo tuyo se
-- destruye; lo que además es de otro sobrevive sin vos".
--
-- ------------------------------------------------------------------
-- DE QUÉ VERSIÓN PARTE CADA FUNCIÓN QUE SE RECREA (la trampa que ya nos costó)
-- ------------------------------------------------------------------
--   · `anonimizar_mi_cuenta` → de la 0041, NO de la 0017. La 0037 le sumó
--     `web_push_subscriptions` y la 0041 le sumó `bloqueos` (un agujero de
--     privacidad real). Partir de la 0017 —que es la que "crea" la función y la
--     que uno encuentra primero— habría desandado las dos cosas sin que nada se
--     pusiera rojo: el borrado de cuenta seguiría devolviendo 200.
--   · `perfil_publico`       → de la 0057 (que partió de la 0053, que partió de
--     la 0052). Trae las cuatro cuentas, la vigencia de adopciones y lo
--     institucional.
--   · `buscar_coincidencias` → de la 0054 (que partió de la 0029). Trae el
--     cruce de chip, el puntaje de señas y el `security definer`.
--   · `institucion_otorgar`  → de la 0057.
--
-- NINGUNA cambia su tipo de retorno, así que NINGUNA necesita `drop function`.
-- Eso no es pereza: `create or replace` no deja ni un instante sin la función,
-- conserva los grants y no puede fallar por una firma mal escrita en el drop
-- (que es silenciosa y deja DOS versiones conviviendo, con PostgREST devolviendo
-- error de ambigüedad). Igual, al final hay un bloque de autoverificación con la
-- idea de la 0054, porque el modo de fallar de esto es callado.
--
-- ------------------------------------------------------------------
-- LA WEB TIENE QUE ANDAR CON ESTA MIGRACIÓN SIN APLICAR, Y AL REVÉS
-- ------------------------------------------------------------------
--   · `autor_publico` es una RPC NUEVA. Si la app sube antes que el SQL, la
--     llamada devuelve PGRST202 y `getAutorPublico` cae al camino de siempre
--     (select directo sobre `profiles`), que sigue existiendo: la firma
--     "Publicado por …" no desaparece de ninguna ficha.
--   · Al revés (SQL aplicado y app vieja todavía en algún navegador con el
--     bundle cacheado) también anda: esta migración NO le quita a nadie el
--     `grant select` sobre las columnas `institucion_*`. Quitarlo habría sido
--     tentador —cerraría el select directo— pero le habría devuelto 42501 a la
--     app vieja, y `esColumnaInexistente` no lo reconoce: la fila "Publicado
--     por …" se borraría de TODAS las fichas hasta que cada visitante recargara.
--     Es exactamente el bug que documenta __tests__/services/
--     institucionEnLosPerfiles.test.ts, y no vale la pena pagarlo: esas columnas
--     son públicas A PROPÓSITO desde la 0057 ("el teléfono de una veterinaria es
--     su cartel en la vereda") y lo que esta migración corrige es qué FIRMA la
--     app, no qué se puede leer con un cliente hecho a mano. Para la cuenta
--     borrada, que sí es un problema de datos, el arreglo es destruir el dato —
--     y un grant no puede filtrar lo que ya no está.
-- ============================================================


-- ------------------------------------------------------------------
-- 1) LA REGLA DE CUÁNDO SE MUESTRA LA INSIGNIA, ESCRITA UNA SOLA VEZ
-- ------------------------------------------------------------------
-- Vive en una función y no repetida dentro de cada consulta porque la usan DOS
-- caminos de lectura distintos: el perfil público de la institución
-- (`perfil_publico`) y la firma "Publicado por …" de una ficha
-- (`autor_publico`). Si la condición estuviera copiada, el día que alguien
-- afloje una de las dos, el perfil diría una cosa y la ficha otra sobre
-- exactamente la misma cuenta — que es como se ven estos bugs cuando aparecen:
-- media app arreglada.
--
-- Devuelve CERO filas cuando no hay insignia que mostrar, y los dos llamadores
-- la usan con `left join lateral … on true`, así que las cinco columnas les
-- llegan en NULL. Se anulan las CINCO y no solo la fecha: con `institucion_nombre`
-- viajando al cliente, alcanza que una pantalla futura lo lea sin pasar por
-- `institucionDe` para que el nombre del "refugio" suspendido vuelva a salir en
-- pantalla. Fail-closed, el criterio de la 0018.
--
-- `eliminado_en` está de más hoy (los dos llamadores ya filtran la lápida) y se
-- queda igual: esta función es la definición de "insignia mostrable", y una
-- lápida no lo es por su cuenta, no porque alguien se acuerde de filtrarla.
create or replace function public._insignia_publica(p_user_id uuid)
returns table (
  institucion_tipo text,
  institucion_nombre text,
  institucion_comuna text,
  institucion_contacto text,
  institucion_verificada_en timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.institucion_tipo, p.institucion_nombre, p.institucion_comuna,
         p.institucion_contacto, p.institucion_verificada_en
  from public.profiles p
  where p.id = p_user_id
    -- EL ARREGLO. Suspendido = la app deja de poner su sello, sin perder el dato.
    and p.suspendido_en is null
    and p.eliminado_en is null;
$$;

-- No se le concede `execute` a NADIE, igual que `_denunciado_de` (0040): la
-- llaman dos funciones `security definer`, que corren con el rol del owner sin
-- importar los grants del cliente. Concederla sería regalar un oráculo de
-- `suspendido_en`, que la 0036 no le expuso nunca a nadie: comparar lo que
-- devuelve esta función con lo que devuelve un select directo sobre `profiles`
-- dice, de cualquier cuenta institucional, si moderación la suspendió.
revoke all on function public._insignia_publica(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------------
-- 2) `perfil_publico` — el perfil de la institución
-- ------------------------------------------------------------------
-- Copia EXACTA de la 0057 salvo dos cosas: las cinco columnas de institución
-- salen del helper de arriba, y aparece el `left join lateral`. Lo demás
-- (las cuatro cuentas, la vigencia de adopciones idéntica a la del feed de la
-- 0052, el `eliminado_en is null`) se conserva letra por letra; hay tests que
-- lo cruzan contra la 0057 y contra la 0052.
create or replace function public.perfil_publico(p_user_id uuid)
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  red_social text,
  creado_en timestamptz,
  reencuentros bigint,
  reportes bigint,
  aportes bigint,
  adopciones bigint,
  institucion_tipo text,
  institucion_nombre text,
  institucion_comuna text,
  institucion_contacto text,
  institucion_verificada_en timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.id, p.nombre, p.foto_perfil, p.red_social, p.creado_en,
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.reunida_en is not null and pe.oculto = false),
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.oculto = false),
    (select count(*) from public.sightings s where s.user_id = p.id)
      + (select count(*) from public.pet_tips t where t.user_id = p.id),
    (select count(*) from public.adoptions ad
       where ad.user_id = p.id and ad.activo = true and ad.oculto = false
         and ad.adoptada_en is null
         -- IDENTICA a la de `buscar_adopciones` (0052) y a la de la 0053.
         and coalesce(ad.renovado_en, ad.creado_en) >= now() - interval '90 days'),
    i.institucion_tipo,
    i.institucion_nombre,
    i.institucion_comuna,
    i.institucion_contacto,
    i.institucion_verificada_en
  from public.profiles p
  left join lateral public._insignia_publica(p.id) i on true
  where p.id = p_user_id
    -- Las cuentas borradas (lapidas) no exponen perfil publico -> cero filas.
    and p.eliminado_en is null;
$$;

-- `create or replace` conserva los grants, pero se repiten explícitos para que
-- esta migración quede autocontenida (mismo criterio que la 0041). El perfil
-- público es PÚBLICO: sin el grant a `anon`, un invitado deja de ver el perfil
-- de la veterinaria.
revoke all on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to anon;
grant execute on function public.perfil_publico(uuid) to authenticated;


-- ------------------------------------------------------------------
-- 3) `autor_publico` — la firma "Publicado por …" de una ficha
-- ------------------------------------------------------------------
-- ESTA RPC ES NUEVA Y ES LA MITAD IMPORTANTE DEL ARREGLO 1. Sin ella el filtro
-- no sirve de nada: el perfil público de un refugio lo abre poca gente, pero la
-- firma con el sello sale en CADA ficha que publicó, que es donde la insignia
-- convence a alguien de entregar un animal o de hacer una transferencia.
--
-- Hasta hoy esa firma la leía el cliente con un `select` directo sobre
-- `profiles` (`getAutorPublico`, src/services/profile.ts). Ese camino no se
-- puede arreglar del lado de la base: esconder la insignia de una cuenta
-- suspendida es un filtro por el VALOR de `suspendido_en`, y los grants por
-- columna de la 0018 no saben de condiciones — conceden o no conceden. Una
-- policy de RLS podría esconder la FILA entera, pero eso se llevaría puesto
-- también el `nombre`, o sea la firma completa de todo suspendido, que no es lo
-- que se pidió (y rompería el chat, que muestra el nombre del otro).
--
-- Devuelve `nombre` además de la institución para que la ficha siga resolviendo
-- la firma en UNA sola consulta, como desde la 0057.
create or replace function public.autor_publico(p_user_id uuid)
returns table (
  nombre text,
  institucion_tipo text,
  institucion_nombre text,
  institucion_comuna text,
  institucion_contacto text,
  institucion_verificada_en timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.nombre,
         i.institucion_tipo, i.institucion_nombre, i.institucion_comuna,
         i.institucion_contacto, i.institucion_verificada_en
  from public.profiles p
  left join lateral public._insignia_publica(p.id) i on true
  where p.id = p_user_id
    -- Una lápida no se firma ni se enlaza: cero filas, y el cliente ya trata
    -- "sin filas" como "sin autor" (lo mismo que hacía con `eliminado_en`).
    and p.eliminado_en is null;
$$;

-- Se lee sin cuenta a propósito: la ficha entera es pública (modo invitado).
revoke all on function public.autor_publico(uuid) from public;
grant execute on function public.autor_publico(uuid) to anon;
grant execute on function public.autor_publico(uuid) to authenticated;


-- ------------------------------------------------------------------
-- 4) BORRAR LA CUENTA SÍ SE LLEVA LA INSTITUCIÓN
-- ------------------------------------------------------------------
-- Cuerpo copiado VERBATIM de la 0041 (la versión viva: 0017 → 0037 sumó
-- `web_push_subscriptions` → 0041 sumó `bloqueos`) más las cinco columnas
-- nuevas. La firma no cambia (`() returns void`), así que `create or replace`.
--
-- POR QUÉ LAS CINCO Y NO SOLO EL NOMBRE: `profiles_institucion_completa` (0057)
-- exige que si `institucion_verificada_en` no es null, entonces haya tipo y
-- nombre. Limpiar el nombre dejando la fecha viola el CHECK y hace fallar el
-- `update` ENTERO — o sea que borrar la cuenta empezaría a devolver error justo
-- para las cuentas institucionales, después de haber borrado ya sus reportes.
-- Las cinco juntas o ninguna.
--
-- `institucion_verificada_por` NO se limpia, y es la única excepción a propósito:
-- ese uuid es del ADMIN que firmó la verificación, no de quien se está borrando.
-- Es la regla de la 0017 otra vez ("lo que además es de otro sobrevive sin vos")
-- y es el único rastro que queda de quién puso el sello en una cuenta que
-- terminó mal. Nadie lo puede leer: la 0057 lo dejó fuera del `grant select` a
-- propósito, justamente por ser un dato interno de moderación.
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
  -- Nueva en 0041: a quien bloqueaste (y quien te bloqueo). El cascade del FK no
  -- dispara porque `profiles` sobrevive como lapida.
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
         -- NUEVO (0058). El nombre publico y el contacto de la institucion son
         -- datos personales de un tercero identificable: una veterinaria es una
         -- direccion, un telefono y una persona detras. La cuenta no vuelve.
         institucion_tipo = null,
         institucion_nombre = null,
         institucion_comuna = null,
         institucion_contacto = null,
         institucion_verificada_en = null,
         eliminado_en = now()
   where id = uid;

  return;
end;
$$;

-- Mismo grant de siempre (0017/0037/0041): solo alguien con sesion puede
-- invocarla, y solo se borra a si mismo.
revoke all on function public.anonimizar_mi_cuenta() from public, anon;
grant execute on function public.anonimizar_mi_cuenta() to authenticated;

-- LAS LÁPIDAS QUE YA EXISTEN. Arreglar la función solo cubre los borrados de
-- mañana; quien se borró entre la 0057 y hoy tiene su `institucion_nombre` y su
-- `institucion_contacto` legibles para cualquiera (el `grant select` de la 0057
-- es para todos). Son pocas o ninguna —la 0057 tiene días— y justamente por eso
-- sale gratis dejarlo limpio ahora en vez de escribirlo en una lista de
-- pendientes que nadie va a mirar.
--
-- El `where` mira `eliminado_en is not null`: NO puede tocar una cuenta viva ni
-- por accidente. Y la segunda condición lo vuelve re-ejecutable de verdad: la
-- segunda corrida afecta cero filas en vez de reescribir NULL sobre NULL.
update public.profiles
   set institucion_tipo = null,
       institucion_nombre = null,
       institucion_comuna = null,
       institucion_contacto = null,
       institucion_verificada_en = null
 where eliminado_en is not null
   and (institucion_tipo is not null
     or institucion_nombre is not null
     or institucion_comuna is not null
     or institucion_contacto is not null
     or institucion_verificada_en is not null);


-- ------------------------------------------------------------------
-- 5) `institucion_otorgar` — corregir un dato deja de borrar los otros
-- ------------------------------------------------------------------
-- EL BUG. `p_comuna` y `p_contacto` tienen `default null` y el `update` los
-- pisaba incondicionalmente, así que la llamada de tres argumentos —la que uno
-- escribe para corregir un nombre mal tipeado, y que el propio comentario de la
-- 0057 daba por prevista ("`coalesce` para no reescribir la fecha original al
-- corregir un dato")— borraba el teléfono que la insignia venía mostrando. En
-- silencio y devolviendo éxito. El `coalesce` defensivo estaba puesto en la
-- única columna que nadie iba a pisar por accidente.
--
-- EL CRITERIO. Un `coalesce` a secas arregla el borrado accidental y crea otro
-- problema: deja de haber forma de BORRAR una comuna o un contacto que se cargó
-- mal, y la única salida sería `institucion_revocar` + volver a otorgar, que
-- reinicia `institucion_verificada_en` — o sea que corregir una errata le
-- borraría la antigüedad a la verificación, que es parte de la confianza. Por
-- eso las dos operaciones se distinguen por lo que se manda:
--
--     null           → "no te lo mandé"     → no se toca
--     '' (o espacios)→ "te lo mandé vacío"  → se borra
--     'Ñuñoa'        → se escribe
--
-- No es una convención inventada acá: es la que ya usaba la función para el
-- valor final (`nullif(btrim(...), '')` guarda NULL cuando le llega vacío). Lo
-- único que cambia es que ahora la ausencia y el vacío dejan de significar lo
-- mismo. El runbook (docs/otorgar-insignia-institucional.sql) lo documenta con
-- las dos formas escritas, y hay un test que ata el runbook a esta firma.
--
-- La FIRMA NO CAMBIA (los mismos cinco parámetros, en el mismo orden): el
-- runbook, `__tests__/db/otorgarInsignia.test.ts` y cualquier llamada guardada
-- siguen siendo válidos, y `create or replace` alcanza.
create or replace function public.institucion_otorgar(
  p_user_id uuid,
  p_tipo text,
  p_nombre text,
  p_comuna text default null,
  p_contacto text default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  if p_tipo is null or p_tipo not in ('veterinaria', 'refugio', 'municipio') then
    raise exception 'tipo de institucion invalido: %', coalesce(p_tipo, '(null)');
  end if;
  if v_nombre is null then
    raise exception 'la institucion necesita un nombre publico';
  end if;

  update public.profiles set
    institucion_tipo = p_tipo,
    institucion_nombre = v_nombre,
    -- `null` = no vino en la llamada = se conserva lo que había. Cualquier otra
    -- cosa se escribe, y vacío significa borrar (ver el criterio de arriba).
    institucion_comuna = case
      when p_comuna is null then institucion_comuna
      else nullif(btrim(p_comuna), '')
    end,
    institucion_contacto = case
      when p_contacto is null then institucion_contacto
      else nullif(btrim(p_contacto), '')
    end,
    -- `coalesce` para no reescribir la fecha original al corregir un dato: la
    -- antiguedad de la verificacion es parte de la confianza.
    institucion_verificada_en = coalesce(institucion_verificada_en, now()),
    institucion_verificada_por = auth.uid()
  where id = p_user_id and eliminado_en is null;

  -- Un "listo" sobre una cuenta que no existe (o que es una lapida) es peor que
  -- un error a la vista: es el mismo criterio que `moderar_reactivar` (0045).
  if not found then raise exception 'no existe esa cuenta, o esta eliminada'; end if;
end;
$$;
revoke all on function public.institucion_otorgar(uuid, text, text, text, text) from public, anon;
grant execute on function public.institucion_otorgar(uuid, text, text, text, text) to authenticated;


-- ------------------------------------------------------------------
-- 6) `buscar_coincidencias` — tope de radio
-- ------------------------------------------------------------------
-- Cuerpo copiado VERBATIM de la 0054 (la versión viva) con UN cambio: el radio
-- pasa por el mismo tratamiento que ya tenía `p_limite`.
--
--     antes:  st_dwithin(…, p_radio_km * 1000)
--     ahora:  st_dwithin(…, least(coalesce(p_radio_km, 15), 50) * 1000)
--
-- POR QUÉ 50. No es un número redondo elegido a ojo: es el radio más ancho que
-- la app pide en cualquier pantalla. `radioSugerido` (src/lib/radioSugerido.ts)
-- tiene su `topeKm` más grande en 50 (especie 'otro', el perfil conservador), y
-- el botón más ancho de Explorar (`OPCIONES_RADIO_EXPLORAR`) también es 50. Un
-- test cruza el número de acá contra ese archivo, así que si mañana alguien
-- amplía el tope del cliente y se olvida de este, se pone rojo en vez de
-- empezar a recortar búsquedas legítimas en silencio.
--
-- Y por qué hace falta un tope: esta función es `security definer` con `execute`
-- para `anon` desde la 0054. Sin tope, `p_radio_km = 20000` es un barrido de
-- Chile entero —4.300 km de largo— contra `pets`, sin sesión, tantas veces
-- seguidas como se quiera; y un `st_dwithin` que abarca todo deja de aprovechar
-- el índice geográfico, así que cada llamada es un scan. 50 km sigue siendo más
-- ancho que el Gran Santiago de punta a punta: no le recorta la búsqueda a
-- nadie que esté buscando de verdad.
--
-- El `coalesce` no es decorativo: `p_radio_km` tiene default 15, pero mandarle
-- NULL explícito (`p_radio_km: null` desde el cliente) hacía que `st_dwithin`
-- devolviera NULL y la lista saliera VACÍA, sin error. Ahora un null se trata
-- como el default, igual que `p_limite` desde la 0014.
--
-- Sigue siendo `create or replace`: el tipo de retorno no cambia, así que no
-- hace falta el `drop` de la 0054 (y no hacerlo conserva los grants a `anon` y
-- `authenticated` sin depender de que se repitan bien).
create or replace function public.buscar_coincidencias(
  p_pet_id uuid,
  p_radio_km double precision default 15,
  p_limite int default 10
)
returns table (
  id uuid,
  estado pet_estado,
  especie pet_especie,
  nombre text,
  descripcion text,
  fotos text[],
  lat double precision,
  lng double precision,
  creado_en timestamptz,
  distancia_km double precision,
  chip_coincide boolean,
  puntaje int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select
      p.id, p.estado, p.especie, p.ubicacion,
      p.colores, p.tamano, p.sexo, p.esterilizado,
      -- EL CHIP SOLO SE CRUZA PARA EL DUEÑO DEL REPORTE QUE SE CONSULTA.
      --
      -- Esta función es `security definer` y tiene `execute` para `anon`, así
      -- que cualquiera puede pedir las coincidencias de CUALQUIER reporte. Si
      -- `chip_coincide` saliera para todos, sería un oráculo: creo un reporte,
      -- le escribo un chip candidato, pregunto por la mascota de la víctima y
      -- la respuesta me dice si adiviné. Con eso el estafador que dice "la
      -- tengo" pasa a poder recitar el chip y se vuelve indistinguible del
      -- dueño — exactamente contra lo que argumenta la cabecera de este
      -- archivo para no publicar el número. Y encima el cartel de la ficha le
      -- decía "el chip coincide con EL TUYO" a un desconocido.
      --
      -- `coalesce` obligatorio: sin sesión `auth.uid()` es NULL y la comparación
      -- da NULL, no false. Un NULL acá se propagaría a `chip_coincide` (que
      -- promete no ser nunca nulo) y al `order by`.
      coalesce(p.user_id = auth.uid(), false) as es_mio,
      (
        select c.chip_norm
        from public.pet_chips c
        where c.pet_id = p.id and c.chip_norm <> ''
      ) as chip_norm
    from public.pets p
    where p.id = p_pet_id
      -- Lo que antes ponía la RLS y ahora hay que repetir (security definer).
      and p.oculto = false
      and (p.activo = true or p.user_id = auth.uid())
  ),
  cand as (
    select
      p.id, p.estado, p.especie, p.nombre, p.descripcion, p.fotos,
      p.lat, p.lng, p.creado_en,
      st_distance(p.ubicacion, b.ubicacion) / 1000.0 as distancia_km,
      -- Nunca NULL: si alguno de los dos no tiene chip, es `false`. Y `es_mio`
      -- adelante: para un tercero (o para `anon`) el chip no se cruza nunca.
      (b.es_mio and b.chip_norm is not null and c.chip_norm is not null and c.chip_norm <> ''
        and b.chip_norm = c.chip_norm) as chip_coincide,
      b.colores as b_colores, b.tamano as b_tamano, b.sexo as b_sexo,
      b.esterilizado as b_esterilizado,
      p.colores, p.tamano, p.sexo, p.esterilizado,
      public.senas_puntaje(
        b.colores, p.colores, b.tamano, p.tamano,
        b.sexo, p.sexo, b.esterilizado, p.esterilizado,
        st_distance(p.ubicacion, b.ubicacion) / 1000.0,
        (b.es_mio and b.chip_norm is not null and c.chip_norm is not null and c.chip_norm <> ''
          and b.chip_norm = c.chip_norm)
      ) as puntaje
    from public.pets p
    cross join base b
    left join public.pet_chips c on c.pet_id = p.id
    where p.id <> b.id
      and p.activo = true
      and p.oculto = false
      and p.reunida_en is null
      -- Vigencia (func.3, migración 0029): un reporte vencido no se sugiere.
      and coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'
      -- Estado opuesto: a un perdido le sugerimos encontrados, y viceversa.
      and p.estado <> b.estado
      -- Especie compatible: 'otro' hace de comodín en cualquiera de los dos lados.
      and (p.especie = b.especie or p.especie = 'otro' or b.especie = 'otro')
      -- EL TOPE (0058). Mismo tratamiento que `p_limite`: coalesce para el null
      -- explícito, least para el techo. Ver la cabecera de esta sección.
      and st_dwithin(p.ubicacion, b.ubicacion, least(coalesce(p_radio_km, 15), 50) * 1000)
  )
  -- TODAS las referencias van CALIFICADAS con `cand.`, incluida la del ORDER BY.
  -- No es estilo: las columnas del `returns table (...)` son parámetros OUT y
  -- están en alcance dentro del cuerpo, así que un `puntaje` pelado es ambiguo
  -- entre la salida y la columna de la CTE, y Postgres lo rechaza. Es el mismo
  -- motivo por el que la 0028 y la 0029 califican absolutamente todo.
  select
    cand.id, cand.estado, cand.especie, cand.nombre, cand.descripcion, cand.fotos,
    cand.lat, cand.lng, cand.creado_en, cand.distancia_km, cand.chip_coincide,
    cand.puntaje
  from cand
  -- Un chip igual gana sobre cualquier contradicción: alguien pudo describir mal
  -- el color, pero el chip es el chip.
  where cand.chip_coincide
     or not public.senas_contradicen(cand.b_colores, cand.colores, cand.b_tamano, cand.tamano)
  order by cand.chip_coincide desc, cand.puntaje desc, cand.distancia_km asc, cand.id
  limit least(coalesce(p_limite, 10), 50);
$$;

-- Se repiten explícitos aunque `create or replace` los conserve: quien lea este
-- archivo tiene que poder ver de un vistazo quién puede llamar a una función
-- `security definer` que lee `pet_chips`.
revoke all on function public.buscar_coincidencias(uuid, double precision, int) from public;
grant execute on function public.buscar_coincidencias(uuid, double precision, int) to anon;
grant execute on function public.buscar_coincidencias(uuid, double precision, int) to authenticated;


-- ------------------------------------------------------------------
-- 7) AUTOVERIFICACIÓN
-- ------------------------------------------------------------------
-- Ninguna función de este archivo se dropea, así que la trampa clásica (un
-- `drop function if exists` con la firma incompleta que no borra nada, no falla,
-- y deja DOS versiones conviviendo hasta que PostgREST devuelve error de
-- ambigüedad) no debería poder pasar acá. Pero justamente por eso conviene
-- comprobarlo: si en la base ya existiera una sobrecarga vieja de alguna de
-- estas —por una migración a mano, por un ambiente que quedó a medio aplicar—,
-- este `create or replace` no la toca y no dice nada, y el error aparecería en
-- producción como "could not choose the best candidate function".
--
-- Es la idea del bloque final de la 0054, extendida a las seis.
do $$
declare
  n int;
  f text;
begin
  foreach f in array array[
    '_insignia_publica', 'perfil_publico', 'autor_publico',
    'anonimizar_mi_cuenta', 'institucion_otorgar', 'buscar_coincidencias'
  ]
  loop
    select count(*) into n from pg_proc
     where pronamespace = 'public'::regnamespace and proname = f;
    if n <> 1 then
      raise exception '% quedo con % firma(s): hay una sobrecarga viva', f, n;
    end if;
  end loop;
end $$;

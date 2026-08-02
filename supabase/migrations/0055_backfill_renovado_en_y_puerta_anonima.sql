-- ============================================================
-- DEUDA VIEJA: EL BACKFILL QUE LA 0028 NO HIZO + LA PUERTA ANONIMA
-- (Tanda 12 · Tarea B)
--
-- Dos arreglos que no comparten codigo pero si el mismo defecto de origen:
-- algo que se escribio con una intencion y quedo haciendo otra cosa, en
-- silencio, en produccion.
--
--   1. `pets.renovado_en` quedo anclado al DIA DE LA 0028 en vez de a la
--      creacion del reporte, asi que el auto-archivado perezoso no archivo
--      nada. Aca se corrigen los DATOS (la 0028 no se toca).
--   2. `avistar_sin_cuenta` (0050) descartaba en silencio todo aviso que
--      llegara dentro de 5 minutos de otro DEL MISMO REPORTE. Aca el corte pasa
--      a mirar el CONTENIDO, y ademas el bloqueo empieza a valer cuando hay
--      sesion.
--
-- LA WEB TIENE QUE ANDAR CON ESTE SQL SIN APLICAR, y anda:
--   · no se agrega, cambia ni borra ninguna columna: cero riesgo del 400 de
--     PostgREST por pedir una columna que todavia no existe;
--   · `avistar_sin_cuenta` se recrea con LA MISMA FIRMA y el mismo
--     `returns void`, asi que el cliente (`src/services/avisoAnonimo.ts`) llama
--     exactamente igual antes y despues;
--   · el arreglo de datos solo mueve fechas hacia atras. Sin aplicar, la app se
--     comporta como viene comportandose desde el 21 de julio.
-- ============================================================


-- ------------------------------------------------------------
-- 1. `pets.renovado_en`: anclar a la creacion lo que la 0028 anclo a su propio dia
--
-- QUE PASO. La 0028 hizo, en este orden:
--     alter table public.pets add column renovado_en timestamptz default now();
--     update public.pets set renovado_en = creado_en where renovado_en is null;
-- Postgres rellena las filas que YA EXISTIAN con el default dentro del mismo
-- ALTER (`now()` es stable, no volatile: se evalua UNA sola vez y se guarda como
-- valor faltante). Cuando corrio el update ya no quedaba ni una fila en null, y
-- toco cero filas. El comentario de la 0028 dice que los reportes viejos se
-- anclan a su creacion; su SQL los anclo al dia de la migracion. La 0052 ya
-- documento el bug y lo evito en `adoptions` con tres pasos (columna sin default
-- → backfill → set default). Faltaba arreglar los datos de `pets`.
--
-- LO DELICADO: distinguir un reporte con el `renovado_en` falso de la 0028 de
-- uno que el dueño renovo DE VERDAD despues. Si se confunden, o se le
-- desarchivan reportes viejos a todo el mundo, o —peor— se le archiva uno que
-- alguien acaba de renovar.
--
-- EL CRITERIO, y por que es seguro:
--
--   (a) Antes de la 0028 la columna NO EXISTIA. Nadie pudo renovar nada antes
--       del ALTER. Por lo tanto, para toda fila que existia en ese momento,
--       `renovado_en` vale HOY exactamente una de dos cosas: el sello del ALTER
--       (nunca se renovo) o algo ESTRICTAMENTE POSTERIOR (se renovo despues).
--   (b) Ese sello es el MISMO microsegundo para todas: `now()` se evaluo una
--       sola vez. No es un rango, es un valor puntual.
--   (c) Una fila creada DESPUES de la 0028 nace con `renovado_en = creado_en`
--       (los dos `now()` de la misma transaccion de insert), asi que jamas
--       cumple `renovado_en > creado_en` mientras no se la renueve.
--   (d) De (a)+(c): el MINIMO `renovado_en` entre las filas con
--       `renovado_en > creado_en` ES el sello, siempre que quede al menos un
--       reporte viejo sin renovar. Se deriva del dato, no se escribe a mano.
--   (e) Y como la derivacion de (d) falla si TODOS los reportes viejos fueron
--       renovados (devolveria la renovacion mas temprana), el resultado se
--       valida contra la ventana en que se escribio la 0028: el 2026-07-21
--       (`git log --diff-filter=A -- supabase/migrations/0028_ciclo_vida.sql`).
--       La 0027 es del mismo dia 13:02 y la 0031 del 22 a las 12:54; se toma el
--       21 y el 22 completos. Si el valor derivado cae fuera, NO se actualiza
--       nada y se avisa por NOTICE. Ante la duda, no se tocan los datos.
--
-- Y la red de seguridad final, que no depende del criterio: el UPDATE lleva
-- `creado_en < renovado_en` en el WHERE, asi que POR CONSTRUCCION solo puede
-- mover la fecha HACIA ATRAS. Aunque el sello estuviera mal elegido, esta
-- migracion no puede desarchivarle un reporte a nadie.
--
-- Que se ve al aplicarlo: los reportes de mas de 45 dias sin renovar salen de
-- las busquedas y del mapa, que es lo que la 0028 queria desde el principio. No
-- se borra nada, el dueño los trae de vuelta con un toque desde "Mis reportes",
-- y `src/lib/avisoVigencia.ts` ya se lo dice con todas las letras.
-- ------------------------------------------------------------
do $$
declare
  -- Ventana en que se escribio la 0028 (ver historial de git, arriba). Solo
  -- VALIDA el sello derivado; no lo produce.
  v_desde constant timestamptz := timestamptz '2026-07-21 00:00:00-04';
  v_hasta constant timestamptz := timestamptz '2026-07-23 00:00:00-04';
  v_sello timestamptz;
  v_filas bigint;
begin
  select min(renovado_en) into v_sello
    from public.pets
   where renovado_en is not null
     and creado_en < renovado_en;

  if v_sello is null then
    raise notice '0055: no hay ninguna fila con renovado_en > creado_en. No se toca nada.';
    return;
  end if;

  if v_sello < v_desde or v_sello >= v_hasta then
    raise notice
      '0055: el candidato a sello de la 0028 (%) cae fuera de la ventana [%, %). Es una renovacion real, no el sello: NO se actualiza nada.',
      v_sello, v_desde, v_hasta;
    return;
  end if;

  update public.pets
     set renovado_en = creado_en
   where renovado_en = v_sello      -- igualdad EXACTA: nunca se renovo
     and creado_en < v_sello        -- ya existia cuando corrio la 0028
     and creado_en < renovado_en;   -- invariante: solo hacia atras

  get diagnostics v_filas = row_count;
  raise notice '0055: sello de la 0028 = %; reportes reanclados a su creacion: %', v_sello, v_filas;
end $$;


-- ------------------------------------------------------------
-- 2. `avistar_sin_cuenta`: que el rate-limit deje de silenciar avisos ajenos
--
-- COMO ESTABA (0050): si existia CUALQUIER `avistamiento_anonimo` de ese
-- `pet_id` en los ultimos 5 minutos, la RPC retornaba en silencio. Dos
-- consecuencias, y la segunda es la grave:
--   (a) tres vecinos que escanean el mismo afiche en un minuto veian "Listo, su
--       familia ya sabe" y solo el primero aviso — los otros dos podian ser los
--       que traian el dato util ("la tengo agarrada en la plaza");
--   (b) el `pet_id` es publico: un script que llame la RPC cada 4 minutos ocupa
--       el cupo para siempre y DESCARTA EN SILENCIO todos los avisos legitimos
--       de ese reporte. Un boton para silenciar la busqueda de otro, gratis.
--
-- QUE SE PUEDE USAR SIN CUENTA. Casi nada: no hay sesion, no hay dispositivo, y
-- meter una huella (IP, user-agent) seria construir un identificador
-- pseudonimo de gente que vino con la promesa explicita de no dejar rastro.
-- Se descarto por eso, no por dificultad.
--
-- LO QUE SI SE PUEDE, Y ES LO QUE HACE ESTA VERSION: dejar de tratar "otro
-- aviso" como "el mismo aviso". El corte pasa a comparar el CONTENIDO —nota
-- normalizada y punto redondeado— dentro de la misma ventana de 5 minutos:
--   · el martilleo del boton, que es para lo que se escribio el rate-limit,
--     se sigue descartando (misma nota, mismo punto, o los dos vacios);
--   · tres vecinos que escriben cosas distintas pasan los tres;
--   · quien ocupa el cupo con basura ya solo se descarta A SI MISMO. Sigue
--     pudiendo hacer ruido, pero ya no puede callar a nadie. Cambiar censura
--     invisible por spam visible es un cambio bueno: el dato le llega igual a
--     la familia.
--
-- LO QUE ESTO NO ARREGLA, dicho claro: nada impide inundar la cola con notas
-- distintas. No hay tope por volumen a proposito — CUALQUIER tope por reporte
-- se puede ocupar desde afuera con el mismo `pet_id` publico, y eso nos
-- devolveria justo el bug (b) que estamos sacando. El abuso por VOLUMEN se
-- ataja en la capa de pedidos (rate-limit del gateway), no en SQL, y no es algo
-- que esta migracion pueda desplegar.
--
-- SE MANTIENE TODO LO DEMAS DE LA 0050 sin tocar: `security definer` con
-- search_path fijo, `returns void`, el silencio ante reportes inexistentes /
-- cerrados / ocultos, el recorte de la nota, `actor_id` en null y los grants.
-- `create or replace` alcanza porque el tipo de retorno no cambia; sin drop no
-- hay ni un milisegundo en que la puerta anonima no exista.
--
-- ------------------------------------------------------------
-- 3. EL BLOQUEO EN LA PUERTA ANONIMA (y hasta donde llega)
--
-- El agujero: `avistar_sin_cuenta` fija `actor_id = null` y el filtro de
-- bloqueos exige `actor_id is not null`, asi que alguien bloqueado que CIERRA
-- SESION y abre el link publico le escribe igual a quien lo bloqueo — con 500
-- caracteres libres que le llegan por correo y por push.
--
-- LO QUE SE ARREGLA: si hay sesion, se pregunta por `bloqueos` en los dos
-- sentidos (mismo criterio que `hay_bloqueo_con`, 0022) y se retorna en
-- silencio. Cubre el caso realista —el bloqueado que abre el link publico en la
-- misma pestaña donde tiene la sesion abierta, o que lo prueba sin darse
-- cuenta de que sigue logueado— y cuesta una consulta.
--
-- LO QUE NO TIENE ARREGLO, Y NO SE FINGE QUE LO TENGA: quien CIERRA SESION (o
-- abre una ventana privada) es, para la base, indistinguible de un vecino
-- cualquiera. No hay nada que consultar. Cerrarlo pediria identificar a todo el
-- mundo que avisa, que es exactamente lo que esta pantalla existe para no
-- hacer, y el remedio seria peor: la persona que tiene al animal en brazos es
-- la que se quedaria afuera. La mitigacion real vive en el otro extremo: el
-- aviso anonimo NO abre un canal de chat, no acepta fotos y se recorta a 500
-- caracteres, asi que el acoso posible es un mensaje suelto, no una
-- conversacion; y el dueño puede cerrar u ocultar el reporte, que corta la RPC
-- entera. Queda documentado aca para que nadie lo redescubra creyendo que es
-- un descuido.
--
-- Se consulta `public.bloqueos` directo y no `hay_bloqueo_con(uuid)` a
-- proposito: esa funcion esta revocada para `anon`, y aunque desde una funcion
-- definer el permiso se evalue con el rol dueño, hacer depender la puerta
-- anonima de esa cadena de grants es una forma barata de romperla el dia que
-- alguien reordene los permisos. Esta funcion ya es definer: lee la tabla y
-- listo.
--
-- Y NO SE GUARDA QUIEN ES: se PREGUNTA por la sesion, no se la registra.
-- `actor_id` sigue yendo en null, que es la promesa que hace la pantalla.
-- ------------------------------------------------------------
create or replace function public.avistar_sin_cuenta(
  p_pet_id uuid,
  p_nota text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pet public.pets%rowtype;
  v_nota_norm text;
  v_lat numeric;
  v_lng numeric;
begin
  -- `oculto = false` no es de adorno: la funcion es definer, asi que se saltea
  -- la policy de lectura publica de la 0004. Sin filtrarlo, un reporte retirado
  -- por moderacion seguiria generandole avisos a su dueño.
  select * into v_pet
    from public.pets
   where id = p_pet_id and activo = true and oculto = false;
  -- Reporte inexistente, cerrado u oculto: no encolamos nada y NO delatamos
  -- cual de los tres casos es.
  if not found then
    return;
  end if;

  -- Bloqueo (ver 3, arriba). Solo aplica si hay sesion; sin sesion no hay a
  -- quien comparar y `auth.uid()` es null. Silencioso: decir "no se pudo"
  -- confirma el bloqueo y arma al acosador (criterio de la 0022).
  if auth.uid() is not null and exists (
    select 1 from public.bloqueos b
    where (b.bloqueador = v_pet.user_id and b.bloqueado = auth.uid())
       or (b.bloqueador = auth.uid() and b.bloqueado = v_pet.user_id)
  ) then
    return;
  end if;

  -- Forma canonica del aviso, para poder comparar dos avisos entre si:
  --   · la nota, sin mayusculas, sin espacios repetidos y con '' tratado como
  --     ausente (el cliente manda null, pero un curl puede mandar la cadena
  --     vacia y serian el mismo aviso);
  --   · el punto redondeado a 5 decimales (~1 m). Compararlo como texto o como
  --     float suelto haria que dos veces el mismo punto no coincidan consigo
  --     mismo por como se imprime un double.
  v_nota_norm := nullif(lower(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g'))), '');
  v_lat := round(p_lat::numeric, 5);
  v_lng := round(p_lng::numeric, 5);

  -- Rate-limit por CONTENIDO, no por reporte. Misma ventana de 5 minutos de la
  -- 0050; lo que cambio es que ahora hace falta que el aviso sea EL MISMO.
  -- `is not distinct from` y no `=`: la nota es opcional y la mayoria llegan
  -- nulas — con `=`, null = null da null y no dedupearia justo el caso mas
  -- comun, que es el doble toque del boton sin escribir nada.
  if exists (
    select 1 from public.notification_events ne
    where ne.tipo = 'avistamiento_anonimo'
      and ne.pet_id = p_pet_id
      and ne.creado_en > now() - interval '5 minutes'
      and nullif(lower(btrim(regexp_replace(coalesce(ne.datos->>'nota', ''), '\s+', ' ', 'g'))), '')
            is not distinct from v_nota_norm
      and round((ne.datos->>'lat')::numeric, 5) is not distinct from v_lat
      and round((ne.datos->>'lng')::numeric, 5) is not distinct from v_lng
  ) then
    return;
  end if;

  insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
  values (
    'avistamiento_anonimo',
    p_pet_id,
    v_pet.user_id,
    null,
    -- El tope de la nota se repite aca aunque el cliente ya recorte: la RPC es
    -- publica y se puede llamar con curl (misma defensa que la 0016).
    jsonb_build_object(
      'nota', left(coalesce(p_nota, ''), 500),
      'lat', p_lat,
      'lng', p_lng
    )
  );
end;
$$;

-- Los grants se repiten porque `create or replace` NO reinicia los permisos,
-- pero si la funcion no existiera (base recreada desde cero, o la 0050 sin
-- aplicar) `create or replace` la crea y quedaria con el default de Postgres:
-- execute para public. Repetirlos es lo que hace que este archivo sea seguro
-- corriendolo solo.
revoke all on function public.avistar_sin_cuenta(uuid, text, double precision, double precision) from public;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision) to anon;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision) to authenticated;

-- 0065: la foto entra al motor de coincidencias (tanda 14, area B).
--
-- `buscar_coincidencias` gana UNA COLUMNA AL FINAL del `returns table`:
-- `porque` (el desglose legible de por que salio la coincidencia), con
-- `porque.foto` como UNICO rastro de la foto que sale de la funcion. Las 12
-- columnas de la 0058 NO se mueven ni se renombran: `src/services/
-- busqueda.ts` las lee por nombre.
--
-- POR QUE `foto_similitud` (el coseno exacto) NO SALE DE LA FUNCION. Decision
-- de Pablo (4-ago), tras el hallazgo critico de la revision de esta tarea: el
-- primer borrador la devolvia como columna del `returns table`. Esta funcion
-- es `security definer`, concedida a `anon`, y cualquiera puede pedirle las
-- coincidencias de CUALQUIER reporte (no hace falta ser su dueño). Si el
-- coseno exacto saliera, alguien que controla su PROPIO reporte —puede
-- escribir su propio vector via `insert`/`update`, la RLS de la 0064 se lo
-- permite— reconstruye el embedding de 512 dimensiones de la foto de UN
-- TERCERO en unas ~512 llamadas a la RPC: planta, una a la vez, un vector de
-- una base ortonormal y el coseno que la RPC devuelve en cada llamada es
-- exactamente la proyeccion del embedding ajeno sobre esa coordenada. Es la
-- propiedad no-oraculo que la 0064 existe para proteger (ver su cabecera) —
-- no es un problema nuevo, es esta misma funcion reabriendo la puerta que la
-- 0064 cerro.
--
-- RIESGO RESIDUAL ACEPTADO, version honesta (decision de Pablo, 5-ago, tras
-- una revision que encontro que la version anterior de este parrafo estaba
-- MAL medida — decia "1 bit" y no lo es).
--
-- `puntaje` SI sale de la funcion (columna del `returns table`, siempre
-- salio, no es nuevo de esta migracion), y es la suma de `senas_puntaje(...)`
-- mas el termino de la foto. Todos los argumentos de `senas_puntaje` para el
-- llamador son COMPUTABLES desde afuera sin pedirle nada a la base: las
-- propias señas de `b` (su reporte, las eligio el mismo), `distancia_km`
-- (columna que esta MISMA funcion ya devuelve) y las señas de `p` (el
-- candidato), que son publicas — se muestran en la ficha del reporte, igual
-- que color y tamaño en cualquier publicacion de "encontre" o "perdi". Restar
-- `senas_puntaje` de `puntaje` deja exactamente:
--   round((sim - 0.6) / 0.4 * 60)
-- El coseno CRUDO cuantizado a 61 niveles (0..60, ~6 bits) POR LLAMADA, y sin
-- necesitar sesion: `anon` puede llamar esta funcion igual que cualquiera.
-- Eso NO es un oraculo de 1 bit: es un oraculo de ~6 bits por llamada, unas
-- 85 veces mas rapido para reconstruir el embedding ajeno que sondear
-- `porque.foto` con busqueda binaria (que si daria 1 bit por llamada).
--
-- EL ATENUANTE QUE HACE EL IMPACTO CASI NULO, y por que se acepta de todos
-- modos: explotar esto pide un ANCLA con `sim >= 0.6` para arrancar el
-- sondeo adaptativo del vector plantado (con `sim` fuera de ese rango
-- `puntaje` ya no se mueve: `greatest(0, ...)` lo clava en cero). La UNICA
-- forma de conseguir esa ancla contra el reporte de una victima concreta es
-- tener SU foto publica — la misma foto que cualquiera ve en la ficha del
-- reporte. Y con la foto publica en la mano, quien atacaria ya puede correr
-- el mismo modelo CLIP en su navegador (exactamente lo que hace esta app,
-- ver `src/services/vectorFoto.ts`) y calcular el embedding LOCALMENTE, sin
-- pedirle nada a la RPC. El oraculo no le da a un atacante ninguna
-- informacion que no pudiera sacar ya, mas rapido, sin dejar 512 llamadas en
-- ningun log. Por eso se acepta conscientemente: el numero es peor de lo que
-- decia esta cabecera antes, pero el camino de explotacion real no se abre
-- con el, sino con la foto publica misma — que es el dato que la app siempre
-- mostro.
--
-- CAMBIA EL TIPO DE RETORNO ⇒ `create or replace` no alcanza (trampa
-- documentada en la 0024 y repetida en la 0059: un `create or replace` no
-- puede agregar columnas al `returns table`). Hay que dropear la firma EXACTA
-- y recrear. Si el drop no calzara, el create de abajo armaria una SOBRECARGA
-- y PostgREST fallaria por ambiguedad; el bloque de autoverificacion del
-- final convierte ese silencio en un error al aplicar.
--
-- El cuerpo de abajo es una COPIA VERBATIM del de la 0058 (sed -n
-- '468,582p' supabase/migrations/0058_insignia_suspendida_y_tope_de_radio.sql)
-- con estos cambios y nada mas:
--   1. el `left join lateral` nuevo que calcula la mejor similitud de fotos;
--   2. el termino de la foto sumado al `puntaje`, con guarda contra NaN (ver
--      el comentario junto a la formula: un vector de norma cero —que
--      cualquier `authenticated` puede plantar en SU PROPIO reporte— hace que
--      pgvector devuelva NaN, y `NaN::int` revienta la funcion entera para
--      TODOS los vecinos si no se lo intercepta antes);
--   3. `foto_similitud` como columna INTERNA de la CTE `cand` —nunca en el
--      `returns table` ni en el `select` final, ver el bloque de arriba— y la
--      columna `porque` en el `returns table` y en el `select` final;
--   4. el `porque`, el desglose legible que hoy no existe.
-- El filtro final (`where cand.chip_coincide or not senas_contradicen(...)`)
-- y el `order by` quedan IDENTICOS a la 0058: la foto no aparece en ninguno
-- de los dos, porque SOLO SUMA y NUNCA DESCARTA (regla global de la tanda:
-- un reporte sin vector, o una foto que no se parece por sucia, mojada o de
-- noche, tiene que seguir encontrando exactamente lo mismo que hoy).
drop function public.buscar_coincidencias(uuid, double precision, int);

create function public.buscar_coincidencias(
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
  puntaje int,
  porque jsonb
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
      f.sim as foto_similitud,
      public.senas_puntaje(
        b.colores, p.colores, b.tamano, p.tamano,
        b.sexo, p.sexo, b.esterilizado, p.esterilizado,
        st_distance(p.ubicacion, b.ubicacion) / 1000.0,
        (b.es_mio and b.chip_norm is not null and c.chip_norm is not null and c.chip_norm <> ''
          and b.chip_norm = c.chip_norm)
      ) +
      -- LA FOTO SUMA HASTA 60 Y NUNCA DESCARTA.
      -- Por que 60: la escala de senas_puntaje suma MENOS DE 100 sin chip
      -- (colores 40, tamaño 25, sexo 15, esterilizado 10, cercania hasta 20)
      -- contra el peso del chip, que es tres cifras y manda por si solo (ver
      -- `chip_coincide desc` en el `order by`, primero siempre). Con 60 la
      -- foto pesa mas que cualquier seña suelta y sigue sin poder acercarse
      -- al chip, que tiene que seguir mandando: un chip igual es identidad,
      -- un parecido es una pista.
      -- Y NUNCA DESCARTA porque un animal sucio, mojado o de noche no se
      -- parece a su propia foto (misma regla que senas_contradicen).
      -- nullif(..., 'NaN') porque pgvector devuelve NaN ante un vector de
      -- norma 0 (cualquier authenticated puede plantar uno en SU reporte) y
      -- NaN::int revienta la RPC entera para todos los vecinos. En Postgres
      -- NaN::float8 = NaN::float8 da true (no es el IEEE 754 estricto), asi
      -- que nullif SI atrapa el caso.
      coalesce(greatest(0, round((nullif(f.sim, 'NaN'::float8) - 0.6) / 0.4 * 60))::int, 0)
      as puntaje
    from public.pets p
    cross join base b
    left join public.pet_chips c on c.pet_id = p.id
    left join lateral (
      -- MEJOR PAR de fotos, no la primera de cada uno: un reporte tiene varias
      -- y la buena puede ser la tercera. `1 - (a <=> b)` es el coseno, porque
      -- el operador <=> de pgvector devuelve DISTANCIA coseno.
      select max(1 - (va.embedding <=> vb.embedding)) as sim
        from public.pet_fotos_vector va
        join public.pet_fotos_vector vb on vb.pet_id = p.id
       where va.pet_id = b.id
    ) f on true
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
    cand.puntaje,
    -- EL DESGLOSE LEGIBLE. `jsonb_strip_nulls` saca las claves en `false`: la
    -- pantalla solo tiene que listar lo que SI aporto, no armar un cartel de
    -- "no" por cada seña. El umbral de la foto (0.75) es mas alto que el de
    -- `senas_contradicen`-style checks porque acá no hay margen de contradiccion
    -- que perdonar: es solo "se parece bastante, mostralo".
    -- `foto_similitud` (el coseno crudo) NUNCA sale de aca: ver la cabecera
    -- del archivo. `porque.foto` es a proposito el UNICO rastro de la foto en
    -- todo el retorno de la funcion — un booleano, no el numero.
    jsonb_strip_nulls(jsonb_build_object(
      'chip', nullif(cand.chip_coincide, false),
      'color', nullif(cand.b_colores && cand.colores, false),
      'tamano', nullif(cand.b_tamano is not null and cand.b_tamano = cand.tamano, false),
      'cerca', nullif(cand.distancia_km < 2, false),
      'foto', nullif(coalesce(nullif(cand.foto_similitud, 'NaN'::float8), 0) >= 0.75, false)
    )) as porque
  from cand
  -- Un chip igual gana sobre cualquier contradicción: alguien pudo describir mal
  -- el color, pero el chip es el chip.
  where cand.chip_coincide
     or not public.senas_contradicen(cand.b_colores, cand.colores, cand.b_tamano, cand.tamano)
  order by cand.chip_coincide desc, cand.puntaje desc, cand.distancia_km asc, cand.id
  limit least(coalesce(p_limite, 10), 50);
$$;

-- OBLIGATORIOS, no repetición defensiva: esta migración hace `drop function`
-- + `create` (ver "CAMBIA EL TIPO DE RETORNO" en la cabecera), y un `drop`
-- se lleva los grants puestos junto con la función — no son un `create or
-- replace` que los conserva solo. Si estas tres líneas faltaran, la función
-- recreada quedaría sin `execute` para nadie hasta la próxima migración.
-- Quien lea este archivo tiene que poder ver de un vistazo quién puede
-- llamar a una función `security definer` que lee `pet_chips` y
-- `pet_fotos_vector.embedding` internamente (nunca los devuelve — ver la
-- cabecera del archivo).
revoke all on function public.buscar_coincidencias(uuid, double precision, int) from public;
grant execute on function public.buscar_coincidencias(uuid, double precision, int) to anon;
grant execute on function public.buscar_coincidencias(uuid, double precision, int) to authenticated;

-- ------------------------------------------------------------------
-- AUTOVERIFICACIÓN
-- ------------------------------------------------------------------
-- `drop function` con la firma incompleta es SILENCIOSO cuando no calza: no
-- borra nada, no falla, y el `create` de arriba arma una SEGUNDA firma. Con
-- dos sobrecargas vivas, PostgREST no sabe cuál invocar y devuelve un error de
-- ambigüedad: la ficha y el tablero de coincidencias se caen para todo el
-- mundo, y el SQL habría "corrido bien" al aplicar. Esto convierte ese
-- silencio en un error. Misma idea que el bloque final de la 0054 y la 0058.
do $$
declare
  n int;
begin
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'buscar_coincidencias';
  if n <> 1 then
    raise exception 'buscar_coincidencias quedo con % firma(s): el drop no calzo', n;
  end if;
end $$;

-- ============================================================
-- SEÑAS ESTRUCTURADAS — que una coincidencia deje de ser "misma especie + 15 km"
--
-- EL PROBLEMA. Todo lo que identifica a un animal vive hoy en un textarea libre
-- (`pets.descripcion`). El motor de coincidencias (0026, con la vigencia de la
-- 0029) cruza estado opuesto + especie compatible + 15 km, y nada más. Por eso
-- casi todo lo que produce es inútil — y una coincidencia mala acá no es neutra:
-- le da esperanza a alguien desesperado y lo hace cruzar la ciudad para nada.
--
-- El dato revelador: `my_pets` (la ficha "Mi mascota", 0027) YA guarda el chip y
-- las guías le dicen al usuario que lo tenga a mano. Un REPORTE no tenía dónde
-- ponerlo. El único identificador inequívoco que existe estaba fuera del motor.
--
-- LO QUE ENTREGA ESTA MIGRACIÓN
--   1. `pets` suma cuatro columnas opcionales: colores, tamaño, sexo y
--      esterilizado. Los valores son LITERALMENTE los de `adoptions` (0030).
--   2. `pet_chips`: el número de chip, en su propia tabla y cerrado al dueño.
--   3. Dos funciones puras con la regla de descarte y la de puntaje, para que
--      el aviso proactivo y la lista de la ficha no puedan decir cosas distintas.
--   4. `buscar_coincidencias` y `enqueue_coincidencias` recreadas para usarlas.
--   5. Un disparador propio sobre `pet_chips` (el chip llega DESPUÉS del reporte).
--   6. `buscar_reportes` suma dos filtros opcionales: color y tamaño.
--
-- ------------------------------------------------------------
-- POR QUÉ EL CHIP NO ES UNA COLUMNA DE `pets`  (la decisión central)
--
-- Dos razones, y la segunda sola ya alcanzaría:
--
--  · SE PUBLICARÍA SOLO. `pets` se lee con `select('*')` en media app y lo
--    exponen las RPC públicas de búsqueda y la ficha pública. Una columna `chip`
--    ahí habría estado a UN `select('*')` de distancia de salir impresa en la
--    pantalla que ve cualquiera sin cuenta. Cerrarla habría exigido el
--    revoke-por-columna de la 0018 sobre una tabla de veinte columnas, que es
--    imposible de mantener. Es, palabra por palabra, el argumento que ya dejó
--    escrito la 0047 para las señas privadas.
--
--  · PUBLICARLO ROMPE LO QUE VIENE A ARREGLAR. El chip es lo único que prueba
--    de quién es el animal. Publicado en el aviso, el estafador que hoy dice
--    "la tengo, mandame plata" pasa a decir "la tengo, su chip es 985112…" y se
--    vuelve indistinguible del dueño de verdad — la misma dinámica contra la que
--    existe la seña secreta de la 0047. Y con el número en la mano se puede
--    intentar re-registrar el animal a nombre de otro en el registro nacional.
--
-- ENTONCES: el chip se guarda, se cruza y NUNCA se devuelve. Ninguna función de
-- este archivo lo tiene en su `returns table (...)`; lo único que sale es el
-- booleano `chip_coincide`. Es el mismo contrato de `mascota_por_collar` (0027),
-- que tampoco devuelve el chip y tiene un test que lo garantiza.
--
-- ------------------------------------------------------------
-- LA REGLA QUE MANDA SOBRE TODAS: LO QUE FALTA NO DESCARTA
--
-- Hoy hay reportes publicados sin ninguno de estos campos, y van a seguir
-- llegando (nadie va a completar seis chips estando desesperado). Un motor que
-- exija los datos nuevos dejaría de encontrar coincidencias para todos ellos, o
-- sea que "mejorar" el motor lo apagaría. Por eso:
--   · una contradicción exige que LOS DOS lados hayan contestado;
--   · el color contradice solo si no comparten NI UN color (basta uno en común);
--   · el tamaño contradice solo en los extremos (chico↔grande; chico↔mediano no,
--     ahí la gente honestamente no se pone de acuerdo);
--   · el sexo NO descarta nunca (quien encuentra un animal se equivoca seguido),
--     solo suma cuando coincide;
--   · y un chip igual gana sobre cualquier contradicción.
--
-- ------------------------------------------------------------
-- LA WEB TIENE QUE ANDAR CON ESTA MIGRACIÓN SIN APLICAR
--
--  · ESCRITURA. `createPet` manda las señas en el MISMO insert que el resto.
--    PostgREST no guarda filas parciales: si no conoce las columnas rebota el
--    insert ENTERO y la mascota perdida no se publica. Por eso `createPet`
--    reintenta sin ellas cuando el error es "columna faltante", igual que ya
--    hacía con `ambito` (0046). El chip va en otra tabla y otra llamada, después
--    del reporte, y su fracaso no tumba nada.
--  · LECTURA. Ninguna consulta de la app nombra estas columnas en una lista de
--    columnas: las pantallas que las usan leen con `select('*')`, que degrada
--    solo. Hay un barrido de src/ en __tests__/db/migracion0054.test.ts que
--    falla si aparece un `.select('… colores …')`.
--  · FILTROS. `buscarReportes` solo manda `p_color`/`p_tamano` cuando la persona
--    eligió uno; si la RPC vieja no los conoce (PGRST202), reintenta sin ellos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LAS COLUMNAS DE `pets`
-- ------------------------------------------------------------
-- Todas NULLABLE y sin default, y no es un descuido: son preguntas OMITIBLES.
-- Un `not null` obligaría a inventar una respuesta en el peor momento posible y
-- un default haría pasar por dato del dueño algo que nadie contestó. Los
-- reportes anteriores quedan en null, que es exactamente lo que corresponde.
alter table public.pets add column if not exists colores text[];
alter table public.pets add column if not exists tamano text;
alter table public.pets add column if not exists sexo text;
alter table public.pets add column if not exists esterilizado text;

-- `text` + CHECK y no enums de Postgres, mismo criterio que la 0046 y la 0030:
-- así sumar un color mañana no arrastra un ALTER TYPE. El `drop ... if exists`
-- previo deja el archivo re-ejecutable (`add constraint` a secas revienta la
-- segunda corrida).
alter table public.pets drop constraint if exists pets_tamano_valido;
alter table public.pets
  add constraint pets_tamano_valido
  check (tamano is null or tamano in ('chico', 'mediano', 'grande'));

-- 'no_se' EXPLÍCITO en vez de un booleano: quien encuentra un animal en la calle
-- muchas veces no sabe el sexo, y "no sé" no es lo mismo que "no contestó".
alter table public.pets drop constraint if exists pets_sexo_valido;
alter table public.pets
  add constraint pets_sexo_valido
  check (sexo is null or sexo in ('macho', 'hembra', 'no_se'));

-- Tri-estado igual que `adoptions.esterilizado` (0030), verbatim.
alter table public.pets drop constraint if exists pets_esterilizado_valido;
alter table public.pets
  add constraint pets_esterilizado_valido
  check (esterilizado is null or esterilizado in ('si', 'no', 'no_se'));

-- El tope es "<= 3" y NO "between 1 and 3" a propósito. Si por lo que fuera
-- llegara un `{}` (el cliente manda null, pero un deep link o un cliente viejo
-- pueden mandar cualquier cosa), un CHECK que exigiera al menos un color haría
-- rebotar el insert ENTERO y la mascota perdida no se publicaría. Una lista de
-- colores nunca puede impedir publicar un reporte.
--
-- Y el tope existe porque marcar los siete colores equivale a no contestar,
-- pero además haría que la regla de contradicción no descartara nunca.
alter table public.pets drop constraint if exists pets_colores_validos;
alter table public.pets
  add constraint pets_colores_validos
  check (
    colores is null
    or (
      coalesce(array_length(colores, 1), 0) <= 3
      and colores <@ array['negro', 'blanco', 'gris', 'cafe', 'dorado', 'naranjo', 'atigrado']::text[]
    )
  );

-- Índice GIN para el filtro `p.colores @> array[p_color]` de `buscar_reportes`.
create index if not exists pets_colores_idx on public.pets using gin (colores);

-- `pets` no tiene grants POR COLUMNA (eso es cosa de `profiles`, desde la 0018):
-- los permisos son de tabla y los recorta la RLS, así que las columnas nuevas
-- heredan lo mismo que las demás. Son PÚBLICAS como el resto del reporte, y está
-- bien que lo sean: el color y el tamaño son justo lo que hay que gritar en la
-- calle. El chip no, y por eso no está acá.

-- ------------------------------------------------------------
-- 2. `pet_chips` — el número de chip, cerrado al dueño
-- ------------------------------------------------------------
-- Una fila por reporte. Misma forma que `pet_senas_privadas` (0047): en una
-- tabla aparte, para filtrar el dato hay que ir a buscarlo A PROPÓSITO. La
-- defensa es estructural, no una policy con suerte.
create table if not exists public.pet_chips (
  pet_id uuid primary key references public.pets(id) on delete cascade,
  -- El dueño se guarda en la propia fila para que la policy no tenga que salir a
  -- buscarlo a `pets` en CADA lectura. El `with check` de abajo se encarga de
  -- que este `user_id` no pueda mentir.
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Se guarda TAL COMO lo tipearon (con guiones, espacios, lo que sea): si
  -- alguna vez hay que mostrárselo al dueño, tiene que ver lo suyo.
  chip text not null,
  -- Y se compara SIEMPRE por esta columna generada. Postgres la recalcula sola,
  -- nunca queda desincronizada, y la clase de caracteres es EXACTAMENTE la misma
  -- que usa `normalizarChip` en src/lib/senasMascota.ts (`CHIP_BASURA_SQL`). Si
  -- las dos limpiezas se separan, "985 112" guardado desde la app y "985112"
  -- tecleado por otra persona dejan de cruzarse: el dato más fuerte que tenemos
  -- se pierde en silencio.
  chip_norm text generated always as (upper(regexp_replace(chip, '[^A-Za-z0-9]', '', 'g'))) stored,
  creado_en timestamptz not null default now(),
  -- Mismo tope que `my_pets.chip` (0027). Es sobre el texto crudo, así que tiene
  -- que ser más ancho que los 15 caracteres del número limpio.
  constraint pet_chips_chip_largo check (length(btrim(chip)) between 1 and 40)
);

alter table public.pet_chips enable row level security;

-- UNA sola policy, y es del dueño. Que sea una sola importa: en Postgres varias
-- policies permisivas se SUMAN (son un OR), así que una segunda más laxa
-- anularía a esta sin que nadie lo note. La lección literal de la 0047.
--
-- El `with check` mira DOS cosas: que el `user_id` que se escribe sea el propio
-- (si no, cualquiera se cuelga de otro) y que el reporte también sea suyo (si
-- no, se le podría colgar un chip inventado al reporte de un vecino, que con
-- este motor es peor que ensuciarlo: sería fabricar una "coincidencia casi
-- segura" falsa).
-- El `drop` previo deja el archivo re-ejecutable, igual que los CHECK de arriba:
-- `create policy` a secas revienta la segunda corrida, y una migración que no se
-- puede reaplicar es una que nadie se anima a correr de nuevo.
drop policy if exists "solo el dueño ve y edita el chip de su reporte" on public.pet_chips;

create policy "solo el dueño ve y edita el chip de su reporte"
  on public.pet_chips for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.pets p where p.id = pet_id and p.user_id = auth.uid())
  );

create index if not exists pet_chips_chip_norm_idx on public.pet_chips (chip_norm);
create index if not exists pet_chips_user_id_idx on public.pet_chips (user_id);

-- Fail-closed, mismo criterio que la 0018 y la 0047. `public` va en el revoke a
-- propósito: es el pseudo-rol del que heredan todos, y dejarlo afuera haría que
-- un grant heredado anulara todo esto en silencio.
revoke all on public.pet_chips from public, anon;

-- `anon` no aparece en NINGÚN grant. Un visitante sin sesión no tiene por qué
-- llegar ni a la puerta de esta tabla.
grant select, insert, update, delete on public.pet_chips to authenticated;

-- ------------------------------------------------------------
-- 3. LAS DOS REGLAS, ESCRITAS UNA SOLA VEZ
-- ------------------------------------------------------------
-- Viven en funciones y no repetidas dentro de cada consulta porque las usan DOS
-- motores distintos: el aviso proactivo (`enqueue_coincidencias`, que manda un
-- push) y la lista de la ficha (`buscar_coincidencias`). Si la regla estuviera
-- copiada, el día que alguien afloje una de las dos, el push diría una cosa y la
-- pantalla otra sobre exactamente el mismo par de reportes.

-- ¿Estos dos reportes se CONTRADICEN? (o sea: ¿podemos descartar el par?)
--
-- OJO CON LOS NULLS: `p_tamano_a = 'chico'` con null da NULL, y un NULL en
-- `where not senas_contradicen(...)` filtra la fila igual que si contradijera —
-- perderíamos justo las coincidencias de los reportes sin datos, que son la
-- mayoría, o sea el bug exacto que esta migración existe para no cometer. Por
-- eso cada mitad va envuelta en `coalesce(..., false)`.
create or replace function public.senas_contradicen(
  p_colores_a text[],
  p_colores_b text[],
  p_tamano_a text,
  p_tamano_b text
)
returns boolean
language sql
immutable
as $$
  select
    -- COLOR: solo si los DOS lados contestaron y no comparten ni uno. `&&` es
    -- "se solapan": basta un color en común para NO contradecir. Es a propósito:
    -- un perro blanco y negro puede estar cargado con los dos colores de un lado
    -- y con uno solo del otro, y sigue siendo la misma mascota.
    coalesce(
      (
        coalesce(array_length(p_colores_a, 1), 0) > 0
        and coalesce(array_length(p_colores_b, 1), 0) > 0
        and not (p_colores_a && p_colores_b)
      ),
      false
    )
    -- TAMAÑO: solo los extremos. 'chico' contra 'mediano' NO entra — ahí la
    -- gente honestamente no se pone de acuerdo (un mestizo de 12 kg es mediano
    -- para uno y chico para otro) y descartar por eso tiraría coincidencias
    -- buenas. La misma tabla de pares está en TAMANOS_INCOMPATIBLES (cliente).
    or coalesce(
      (
        (p_tamano_a = 'chico' and p_tamano_b = 'grande')
        or (p_tamano_a = 'grande' and p_tamano_b = 'chico')
      ),
      false
    );
$$;

-- Cuánto se parecen. Solo ordena: no descarta nada.
--
-- El chip vale 1000 y todo lo demás junto no llega a 100. Es deliberado: "el
-- chip que coincide es una coincidencia casi segura" y tiene que pesar
-- muchísimo más que la cercanía. Con pesos comparables, un match a 200 m sin un
-- solo dato adelantaría a uno con el MISMO chip a 12 km, que es exactamente al
-- revés de lo que sirve.
--
-- El sexo suma pero no descarta (ver la cabecera). El esterilizado pesa poco: es
-- el que menos gente sabe de un animal que se encontró en la calle.
create or replace function public.senas_puntaje(
  p_colores_a text[],
  p_colores_b text[],
  p_tamano_a text,
  p_tamano_b text,
  p_sexo_a text,
  p_sexo_b text,
  p_esterilizado_a text,
  p_esterilizado_b text,
  p_distancia_km double precision,
  p_chip_coincide boolean
)
returns int
language sql
immutable
as $$
  select
    case when coalesce(p_chip_coincide, false) then 1000 else 0 end
    + case
        when coalesce(array_length(p_colores_a, 1), 0) > 0
         and coalesce(array_length(p_colores_b, 1), 0) > 0
         and p_colores_a && p_colores_b
        then 40 else 0 end
    + case when p_tamano_a is not null and p_tamano_a = p_tamano_b then 25 else 0 end
    -- 'no_se' de los dos lados no es una coincidencia: es no saber dos veces.
    + case when p_sexo_a in ('macho', 'hembra') and p_sexo_a = p_sexo_b then 15 else 0 end
    + case when p_esterilizado_a in ('si', 'no') and p_esterilizado_a = p_esterilizado_b then 10 else 0 end
    -- Cercanía: hasta 20 puntos, cayendo un punto por kilómetro. Acotada con
    -- `greatest(0, …)` para que un reporte lejano no reste (restar convertiría
    -- el puntaje en negativo y desordenaría el empate por distancia de abajo).
    + greatest(0, 20 - round(coalesce(p_distancia_km, 20))::int);
$$;

-- ------------------------------------------------------------
-- 4. `buscar_coincidencias` — recreada DESDE LA 0029
-- ------------------------------------------------------------
-- Se parte de la 0029 (que le sumó el filtro de vigencia a la versión de la
-- 0014), NO de la 0014. Recrear desde la vieja borraría ese filtro y volverían a
-- sugerirse reportes ya archivados por inactividad, sin que nada se ponga rojo.
-- Es el accidente que ya pasó con `buscar_reportes` y casi con `buscar_adopciones`.
--
-- Cambia el TIPO DE RETORNO (dos columnas nuevas), así que `create or replace`
-- no alcanza: hay que dropear la firma EXACTA y recrear. Si el drop no calzara,
-- el create armaría una SOBRECARGA y PostgREST fallaría por ambigüedad; el
-- bloque de autoverificación del final convierte ese silencio en un error.
--
-- SECURITY DEFINER es nuevo y es la única forma de que la función pueda leer
-- `pet_chips`, que está cerrada al dueño por RLS. Eso saltea la RLS de `pets`,
-- así que el WHERE de `base` repite a mano lo que antes hacía la policy: sin
-- eso, alguien sin cuenta podría pedir las coincidencias de un reporte ocultado
-- por moderación. Y el chip sigue sin salir: no está en el `returns table`.
drop function if exists public.buscar_coincidencias(uuid, double precision, int);

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
      -- Nunca NULL: si alguno de los dos no tiene chip, es `false`.
      (b.chip_norm is not null and c.chip_norm is not null and c.chip_norm <> ''
        and b.chip_norm = c.chip_norm) as chip_coincide,
      b.colores as b_colores, b.tamano as b_tamano, b.sexo as b_sexo,
      b.esterilizado as b_esterilizado,
      p.colores, p.tamano, p.sexo, p.esterilizado,
      public.senas_puntaje(
        b.colores, p.colores, b.tamano, p.tamano,
        b.sexo, p.sexo, b.esterilizado, p.esterilizado,
        st_distance(p.ubicacion, b.ubicacion) / 1000.0,
        (b.chip_norm is not null and c.chip_norm is not null and c.chip_norm <> ''
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
      and st_dwithin(p.ubicacion, b.ubicacion, p_radio_km * 1000)
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

-- Los mismos que tenía de hecho (se creó sin grants explícitos en la 0014, o sea
-- execute para `public`), pero escritos: ahora es definer y el que lea esto tiene
-- que poder ver de un vistazo quién la puede llamar.
revoke all on function public.buscar_coincidencias(uuid, double precision, int) from public;
grant execute on function public.buscar_coincidencias(uuid, double precision, int) to anon;
grant execute on function public.buscar_coincidencias(uuid, double precision, int) to authenticated;

-- ------------------------------------------------------------
-- 5. `enqueue_coincidencias` — recreada DESDE LA 0029
-- ------------------------------------------------------------
-- Sigue siendo `create or replace`: el tipo de retorno (trigger) no cambia, así
-- que el trigger `pets_notificar_coincidencias` de la 0026 no se desengancha y
-- no hace falta recrearlo (recrearlo dejaría una ventana sin avisos, o reventaría
-- al aplicar por duplicado).
--
-- Contra la 0029 cambian TRES cosas y nada más:
--   (a) el loop descarta los pares que se contradicen;
--   (b) se ordena por puntaje y recién después por distancia, así que el aviso
--       único al que recién publicó (brazo B) es sobre el match más FUERTE y no
--       sobre el más cercano;
--   (c) `datos.chip` viaja cuando el chip coincide, para que el texto del aviso
--       pueda ser más fuerte (ver src/lib/avisosBandeja.ts y notifyTargets.ts).
--
-- OJO CON EL CHIP ACÁ: en la práctica `new` casi nunca tiene chip cuando corre
-- este trigger, porque `pet_chips` se escribe DESPUÉS del insert en `pets` (la
-- FK necesita el pet_id). Se busca igual, por si algún día una escritura lo deja
-- antes, pero el caso real lo cubre el disparador de la sección 6.
create or replace function public.enqueue_coincidencias()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_radio_km constant double precision := 15;
  v_tope constant int := 25;
  m record;
  v_hubo boolean := false;
  v_cercano_id uuid;
  v_cercano_estado text;
  v_cercano_especie text;
  v_cercano_chip boolean := false;
  v_mi_chip text;
begin
  select c.chip_norm into v_mi_chip
  from public.pet_chips c
  where c.pet_id = new.id and c.chip_norm <> '';

  -- Brazo A: por cada reporte existente que calza, avisar a SU dueño sobre el
  -- reporte que recién apareció (new). El reporte que recién se publica nunca
  -- está vencido (renovado_en = now() por default), así que solo filtramos los `p`.
  for m in
    select
      p.id, p.estado, p.especie,
      (v_mi_chip is not null and c.chip_norm is not null and c.chip_norm <> ''
        and c.chip_norm = v_mi_chip) as chip_coincide,
      public.senas_puntaje(
        new.colores, p.colores, new.tamano, p.tamano,
        new.sexo, p.sexo, new.esterilizado, p.esterilizado,
        st_distance(p.ubicacion, new.ubicacion) / 1000.0,
        (v_mi_chip is not null and c.chip_norm is not null and c.chip_norm <> ''
          and c.chip_norm = v_mi_chip)
      ) as puntaje
    from public.pets p
    left join public.pet_chips c on c.pet_id = p.id
    where p.id <> new.id
      and p.activo = true
      and p.oculto = false
      and p.reunida_en is null
      -- Vigencia (func.3): un reporte vencido no genera coincidencias.
      and coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'
      -- Estado opuesto: a un perdido le sugerimos encontrados, y viceversa.
      and p.estado <> new.estado
      -- Especie compatible: 'otro' hace de comodín en cualquiera de los dos lados.
      and (p.especie = new.especie or p.especie = 'otro' or new.especie = 'otro')
      and st_dwithin(p.ubicacion, new.ubicacion, v_radio_km * 1000)
      -- SEÑAS (0054): un par que se contradice no genera aviso. Un aviso malo
      -- acá es un push que le dice a alguien desesperado "puede que sea la tuya".
      and not public.senas_contradicen(new.colores, p.colores, new.tamano, p.tamano)
    order by puntaje desc, st_distance(p.ubicacion, new.ubicacion) asc, p.id
    limit v_tope
  loop
    insert into public.notification_events (tipo, pet_id, actor_id, datos)
    values ('coincidencia', m.id, new.user_id,
            jsonb_build_object('match_pet_id', new.id,
                               'match_estado', new.estado::text,
                               'match_especie', new.especie::text,
                               'chip', m.chip_coincide));

    -- El loop viene ordenado por puntaje: el primero es el match más fuerte.
    if not v_hubo then
      v_hubo := true;
      v_cercano_id := m.id;
      v_cercano_estado := m.estado::text;
      v_cercano_especie := m.especie::text;
      v_cercano_chip := m.chip_coincide;
    end if;
  end loop;

  -- Brazo B: un SOLO aviso al que recién publicó, sobre el mejor match (en el
  -- detalle ya ve la lista completa; no lo spameamos). actor_id = null: el aviso
  -- es del sistema, no de una persona.
  if v_hubo then
    insert into public.notification_events (tipo, pet_id, actor_id, datos)
    values ('coincidencia', new.id, null,
            jsonb_build_object('match_pet_id', v_cercano_id,
                               'match_estado', v_cercano_estado,
                               'match_especie', v_cercano_especie,
                               'chip', v_cercano_chip));
  end if;

  return new;
end; $$;

-- ------------------------------------------------------------
-- 6. EL CHIP LLEGA DESPUÉS: SU PROPIO DISPARADOR
-- ------------------------------------------------------------
-- Sin esta sección el chip no serviría para NADA al publicar, y el agujero sería
-- invisible: `pet_chips` se escribe después del insert en `pets` (la FK necesita
-- el pet_id), así que cuando corre `enqueue_coincidencias` el chip del reporte
-- recién publicado todavía no existe. El motor "usaría el chip" y nunca lo
-- encontraría.
--
-- Este trigger cierra el círculo: cuando el chip aterriza (o cambia), se busca a
-- quién avisarle. Solo emite avisos de CHIP, así que no duplica los que ya mandó
-- `enqueue_coincidencias` unos milisegundos antes: si aparece uno, es porque hay
-- un match del dato más fuerte que existe, y ese aviso merece salir aparte.
--
-- NO HAY FILTRO DE RADIO NI DE ESPECIE, y es la decisión más importante de esta
-- sección. Un perro perdido en Santiago aparece en Rancagua, y un chip es único:
-- si dos reportes de estado opuesto comparten chip, es el mismo animal, esté
-- donde esté. Aplicarle los 15 km de siempre perdería el único dato inequívoco
-- justo en el caso en que más hace falta.
create or replace function public.enqueue_coincidencias_chip()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tope constant int := 5;
  v_yo public.pets%rowtype;
  m record;
  v_hubo boolean := false;
  v_primero_id uuid;
  v_primero_estado text;
  v_primero_especie text;
begin
  -- Un chip que se normaliza a vacío ('---' pasa el CHECK de largo) no cruza con
  -- nadie. Sin esto, todos los reportes con chip basura serían "coincidencia
  -- casi segura" entre sí: el peor falso positivo posible.
  if new.chip_norm is null or new.chip_norm = '' then
    return new;
  end if;
  -- Tocar otra columna de la fila no vuelve a avisar.
  if tg_op = 'UPDATE' and old.chip_norm is not distinct from new.chip_norm then
    return new;
  end if;

  select * into v_yo from public.pets where id = new.pet_id;
  if not found then
    return new;
  end if;
  if v_yo.activo = false or v_yo.oculto = true or v_yo.reunida_en is not null then
    return new;
  end if;

  for m in
    select p.id, p.estado, p.especie
    from public.pets p
    join public.pet_chips c on c.pet_id = p.id
    where p.id <> v_yo.id
      and p.activo = true
      and p.oculto = false
      and p.reunida_en is null
      and coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'
      and p.estado <> v_yo.estado
      and c.chip_norm <> ''
      and c.chip_norm = new.chip_norm
    order by p.creado_en desc, p.id
    limit v_tope
  loop
    insert into public.notification_events (tipo, pet_id, actor_id, datos)
    values ('coincidencia', m.id, v_yo.user_id,
            jsonb_build_object('match_pet_id', v_yo.id,
                               'match_estado', v_yo.estado::text,
                               'match_especie', v_yo.especie::text,
                               'chip', true));
    if not v_hubo then
      v_hubo := true;
      v_primero_id := m.id;
      v_primero_estado := m.estado::text;
      v_primero_especie := m.especie::text;
    end if;
  end loop;

  if v_hubo then
    insert into public.notification_events (tipo, pet_id, actor_id, datos)
    values ('coincidencia', v_yo.id, null,
            jsonb_build_object('match_pet_id', v_primero_id,
                               'match_estado', v_primero_estado,
                               'match_especie', v_primero_especie,
                               'chip', true));
  end if;

  return new;
end; $$;

drop trigger if exists pet_chips_notificar_coincidencias on public.pet_chips;
create trigger pet_chips_notificar_coincidencias
  after insert or update of chip on public.pet_chips
  for each row execute function public.enqueue_coincidencias_chip();

-- ------------------------------------------------------------
-- 7. `buscar_reportes` — recreada DESDE LA 0028, solo para sumar dos filtros
-- ------------------------------------------------------------
-- La 0046 decidió NO tocar esta función para no pagar un `drop function`, y tenía
-- razón para el ámbito: el LISTADO no lo necesitaba. Acá es al revés — filtrar
-- por color y por tamaño es precisamente una operación del listado, y hacerlo en
-- el cliente rompería la paginación por cursor (una página de 20 filtrada a 3
-- parecería "no hay más resultados").
--
-- Se parte de la 0028, que es la versión viva: conserva el feed por comuna de la
-- 0021, el arreglo del cursor de la 0015 y la vigencia + `renovado_en` propios.
-- El retorno queda IDÉNTICO (las señas no se agregan al listado: la ficha las lee
-- con `select('*')`, y cada columna de más es una chance más de copiar mal).
--
-- Los dos parámetros nuevos van con `default null`: sin eso, la llamada de
-- siempre (14 argumentos) dejaría de resolver y se caería Explorar entero apenas
-- se aplique el SQL. Y el cliente solo los MANDA cuando hay un filtro puesto, así
-- que con la migración sin aplicar la búsqueda de siempre sigue resolviendo.
drop function if exists public.buscar_reportes(
  double precision, double precision, double precision, text, text, text,
  boolean, timestamptz, text, timestamptz, uuid, double precision, int, text
);

create function public.buscar_reportes(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radio_km double precision default null,
  p_estado text default null,
  p_especie text default null,
  p_texto text default null,
  p_con_recompensa boolean default false,
  p_desde timestamptz default null,
  p_orden text default 'recientes',
  p_cursor_fecha timestamptz default null,
  p_cursor_id uuid default null,
  p_cursor_dist double precision default null,
  p_limite int default 20,
  p_comuna text default null,
  p_color text default null,
  p_tamano text default null
)
returns table (
  id uuid,
  user_id uuid,
  estado pet_estado,
  especie pet_especie,
  raza text,
  nombre text,
  descripcion text,
  fotos text[],
  lat double precision,
  lng double precision,
  recompensa text,
  activo boolean,
  oculto boolean,
  creado_en timestamptz,
  reunida_en timestamptz,
  final_feliz text,
  final_foto text,
  renovado_en timestamptz,
  distancia_km double precision
)
language sql
stable
as $$
  with centro as (
    select case
      when p_lat is null or p_lng is null then null
      else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    end as punto
  ),
  calc as (
    select
      p.id, p.user_id, p.estado, p.especie, p.raza, p.nombre, p.descripcion,
      p.fotos, p.lat, p.lng, p.recompensa, p.activo, p.oculto, p.creado_en,
      p.reunida_en, p.final_feliz, p.final_foto, p.renovado_en,
      case when c.punto is null then null
           else round((st_distance(p.ubicacion, c.punto) / 1000.0)::numeric, 6)
      end as dist
    from public.pets p, centro c
    where p.activo = true
      and p.oculto = false
      and (c.punto is null or p_radio_km is null
           or st_dwithin(p.ubicacion, c.punto, p_radio_km * 1000))
      and (p_estado is null or p.estado::text = p_estado)
      and (p_especie is null or p.especie::text = p_especie)
      and (p_con_recompensa is not true or coalesce(trim(p.recompensa), '') <> '')
      and (p_desde is null or p.creado_en >= p_desde)
      and (p_texto is null or trim(p_texto) = '' or
           (coalesce(p.nombre, '') || ' ' || coalesce(p.raza, '') || ' ' || p.descripcion)
             ilike '%' || trim(p_texto) || '%')
      and (p_comuna is null or p.comuna = p_comuna or p_comuna = any(p.comunas_alcance))
      and coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'
      -- NUEVO (0054). Opcionales: un reporte viejo sin señas sigue apareciendo
      -- en la búsqueda de siempre. Solo se filtra a quien pidió el filtro, y ahí
      -- sí desaparecen los reportes sin el dato — es lo que la persona pidió.
      and (p_color is null or p.colores @> array[p_color]::text[])
      and (p_tamano is null or p.tamano = p_tamano)
  )
  select
    calc.id, calc.user_id, calc.estado, calc.especie, calc.raza, calc.nombre,
    calc.descripcion, calc.fotos, calc.lat, calc.lng, calc.recompensa,
    calc.activo, calc.oculto, calc.creado_en, calc.reunida_en,
    calc.final_feliz, calc.final_foto, calc.renovado_en,
    calc.dist::double precision as distancia_km
  from calc
  where
    case
      when p_orden = 'cerca' and calc.dist is not null then
        p_cursor_dist is null
        or (calc.dist, calc.id) > (round(p_cursor_dist::numeric, 6), p_cursor_id)
      else
        p_cursor_fecha is null
        or (calc.creado_en, calc.id) < (p_cursor_fecha, p_cursor_id)
    end
  order by
    case when p_orden = 'cerca' then calc.dist end asc nulls last,
    case when p_orden = 'cerca' then calc.id end asc nulls last,
    case when p_orden = 'cerca' then null else calc.creado_en end desc nulls last,
    case when p_orden = 'cerca' then null else calc.id end desc nulls last
  limit least(coalesce(p_limite, 20), 100);
$$;

-- ------------------------------------------------------------
-- 8. AUTOVERIFICACIÓN
-- ------------------------------------------------------------
-- `drop function if exists` es SILENCIOSO cuando la firma no calza: no borra
-- nada, no falla, y el `create` de arriba arma una SEGUNDA firma. Con dos
-- sobrecargas vivas, PostgREST no sabe cuál invocar y devuelve un error de
-- ambigüedad: Explorar y la ficha se caen para todo el mundo, y el SQL habría
-- "corrido bien". Esto convierte ese silencio en un error al aplicar.
do $$
declare
  n int;
begin
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'buscar_reportes';
  if n <> 1 then
    raise exception 'buscar_reportes quedo con % firma(s): el drop no calzo', n;
  end if;

  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'buscar_coincidencias';
  if n <> 1 then
    raise exception 'buscar_coincidencias quedo con % firma(s): el drop no calzo', n;
  end if;
end $$;

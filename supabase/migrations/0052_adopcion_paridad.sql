-- ============================================================
-- PARIDAD DE ADOPCION (Tanda 11 · Tarea 4)
--
-- Adopcion era media app pegada al costado: sin buscador de texto, sin filtro
-- por edad (aunque la columna existe desde la 0030 y la tarjeta la MUESTRA),
-- sin ciclo de vida, y sin aparecer en el perfil publico — un refugio con 40
-- animales publicados se veia con todo en cero y "no tiene reportes activos".
--
-- Esta migracion entrega tres cosas y NADA MAS:
--   1. `adoptions.renovado_en` + auto-archivado perezoso (el patron de la 0028,
--      sin cron: la consulta deja de mostrar lo no renovado).
--   2. `buscar_adopciones` con texto y edad, recreada DESDE LA 0033.
--   3. `perfil_publico` sumando la cuenta de publicaciones en adopcion.
--
-- LO QUE QUEDO AFUERA A PROPOSITO: guardar busquedas de ADOPCION. La tabla
-- `busquedas_guardadas` (0031) se ampliaria en una linea, pero el aviso lo
-- encola un trigger que cuelga de `pets` y lo compone la Edge Function
-- `send-notifications`, que conoce los tipos de evento uno por uno. Sin
-- redeploy de esa funcion —que esta tanda no hace— el aviso se encolaria y
-- nunca saldria: seria un boton que promete algo que nadie manda. Es la misma
-- razon por la que el feed de adopcion no ofrece "seguir la comuna".
--
-- LA WEB TIENE QUE ANDAR CON ESTE SQL SIN APLICAR, y anda:
--   · `p_texto` y `p_edad` tienen default null y el cliente SOLO los manda
--     cuando estan en uso (ver `src/services/busquedaAdopciones.ts`): sin
--     filtros nuevos la llamada es la de siempre y resuelve contra la 0033.
--   · `renovado_en` no entra en ningun `select` del cliente — `adoptions` se
--     lee con `select('*')`. Y `src/lib/cicloVidaAdopcion.ts` distingue la
--     columna AUSENTE (nada esta en pausa) de la columna en null.
--   · `perfil_publico` gana una columna al final; el cliente la lee por nombre
--     y, si no viene, la deja en null en vez de afirmar un cero.
-- ============================================================

-- ------------------------------------------------------------
-- 1. `renovado_en` + backfill (calcado de la 0028 sobre `pets`)
-- ------------------------------------------------------------
-- OJO CON EL ORDEN, Y NO ES UN DETALLE DE ESTILO:
--
-- La 0028 hace esto mismo sobre `pets` en un solo paso —
-- `add column renovado_en timestamptz default now()` y despues
-- `update … where renovado_en is null`— y ese update NO TOCA NINGUNA FILA.
-- Postgres rellena las filas existentes con el default dentro del mismo
-- ALTER, asi que ya no queda ninguna en null. El comentario de la 0028 dice
-- que las viejas se anclan a su creacion; su SQL las ancla al dia de la
-- migracion, y por eso el auto-archivado de `pets` no archivo nada durante los
-- primeros 45 dias. Aca se hace en tres pasos para que el backfill exista de
-- verdad:
--
--   1. la columna nace SIN default -> las filas viejas quedan en null;
--   2. se las ancla a su `creado_en`, que es lo que hace que un aviso
--      abandonado hace un año salga del feed apenas se aplique el SQL (que es
--      el sentido entero de la funcion);
--   3. recien ahi se pone el default, que es solo para las publicaciones
--      nuevas.
alter table public.adoptions
  add column if not exists renovado_en timestamptz;

update public.adoptions set renovado_en = creado_en where renovado_en is null;

alter table public.adoptions
  alter column renovado_en set default now();

-- ------------------------------------------------------------
-- 2. `buscar_adopciones` recreada
--
-- SE PARTE DE LA 0033 (`0033_adopcion_comuna.sql`), NO DE LA 0030. La 0033
-- agrego `p_comuna` y el cliente ya lo manda; recrear desde la vieja borraria
-- el filtro por comuna del feed sin que nada se ponga rojo. Paso exactamente
-- eso con `buscar_reportes` en una tanda anterior.
--
-- El cuerpo de abajo es una COPIA VERBATIM del de la 0033 —incluido el arreglo
-- del cursor de la 0015 (`round(::numeric, 6)` calculado una sola vez en la CTE
-- `calc` y comparado contra ese mismo valor redondeado)— con exactamente cuatro
-- agregados:
--   (a) los parametros `p_texto` y `p_edad`, al final y con default null;
--   (b) sus dos condiciones en el WHERE de `calc`;
--   (c) la condicion de vigencia (auto-archivado perezoso);
--   (d) `renovado_en` en el retorno.
--
-- `create or replace` NO puede cambiar el tipo de retorno de una funcion, y
-- (d) lo cambia: hay que dropear primero. El drop lleva las ONCE posiciones de
-- la 0033 (p_especie, p_tamano, p_comuna, p_lat, p_lng, p_radio_km, p_orden,
-- p_cursor_fecha, p_cursor_id, p_cursor_dist, p_limite). Once, no diez: la
-- decima es la que sumo la 0033. Con una firma equivocada el drop no encuentra
-- nada, no falla, y el create de abajo arma una SOBRECARGA — dos funciones con
-- el mismo nombre y PostgREST fallando por ambiguedad. Por eso, ademas, el
-- bloque de verificacion del final.
-- ------------------------------------------------------------
drop function if exists public.buscar_adopciones(text, text, text, double precision, double precision, double precision, text, timestamptz, uuid, double precision, int);

create function public.buscar_adopciones(
  p_especie text default null,
  p_tamano text default null,
  p_comuna text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radio_km double precision default null,
  p_orden text default 'recientes',            -- 'recientes' | 'cerca'
  p_cursor_fecha timestamptz default null,
  p_cursor_id uuid default null,
  p_cursor_dist double precision default null,
  p_limite int default 20,
  -- NUEVOS (0052). Al final y con default null: los argumentos viajan por
  -- nombre, asi que la posicion no rompe a nadie, y el default deja que la
  -- llamada de once argumentos de siempre siga resolviendo.
  p_texto text default null,
  p_edad text default null                     -- 'cachorro' | 'adulto' | 'senior'
)
returns table (
  id uuid,
  user_id uuid,
  especie pet_especie,
  nombre text,
  descripcion text,
  fotos text[],
  lat double precision,
  lng double precision,
  comuna text,
  edad text,
  tamano text,
  esterilizado text,
  vacunas text,
  convive_ninos text,
  convive_perros text,
  convive_gatos text,
  requisitos text,
  creado_en timestamptz,
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
      a.id, a.user_id, a.especie, a.nombre, a.descripcion, a.fotos,
      a.lat, a.lng, a.comuna, a.edad, a.tamano, a.esterilizado, a.vacunas,
      a.convive_ninos, a.convive_perros, a.convive_gatos, a.requisitos,
      a.creado_en, a.renovado_en,
      case when c.punto is null then null
           else round((st_distance(a.ubicacion, c.punto) / 1000.0)::numeric, 6)
      end as dist
    from public.adoptions a, centro c
    where a.activo = true
      and a.oculto = false
      and a.adoptada_en is null
      -- Radio: ST_DWithin usa el indice GIST; recibe metros.
      and (c.punto is null or p_radio_km is null
           or st_dwithin(a.ubicacion, c.punto, p_radio_km * 1000))
      and (p_especie is null or a.especie::text = p_especie)
      and (p_tamano is null or a.tamano = p_tamano)
      and (p_comuna is null or a.comuna = p_comuna)
      -- NUEVO (0052): texto libre sobre nombre + descripcion, mismo criterio
      -- que `buscar_reportes`. `coalesce` en el nombre porque es nullable y
      -- concatenar un null anula la cadena ENTERA: la fila no matchearia nunca.
      and (p_texto is null or trim(p_texto) = '' or
           (coalesce(a.nombre, '') || ' ' || a.descripcion)
             ilike '%' || trim(p_texto) || '%')
      -- NUEVO (0052): la edad ya se mostraba en la tarjeta; faltaba filtrar.
      and (p_edad is null or a.edad = p_edad)
      -- NUEVO (0052): auto-archivado perezoso. Sin cron: una publicacion no
      -- renovada en 90 dias simplemente deja de aparecer, y su dueño la trae de
      -- vuelta con un toque desde "Mis publicaciones". No se borra nada.
      --
      -- 90 y no los 45 de `pets`: un reporte de mascota perdida se resuelve o
      -- se enfria en semanas, pero una publicacion de adopcion es un catalogo.
      -- Un refugio con 40 animales no puede renovar cada mes y medio, y
      -- archivarle el catalogo seria romperle la app justo a quien queremos
      -- servir. El mismo numero vive en `src/lib/cicloVidaAdopcion.ts` y un
      -- test ata los dos.
      and coalesce(a.renovado_en, a.creado_en) >= now() - interval '90 days'
  )
  select
    calc.id, calc.user_id, calc.especie, calc.nombre, calc.descripcion,
    calc.fotos, calc.lat, calc.lng, calc.comuna, calc.edad, calc.tamano,
    calc.esterilizado, calc.vacunas, calc.convive_ninos, calc.convive_perros,
    calc.convive_gatos, calc.requisitos, calc.creado_en, calc.renovado_en,
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
  limit least(coalesce(p_limite, 20), 100);   -- techo duro: nadie pide 10.000 de una
$$;

-- El drop de arriba lleva `if exists` para poder reaplicar la migracion, y eso
-- lo vuelve SILENCIOSO cuando la firma no calza. Este bloque convierte ese
-- silencio en un error al aplicar el SQL, en vez de en un feed roto por
-- ambiguedad de PostgREST que nadie va a relacionar con esta migracion.
do $$
declare
  v_firmas int;
begin
  select count(*) into v_firmas
    from pg_proc
   where proname = 'buscar_adopciones'
     and pronamespace = 'public'::regnamespace;
  if v_firmas <> 1 then
    raise exception 'buscar_adopciones quedo con % firma(s): el drop no calzo y PostgREST no va a poder resolver cual invocar', v_firmas;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. `perfil_publico` cuenta las adopciones
--
-- Copia de la 0019 con UNA subconsulta mas al final. Se conserva todo lo
-- demas tal cual: `security definer` con `search_path` fijo, la lista de
-- retorno sin telefono (esa lista ES el limite de lo que puede salir de aca),
-- el filtro de cuentas borradas y los dos grants separados.
--
-- La policy aditiva sobre `pets` que la 0019 dejo al final ("reencuentros
-- visibles publicamente") NO se toca: recrear una funcion no es motivo para
-- reescribir de memoria una policy vecina.
--
-- La cuenta usa el MISMO criterio que la policy "adopciones visibles" de la
-- 0030 (activa, no oculta, sin adoptar): lo que dice el numero es exactamente
-- lo que un visitante puede llegar a ver.
-- ------------------------------------------------------------
drop function if exists public.perfil_publico(uuid);

create function public.perfil_publico(p_user_id uuid)
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  red_social text,
  creado_en timestamptz,
  reencuentros bigint,
  reportes bigint,
  aportes bigint,
  adopciones bigint
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
         and ad.adoptada_en is null)
  from public.profiles p
  where p.id = p_user_id
    -- Las cuentas borradas (lapidas) no exponen perfil publico -> cero filas.
    and p.eliminado_en is null;
$$;

revoke all on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to anon;
grant execute on function public.perfil_publico(uuid) to authenticated;

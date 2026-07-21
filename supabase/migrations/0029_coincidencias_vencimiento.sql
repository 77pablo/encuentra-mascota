-- RECONCILIACIÓN func.1 (coincidencias) ↔ func.3 (ciclo de vida)
--
-- La 0028 introdujo el auto-archivado perezoso: un reporte no renovado en 45 días
-- deja de aparecer en buscar_reportes. Por consistencia, un reporte vencido
-- TAMPOCO debería generar ni recibir avisos de coincidencia. Esta migración va
-- DESPUÉS de la 0028 (donde se crea pets.renovado_en) a propósito: la 0026 no
-- podía referenciar esa columna porque todavía no existía.
--
-- Recrea las dos funciones de coincidencia sumando el MISMO filtro de vigencia que
-- usa buscar_reportes: coalesce(renovado_en, creado_en) >= now() - 45 días.

-- ---------------------------------------------------------------------------
-- 1. Trigger encolador: excluir del matching los reportes existentes vencidos
-- ---------------------------------------------------------------------------
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
begin
  -- Brazo A: por cada reporte existente que calza, avisar a SU dueño sobre el
  -- reporte que recién apareció (new). El reporte que recién se publica nunca está
  -- vencido (renovado_en = now() por default), así que solo filtramos los `p`.
  for m in
    select p.id, p.estado, p.especie
    from public.pets p
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
    order by st_distance(p.ubicacion, new.ubicacion) asc, p.id
    limit v_tope
  loop
    insert into public.notification_events (tipo, pet_id, actor_id, datos)
    values ('coincidencia', m.id, new.user_id,
            jsonb_build_object('match_pet_id', new.id,
                               'match_estado', new.estado::text,
                               'match_especie', new.especie::text));

    if not v_hubo then
      v_hubo := true;
      v_cercano_id := m.id;
      v_cercano_estado := m.estado::text;
      v_cercano_especie := m.especie::text;
    end if;
  end loop;

  -- Brazo B: un SOLO aviso al que recién publicó, sobre el match más cercano.
  if v_hubo then
    insert into public.notification_events (tipo, pet_id, actor_id, datos)
    values ('coincidencia', new.id, null,
            jsonb_build_object('match_pet_id', v_cercano_id,
                               'match_estado', v_cercano_estado,
                               'match_especie', v_cercano_especie));
  end if;

  return new;
end; $$;

-- El trigger pets_notificar_coincidencias (0026) sigue apuntando a esta función;
-- create or replace no lo desengancha.

-- ---------------------------------------------------------------------------
-- 2. buscar_coincidencias: excluir los reportes vencidos de las sugerencias
-- ---------------------------------------------------------------------------
-- Misma definición de la 0014 (firma y retorno intactos → create or replace basta)
-- con el filtro de vigencia agregado.
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
  distancia_km double precision
)
language sql
stable
as $$
  with base as (
    select p.id, p.estado, p.especie, p.ubicacion
    from public.pets p
    where p.id = p_pet_id
  )
  select
    p.id, p.estado, p.especie, p.nombre, p.descripcion, p.fotos,
    p.lat, p.lng, p.creado_en,
    st_distance(p.ubicacion, b.ubicacion) / 1000.0 as distancia_km
  from public.pets p, base b
  where p.id <> b.id
    and p.activo = true
    and p.oculto = false
    and p.reunida_en is null
    -- Vigencia (func.3): no sugerir reportes ya archivados por inactividad.
    and coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'
    -- Estado opuesto: a un perdido le sugerimos encontrados, y viceversa.
    and p.estado <> b.estado
    -- Especie compatible: 'otro' hace de comodín en cualquiera de los dos lados.
    and (p.especie = b.especie or p.especie = 'otro' or b.especie = 'otro')
    and st_dwithin(p.ubicacion, b.ubicacion, p_radio_km * 1000)
  order by st_distance(p.ubicacion, b.ubicacion) asc, p.id
  limit least(coalesce(p_limite, 10), 50);
$$;

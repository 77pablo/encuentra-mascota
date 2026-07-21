-- AVISO PROACTIVO DE COINCIDENCIAS
--
-- Las coincidencias perdido↔encontrado ya se calculan (buscar_coincidencias,
-- migración 0014) pero son pasivas: solo las ve quien abre el detalle. Acá las
-- volvemos proactivas: al publicarse un reporte, encolamos un aviso 'coincidencia'
-- para el dueño de cada reporte de estado opuesto que calza, y uno para el que
-- recién publicó sobre el match más cercano. El targeting, el texto y el envío ya
-- los resuelve la infra de 0011 (cola + Edge Function send-notifications).

-- ---------------------------------------------------------------------------
-- 1. Ampliar el CHECK de notification_events.tipo para aceptar 'coincidencia'
-- ---------------------------------------------------------------------------
-- Defensivo (drop if exists + add) a propósito: otra migración de esta tanda
-- (0027) también toca este CHECK para sumar 'escaneo_collar'. Cada una escribe la
-- lista con lo suyo incluido; el merge reconcilia al valor UNIÓN
-- ('reporte_nuevo','avistamiento','pista','coincidencia','escaneo_collar').
-- El constraint inline de 0011 quedó con el nombre autogenerado por Postgres.
alter table public.notification_events
  drop constraint if exists notification_events_tipo_check;
alter table public.notification_events
  add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo', 'avistamiento', 'pista', 'coincidencia'));

-- ---------------------------------------------------------------------------
-- 2. Trigger encolador de coincidencias
-- ---------------------------------------------------------------------------
-- Es un trigger SEPARADO de enqueue_reporte_nuevo (0011) a propósito: distinta
-- responsabilidad, para que un cambio en el aviso de zona no toque el de
-- coincidencia. Corre security definer porque escribe en notification_events, que
-- no tiene políticas RLS (solo la escriben los triggers y la lee la service role).
--
-- La lógica de matching es la MISMA que buscar_coincidencias (0014): estado
-- opuesto, especie compatible ('otro' es comodín en cualquiera de los dos lados),
-- dentro de 15 km, activo, no oculto, no reunido. Tope de 25 por publicación como
-- defensa ante un punto con densidad anómala (buscar_coincidencias en la app usa
-- 10). `ubicacion` es la columna geography generada de 0014: en un AFTER INSERT ya
-- está calculada y disponible en `new`.
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
  -- reporte que recién apareció (new). El evento apunta a m (pet_id = m.id, cuyo
  -- dueño recibe) y describe el match en datos.
  for m in
    select p.id, p.estado, p.especie
    from public.pets p
    where p.id <> new.id
      and p.activo = true
      and p.oculto = false
      and p.reunida_en is null
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

    -- El loop viene ordenado por cercanía: el primero es el match más cercano.
    -- Lo guardamos para el brazo B.
    if not v_hubo then
      v_hubo := true;
      v_cercano_id := m.id;
      v_cercano_estado := m.estado::text;
      v_cercano_especie := m.especie::text;
    end if;
  end loop;

  -- Brazo B: un SOLO aviso al que recién publicó, sobre el match más cercano (en
  -- el detalle ya ve la lista completa; no lo spameamos). actor_id = null: el aviso
  -- es del sistema, no de una persona. Solo si hubo al menos un match.
  -- (match_estado/match_especie del cercano van en datos —adición sobre el spec,
  -- que pedía solo match_pet_id— para que el título del aviso al publicador salga
  -- correcto: "apareció un encontrado/perdido" según el estado del match.)
  if v_hubo then
    insert into public.notification_events (tipo, pet_id, actor_id, datos)
    values ('coincidencia', new.id, null,
            jsonb_build_object('match_pet_id', v_cercano_id,
                               'match_estado', v_cercano_estado,
                               'match_especie', v_cercano_especie));
  end if;

  return new;
end; $$;

create trigger pets_notificar_coincidencias after insert on public.pets
  for each row execute function public.enqueue_coincidencias();

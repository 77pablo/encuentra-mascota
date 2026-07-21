-- ============================================================
-- COMUNAS (Tanda 3 — comunidad por comuna)
--
-- Cada reporte tiene una comuna "casa" y, opcionalmente, comunas de alcance
-- (vecinas que el autor suma para llegar a mas gente). Los usuarios pueden
-- seguir comunas para recibir avisos de reportes nuevos ahi.
-- ============================================================

-- Casa del reporte + alcance a comunas vecinas.
alter table public.pets add column if not exists comuna text;
alter table public.pets add column if not exists comunas_alcance text[] not null default '{}';

-- El feed por comuna filtra `comuna = $1 or $1 = any(comunas_alcance)`.
create index if not exists pets_comuna_idx on public.pets (comuna);
create index if not exists pets_comunas_alcance_gin on public.pets using gin (comunas_alcance);

-- Comunas que sigue cada usuario (para el aviso por comuna).
alter table public.notification_prefs
  add column if not exists comunas_seguidas text[] not null default '{}';

-- El evento de "reporte nuevo" ahora lleva la comuna, para poder avisar a quienes
-- la siguen (targeting por comuna, ADEMAS del de zona GPS que ya existe). Es un
-- `create or replace` sin cambio de firma (devuelve trigger): seguro de reaplicar.
create or replace function public.enqueue_reporte_nuevo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_events (tipo, pet_id, actor_id, datos)
  values ('reporte_nuevo', new.id, new.user_id,
          jsonb_build_object('lat', new.lat, 'lng', new.lng,
                             'especie', new.especie::text, 'estado_pet', new.estado::text,
                             'comuna', new.comuna));
  return new;
end; $$;

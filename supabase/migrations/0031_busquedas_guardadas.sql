-- ============================================================
-- BUSQUEDAS GUARDADAS CON AVISO (Funcion 2 · Tanda de 6)
--
-- Problema: las coincidencias automaticas (0026) solo funcionan si publicaste
-- un reporte. Quien busca sin haber publicado ("avisame si aparece un gato en
-- Nunoa") no tenia ninguna forma de que la app le avisara.
--
-- Esta migracion entrega:
--   1. Tabla `busquedas_guardadas`: una busqueda guardada por usuario
--      (tipo + especie opcional + comuna obligatoria). Tope 5 por usuario via
--      trigger (una policy de RLS no puede contar filas).
--   2. CHECK de `notification_events.tipo` con la lista UNION vigente +
--      'busqueda_guardada' (mismo patron drop+add que 0026/0027).
--   3. Trigger `after insert` sobre `pets`: por cada busqueda guardada que
--      calce con el reporte nuevo, encola un aviso DIRIGIDO (target_user_id,
--      columna que ya trae la 0027 para 'escaneo_collar'), excluyendo al
--      autor del reporte. `distinct on (b.user_id)` deduplica cuando a un
--      mismo usuario le calzan varias busquedas guardadas con el mismo
--      reporte (un solo aviso, no varios).
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA busquedas_guardadas
-- ------------------------------------------------------------
create table public.busquedas_guardadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('perdida', 'encontrada')),
  -- null = cualquier especie. Valores del enum pet_especie (0001) como texto,
  -- igual que `datos.especie` en los eventos de la cola (ver 0011/0020).
  especie text check (especie is null or especie in ('perro', 'gato', 'otro')),
  -- Obligatoria a proposito: sin comuna esto seria "avisame de todo Chile",
  -- que es spam para el resto de la cola.
  comuna text not null check (length(btrim(comuna)) between 1 and 80),
  creado_en timestamptz not null default now()
);
alter table public.busquedas_guardadas enable row level security;

create policy "busquedas propias"
  on public.busquedas_guardadas for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index busquedas_guardadas_user_id_idx on public.busquedas_guardadas (user_id);

-- Tope 5 por usuario: una policy de RLS no puede contar filas, asi que va en
-- un trigger `before insert` (mismo criterio que el rate-limit de 0002/0012).
create function public.limite_busquedas_guardadas() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.busquedas_guardadas where user_id = new.user_id) >= 5 then
    raise exception 'BUSQUEDAS_TOPE';
  end if;
  return new;
end $$;

create trigger trg_limite_busquedas_guardadas before insert on public.busquedas_guardadas
  for each row execute function public.limite_busquedas_guardadas();

-- ------------------------------------------------------------
-- 2. CHECK de notification_events.tipo con la lista UNION vigente
--
-- El orquestador reconcilia este CHECK con el resto de la tanda en el merge;
-- por eso escribimos ya la lista UNION completa (0026 'coincidencia', 0027
-- 'escaneo_collar' + la nuestra 'busqueda_guardada'), para que la ultima
-- migracion aplicada deje el estado correcto sin importar el orden.
-- ------------------------------------------------------------
alter table public.notification_events drop constraint if exists notification_events_tipo_check;
alter table public.notification_events add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo', 'avistamiento', 'pista', 'coincidencia', 'escaneo_collar', 'busqueda_guardada'));

-- ------------------------------------------------------------
-- 3. Trigger de encolado: reporte nuevo -> busquedas guardadas que calcen
--
-- security definer: lee busquedas_guardadas de TODOS los usuarios (la RLS de
-- arriba, "solo dueño", no lo dejaria). Solo inserta en la cola: no expone
-- nada de eso al que publica.
-- ------------------------------------------------------------
create function public.enqueue_busquedas_guardadas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
  select distinct on (b.user_id)
    'busqueda_guardada', new.id, b.user_id, new.user_id,
    jsonb_build_object('estado', new.estado::text, 'especie', new.especie::text,
                       'comuna', new.comuna, 'nombre', new.nombre)
  from public.busquedas_guardadas b
  where b.user_id <> new.user_id
    and b.tipo = new.estado::text
    and (b.especie is null or b.especie = new.especie::text)
    and (b.comuna = new.comuna or b.comuna = any(coalesce(new.comunas_alcance, '{}')));
  return new;
end $$;

create trigger trg_busquedas_guardadas after insert on public.pets
  for each row execute function public.enqueue_busquedas_guardadas();

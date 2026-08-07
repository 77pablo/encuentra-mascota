-- 0069 — MODO EMERGENCIA (v1): eventos (catástrofes) como zona + ventana.
--
-- Un evento es una zona geográfica (centro + radio) y una ventana de tiempo con
-- nombre. NO etiqueta reportes ni crea un tipo nuevo: el feed del evento reusa
-- `buscar_reportes` con el centro/radio del evento y `desde = evento.desde`, así
-- todo reporte publicado en esa zona desde que empezó la emergencia aparece
-- solo. Cero fricción para quien perdió a su animal en la catástrofe.
--
-- LOS EVENTOS LOS SIEMBRA UN ADMIN (SQL / Management API), como la semilla de
-- veterinarias. No hay UI de creación en v1: una catástrofe es rara y la crea
-- quien opera la app. Por eso la RLS deja LEER los activos a cualquiera pero no
-- da NINGUNA policy de escritura: solo `service_role`/postgres inserta.

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text not null default '',
  lat double precision not null,
  lng double precision not null,
  radio_km double precision not null default 30,
  desde timestamptz not null default now(),
  -- `hasta` null = sigue abierto. Un evento cerrado (hasta < now) o inactivo no
  -- se muestra, pero la fila se conserva como historia.
  hasta timestamptz,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.eventos enable row level security;

-- Los eventos ACTIVOS son públicos (anon y authenticated los leen): el banner de
-- Inicio y la pantalla del evento funcionan en modo invitado, igual que los
-- reportes. Un evento inactivo no sale (queda como historia para el admin, que
-- lo lee con service_role).
drop policy if exists "eventos activos visibles" on public.eventos;
create policy "eventos activos visibles"
  on public.eventos for select
  to anon, authenticated
  using (activo = true);

-- SIN policies de insert/update/delete a propósito: en v1 los eventos se
-- siembran con service_role. Si algún día hay UI de admin, se agrega una policy
-- con `es_admin()` (mismo patrón que moderación), no un grant abierto.

-- Defensa en profundidad (misma lección que 0035/0058): revocar cualquier
-- escritura de tabla a anon por si un default de Supabase la hubiera concedido.
-- La lectura va por la policy de arriba (RLS filtra igual), pero quitar el
-- privilegio de tabla cierra una escritura futura antes de que exista la policy.
revoke insert, update, delete on public.eventos from anon;

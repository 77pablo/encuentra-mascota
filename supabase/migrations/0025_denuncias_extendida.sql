-- ============================================================
-- DENUNCIAS EXTENDIDAS (Tanda B, pieza 2)
--
-- La tabla `denuncias` (0003) solo permitía denunciar un REPORTE (pet_id NOT
-- NULL). Apple 1.2 y Play exigen denunciar también a la PERSONA y al CONTENIDO
-- (mensaje, pista, avistamiento). `services/moderation.ts` ya inserta estas
-- columnas; esta migración las crea. Sin ella, denunciar algo que no es un
-- reporte falla en runtime (42703 / NOT NULL de pet_id).
-- ============================================================

-- Qué se está denunciando. Default 'reporte' para que las filas históricas de la
-- 0003 queden consistentes. CHECK con la misma lista cerrada que el cliente.
alter table public.denuncias
  add column if not exists tipo text not null default 'reporte'
  check (tipo in ('reporte', 'usuario', 'mensaje', 'pista', 'avistamiento'));

-- Objeto denunciado según el tipo:
--   reporte      -> pet_id (ya existía)
--   usuario      -> usuario_denunciado
--   mensaje/pista/avistamiento -> objeto_id
alter table public.denuncias add column if not exists objeto_id uuid;
alter table public.denuncias
  add column if not exists usuario_denunciado uuid references public.profiles(id) on delete cascade;
-- Texto libre corto y opcional: sin él, quien revisa lee "acoso" contra un uuid
-- y no puede actuar sobre un mensaje que la RLS no le deja leer.
alter table public.denuncias add column if not exists detalle text;

-- pet_id deja de ser obligatorio (solo aplica a tipo='reporte').
alter table public.denuncias alter column pet_id drop not null;

-- La unique vieja (pet_id, reporter_user) no cubre los tipos nuevos y bloquearía
-- con pet_id NULL. Se reemplaza por una deduplicación por (denunciante, tipo,
-- objeto), donde "objeto" es la columna que corresponde al tipo. Sigue valiendo
-- "una denuncia por persona por cosa".
alter table public.denuncias drop constraint if exists denuncias_pet_id_reporter_user_key;
create unique index if not exists denuncias_dedup_idx
  on public.denuncias (reporter_user, tipo, coalesce(objeto_id, usuario_denunciado, pet_id));

-- Integridad de servidor (la anon key es pública; el formulario no defiende
-- nada): cada tipo debe traer su objeto. Las filas históricas ('reporte' con
-- pet_id) pasan la CHECK.
alter table public.denuncias drop constraint if exists denuncias_objeto_por_tipo;
alter table public.denuncias add constraint denuncias_objeto_por_tipo check (
  (tipo = 'reporte' and pet_id is not null)
  or (tipo = 'usuario' and usuario_denunciado is not null)
  or (tipo in ('mensaje', 'pista', 'avistamiento') and objeto_id is not null)
);

-- Nota: el trigger `denuncias_auto_ocultar` (0003) cuenta denuncias por pet_id
-- para auto-ocultar un reporte a las 3. Con una denuncia de tipo no-reporte,
-- new.pet_id es NULL y el count da 0: no oculta nada y no falla. Correcto: el
-- auto-ocultado es solo para reportes; usuario/mensaje/pista/avistamiento los
-- revisa una persona.

-- ============================================================
-- PREGUNTAS PUBLICAS EN ADOPCIONES (F3)
--
-- Las dudas de adopcion ("¿se lleva bien con gatos?") se repiten por chat
-- privado; publicas sirven a todos, como los comentarios de una red social.
-- Ver docs/superpowers/specs/2026-07-22-tanda-6funciones-pulido-design.md,
-- seccion "F3".
--
-- Esta migracion entrega:
--   1. Tabla `adoption_questions` (1 pregunta, a lo sumo 1 respuesta del
--      dueño de la publicacion) + RLS.
--   2. `denuncias.tipo` suma 'pregunta_adopcion' — drop ROBUSTO por
--      `pg_constraint` (mismo patron que 0030, no por nombre).
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA adoption_questions
-- ------------------------------------------------------------
create table public.adoption_questions (
  id             uuid primary key default gen_random_uuid(),
  adoption_id    uuid not null references public.adoptions(id) on delete cascade,
  user_id        uuid not null references public.profiles(id),
  pregunta       text not null,
  respuesta      text,
  creado_en      timestamptz not null default now(),
  respondido_en  timestamptz,

  -- Longitud — mismo patron 0016: la API es publica (anon key), la base repite
  -- los limites del formulario para que solo los toque quien escriba por fuera
  -- de la app. La pregunta es corta (como una pista, `pet_tips`); la respuesta
  -- del dueño puede ser un poco mas larga (explicar convivencia, requisitos, etc.).
  constraint adoption_questions_pregunta_largo
    check (length(btrim(pregunta)) between 1 and 500),
  constraint adoption_questions_respuesta_largo
    check (respuesta is null or length(btrim(respuesta)) between 1 and 1000)
);

alter table public.adoption_questions enable row level security;

-- Lectura publica: el detalle `/adopcion/:id` es publico (invitado incluido).
-- No se repite el filtro de "adopcion visible" de la 0030 porque el `exists`
-- ya se apoya en la RLS de `adoptions` — si la adopcion esta oculta/inactiva
-- para quien consulta, el `exists` no encuentra fila y la pregunta tampoco se
-- ve (no hace falta duplicar la condicion aca).
create policy "preguntas visibles" on public.adoption_questions
  for select to anon, authenticated
  using (exists (select 1 from public.adoptions a where a.id = adoption_id));

-- Preguntar: solo autenticado, sobre una adopcion que exista/sea visible, y
-- solo a nombre propio.
create policy "preguntar" on public.adoption_questions
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.adoptions a where a.id = adoption_id)
  );

-- Responder: SOLO el dueño de la adopcion, y SOLO las columnas de respuesta
-- (permiso a nivel de columna, patron 0018 — `revoke` + `grant` de columnas
-- puntuales). La policy de `update` habilita la FILA; el grant restringe qué
-- columnas puede tocar ese update, para que el dueño no pueda reescribir la
-- pregunta ajena.
create policy "responder" on public.adoption_questions
  for update to authenticated
  using (exists (
    select 1 from public.adoptions a
    where a.id = adoption_id and a.user_id = auth.uid()
  ));

revoke update on public.adoption_questions from authenticated;
grant update (respuesta, respondido_en) on public.adoption_questions to authenticated;

-- Borrar: el autor de la pregunta o el dueño de la publicacion (mismo criterio
-- que `pet_tips`/pistas: autor o dueño del contenido padre).
create policy "borrar pregunta" on public.adoption_questions
  for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.adoptions a
      where a.id = adoption_id and a.user_id = auth.uid()
    )
  );

-- Se consulta seguido por `adoption_id` (listar preguntas de una publicacion).
create index adoption_questions_adoption_id_idx on public.adoption_questions (adoption_id);

-- ------------------------------------------------------------
-- 2. denuncias.tipo suma 'pregunta_adopcion'
-- ------------------------------------------------------------
-- Mismo motivo y mismo mecanismo EXACTO que la 0030 (lineas ~264-297): la 0025
-- agrego `tipo` con un CHECK inline sin nombrarlo, asi que el nombre real de la
-- restriccion no se puede dar por sentado (`denuncias_tipo_check` es una
-- suposicion, no una garantia). Se recorre `pg_constraint` buscando CUALQUIER
-- CHECK de `public.denuncias` cuya definicion mencione la columna `tipo` y se
-- borra por su nombre real, para no dejar dos CHECK sobre la misma columna (lo
-- que rechazaria en silencio el valor nuevo aunque la migracion "corriera bien").
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.denuncias'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%tipo%'
  loop
    execute format('alter table public.denuncias drop constraint %I', r.conname);
  end loop;
end $$;

-- Lista vigente tras la 0030 ('reporte','usuario','mensaje','pista',
-- 'avistamiento','adopcion') + 'pregunta_adopcion'.
alter table public.denuncias
  add constraint denuncias_tipo_check
  check (tipo in ('reporte', 'usuario', 'mensaje', 'pista', 'avistamiento', 'adopcion', 'pregunta_adopcion'));

-- 0044_impacto_buscando.sql
-- M-4 (diferido de la tanda 8): el contador de la comunidad mentía.
--
-- La tarjeta "Lo que logramos juntos" de Inicio muestra el número `buscando`
-- bajo la etiqueta «mascotas buscando», pero la 0039 lo calculaba como TODOS
-- los reportes vivos (`activo = true and oculto = false`), o sea perdidas MÁS
-- encontradas. Un reporte "encontrada" es una mascota que alguien HALLÓ: no la
-- está buscando nadie desde la app, es justo el caso contrario. El número
-- salía inflado y no decía lo que la etiqueta promete.
--
-- Arreglo: el conteo se restringe a `estado = 'perdida'`. La etiqueta de la
-- app no cambia, así que la app vieja contra esta base sigue mostrando un
-- texto correcto (solo un número más chico y ahora verdadero).
--
-- Por qué NO se separó en dos números (perdidas + encontradas):
--  * la firma de retorno tendría que crecer, y `create or replace` NO puede
--    cambiar el `returns table (...)` de una función: haría falta
--    `drop function` primero (ya nos mordió antes) y una ventana en la que la
--    RPC no existe para nadie;
--  * la tarjeta es una grilla de 2 columnas (`width: 50%` en `impactoItem`):
--    una quinta celda queda huérfana en su propia fila;
--  * "mascotas encontradas esperando" no es "lo que logramos juntos": es
--    estado abierto, no un logro. Si algún día se quiere mostrar, va en otra
--    superficie (Explorar) y no en esta tarjeta.
--
-- OJO al primer sub-select: `reencuentros` queda VERBATIM como en la 0039
-- (`reunida_en is not null and oculto = false`). Está deliberadamente alineado
-- con `countReunidas()` de `src/services/pets.ts` (fix I-1 de la tanda 8): si
-- alguien cambia uno de los dos, la línea "Ya van N vueltas a casa" de Inicio
-- y esta tarjeta vuelven a contradecirse en la misma pantalla.
--
-- La firma no cambia => alcanza `create or replace`, sin `drop function`: la
-- RPC nunca deja de existir y ninguna app (vieja o nueva) ve un hueco.
create or replace function public.impacto_comunidad()
returns table (reencuentros bigint, buscando bigint, adopciones bigint, aportes bigint)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    (select count(*) from public.pets where reunida_en is not null and oculto = false),
    (select count(*) from public.pets where activo = true and oculto = false and estado = 'perdida'),
    (select count(*) from public.adoptions where adoptada_en is not null),
    (select (select count(*) from public.sightings) + (select count(*) from public.pet_tips));
$$;
-- Idénticos a los de la 0039: `create or replace` conserva los privilegios,
-- pero repetirlos deja el archivo autosuficiente y es idempotente.
revoke all on function public.impacto_comunidad() from public;
grant execute on function public.impacto_comunidad() to anon, authenticated;

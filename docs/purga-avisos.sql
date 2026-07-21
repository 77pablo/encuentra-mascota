-- ============================================================
-- AGENDAR LA PURGA DE LA COLA DE AVISOS (pegar en el SQL Editor y RUN)
--
-- Dispara `public.purgar_avisos()` (migracion 0023) una vez por semana para
-- borrar los eventos de `notification_events` ya despachados de mas de 90 dias.
--
-- Va SEPARADO de docs/agendar-avisos.sql (el despachador) a proposito, por dos
-- motivos:
--
--   1. Aislamiento de fallas. Si la purga rompe, el despacho sigue; si el
--      despacho rompe, la purga sigue. Meterla adentro de `send-notifications`
--      habria acoplado un borrado IRREVERSIBLE al camino caliente de los avisos
--      y habria exigido redesplegar la Edge Function.
--   2. No sale de la base. `purgar_avisos()` corre como SQL puro dentro de
--      Postgres: sin HTTP, sin service_role viajando por la red, sin depender de
--      que pg_net este vivo. Menos superficie que cualquier alternativa.
--
-- ANTES DE AGENDAR: correr la funcion de solo lectura contra la base real.
-- Con la base de hoy tiene que devolver 0 filas — esa es la prueba de que la
-- purga no se va a llevar nada por sorpresa:
--
--   select * from public.avisos_a_purgar();
-- ============================================================

create extension if not exists pg_cron;

-- Si ya existia una version anterior de la tarea, la sacamos primero para no
-- terminar con dos purgas agendadas. Mismo guardado condicional que usa
-- docs/agendar-avisos.sql para el despachador.
select cron.unschedule('purgar-avisos')
where exists (select 1 from cron.job where jobname = 'purgar-avisos');

-- Domingo 04:00. Baja frecuencia a proposito: la purga no es urgente y el tope
-- de 5000 por corrida de `purgar_avisos()` hace que un atraso grande se termine
-- de limpiar en corridas sucesivas.
select cron.schedule(
  'purgar-avisos',
  '0 4 * * 0',
  $$ select public.purgar_avisos(); $$
);

-- Para comprobar que quedaron agendados los DOS jobs (despacho y purga):
select jobid, jobname, schedule, active from cron.job
 where jobname in ('despachar-avisos', 'purgar-avisos');

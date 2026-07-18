-- ============================================================
-- AGENDAR EL DESPACHO DE AVISOS (pegar en el SQL Editor y RUN)
-- Hace que la Edge Function 'send-notifications' corra sola
-- cada minuto y vacíe la cola de avisos pendientes.
-- ============================================================

-- pg_cron agenda tareas dentro de la base; pg_net le permite hacer
-- llamadas HTTP hacia la Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Si ya existía una versión anterior de la tarea, la sacamos primero
-- para no terminar con dos despachadores corriendo en paralelo.
select cron.unschedule('despachar-avisos')
where exists (select 1 from cron.job where jobname = 'despachar-avisos');

select cron.schedule(
  'despachar-avisos',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ywlrcfaybnikaurxsgtj.supabase.co/functions/v1/send-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_K1UXXganPME34mfGqvt9vA_DOrcbwr6"}'::jsonb
  );
  $$
);

-- Para comprobar que quedó agendada:
select jobid, jobname, schedule, active from cron.job where jobname = 'despachar-avisos';

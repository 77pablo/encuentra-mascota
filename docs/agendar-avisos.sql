-- ============================================================
-- AGENDAR EL DESPACHO DE AVISOS (pegar en el SQL Editor y RUN)
-- Hace que la Edge Function 'send-notifications' corra sola
-- cada 5 minutos y vacíe la cola de avisos pendientes.
-- ============================================================

-- pg_cron agenda tareas dentro de la base; pg_net le permite hacer
-- llamadas HTTP hacia la Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Si ya existía una versión anterior de la tarea, la sacamos primero
-- para no terminar con dos despachadores corriendo en paralelo.
select cron.unschedule('despachar-avisos')
where exists (select 1 from cron.job where jobname = 'despachar-avisos');

-- Cada 5 minutos, no cada minuto (Tanda D · pieza 2a): -80% de invocaciones a
-- la Edge Function. La cola se llena con eventos de barrio (reportes,
-- avistamientos, pistas), asi que con el uso de hoy la abrumadora mayoria de
-- las corridas leia la cola, encontraba [] y devolvia procesados:0. Un aviso
-- atrasado no se pierde, solo llega hasta 5 min mas tarde: los eventos siguen
-- 'pendiente' hasta que alguien los procese. Eso es lo que hace seguro bajar la
-- frecuencia.
select cron.schedule(
  'despachar-avisos',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ywlrcfaybnikaurxsgtj.supabase.co/functions/v1/send-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_K1UXXganPME34mfGqvt9vA_DOrcbwr6"}'::jsonb
  );
  $$
);

-- Para comprobar que quedó agendada:
select jobid, jobname, schedule, active from cron.job where jobname = 'despachar-avisos';

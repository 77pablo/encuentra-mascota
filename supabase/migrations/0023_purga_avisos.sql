-- ============================================================
-- PURGA DE LA COLA DE AVISOS (Tanda D · pieza 1)
--
-- `notification_events` es una tabla de COLA que en la practica funciona como
-- bitacora permanente: el despachador (send-notifications) solo hace `update`
-- del `estado`, nunca borra. Cada reporte, avistamiento y pista deja una fila
-- para siempre. No molesta hoy (la base esta casi vacia), pero crece sola y el
-- indice `(estado, creado_en)` que usa el despachador se degrada en silencio a
-- medida que la tabla engorda. Se escribe la purga AHORA, que es el momento
-- barato: `avisos_a_purgar()` devuelve 0 y se puede probar sin miedo.
--
-- Ver docs/superpowers/specs/2026-07-19-tanda-d-rendimiento-design.md (pieza 1).
--
-- IMPORTANTE: esta migracion NO agenda nada. El job de pg_cron que dispara la
-- purga vive aparte, en docs/purga-avisos.sql, y se aplica a mano. Aislar el
-- borrado irreversible del despachador es a proposito (ver ese archivo).
-- ============================================================

-- QUE SE BORRA Y QUE NO
--
--   estado = 'enviado'  y  procesado_en < now() - interval '90 days'  -> SE BORRA
--   estado = 'error'                                                   -> NUNCA
--   estado = 'pendiente'                                               -> NUNCA
--
-- Las dos exclusiones son la parte importante:
--
--   · 'error' no se toca JAMAS. Son las unicas filas que dicen "este aviso no
--     salio y por que" (`error_detalle`, agregado en 0013 justo para eso). Son
--     un punado por definicion —un evento llega a 'error' recien tras 3
--     intentos— y con Brevo sin activar y Resend en modo prueba, es la unica
--     forma de enterarse de que los avisos estan rotos.
--   · 'pendiente' es la cola viva. Se escribe el `estado = 'enviado'` EXPLICITO
--     y no se confia en que `procesado_en < ...` ya excluya a los pendientes por
--     tener `procesado_en` nulo: alcanza con que un reintento futuro escriba un
--     `procesado_en` provisorio para que una purga a secas se empiece a comer la
--     cola viva. El `estado = 'enviado'` explicito es la defensa.
--   · 90 dias (no 7 ni 30) porque el borrado es IRREVERSIBLE y en este proyecto
--     ya hubo un Critical por un borrado en cascada que se llevo hilos de chat.
--     90 dias a esta escala son unos pocos miles de filas: la retencion larga no
--     cuesta nada y compra poder investigar "por que no me llego el aviso de
--     hace dos meses".

-- 1. SOLO LECTURA: que se llevaria la purga si corriera ahora.
--
-- Existe para poder responder "que se va a borrar?" ANTES de borrar nada. La
-- verificacion manda correr esto contra la base real antes de agendar el job:
-- con la base de hoy tiene que devolver 0.
create or replace function public.avisos_a_purgar()
returns table (cuantos bigint, mas_viejo timestamptz, mas_nuevo timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select count(*), min(procesado_en), max(procesado_en)
    from public.notification_events
   where estado = 'enviado'
     and procesado_en < now() - interval '90 days';
$$;

-- 2. LA PURGA, con tope por corrida.
--
-- El tope de 5000 es para que la PRIMERA purga sobre un atraso grande no se
-- quede minutos con la tabla tomada mientras los triggers de publicacion
-- intentan insertar. Si sobra trabajo, la proxima corrida semanal lo termina:
-- se autocura sin intervencion.
create or replace function public.purgar_avisos()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  borradas bigint;
begin
  with victimas as (
    select ctid
      from public.notification_events
     where estado = 'enviado'
       and procesado_en < now() - interval '90 days'
     limit 5000
  )
  delete from public.notification_events e
   using victimas v
   where e.ctid = v.ctid;
  get diagnostics borradas = row_count;
  return borradas;
end;
$$;

-- SIN PARAMETROS las dos, misma propiedad que `mi_perfil()` y
-- `anonimizar_mi_cuenta()`: no existe una firma que permita pedir "borra hasta
-- tal fecha". La ventana de 90 dias esta compilada adentro; cambiarla exige una
-- migracion, que se revisa. Y sin `execute` para `anon` ni `authenticated`:
-- solo las llama el `postgres` del cron (ver docs/purga-avisos.sql).
revoke all on function public.avisos_a_purgar() from public, anon, authenticated;
revoke all on function public.purgar_avisos()   from public, anon, authenticated;

-- 3. INDICE PARA LA PURGA
--
-- El indice actual `(estado, creado_en)` sirve para LEER la cola, no para purgar
-- (que filtra por `procesado_en`). Uno parcial, chiquito porque solo indexa lo
-- purgable.
create index if not exists notification_events_purga_idx
  on public.notification_events (procesado_en)
  where estado = 'enviado';

-- 0060: la bandeja de moderación que avisa (tanda 13, función 2).
--
-- Los Términos publicados prometen plazos de retiro (24 h / 72 h / 7 días) y
-- hasta hoy NADA avisaba que entró una denuncia: la bandeja había que abrirla
-- a mano. Se reusa la cola de la 0011: un evento dirigido por admin, que llega
-- a la bandeja in-app (mis_avisos, rama target_user_id) sin tocar la RPC.
--
-- `datos` lleva SOLO claves de listas cerradas (tipo y motivo salen de
-- MOTIVOS_DENUNCIA/TipoDenuncia del cliente): el detalle libre del denunciante
-- NO viaja — puntero, no copia (lección de la tanda 11: la cola sobrevive a
-- la moderación y resucitaba contenido retirado).

alter table public.notification_events drop constraint if exists notification_events_tipo_check;
alter table public.notification_events
  add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo', 'avistamiento', 'pista', 'coincidencia',
                  'escaneo_collar', 'busqueda_guardada', 'avistamiento_anonimo',
                  'denuncia_nueva'));

create or replace function public.enqueue_denuncia_nueva()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
  select 'denuncia_nueva',
         null,          -- sin pet: la bandeja de avisos no debe navegar al contenido denunciado
         a.id,
         null,          -- sin actor: quién denunció no es dato del aviso (la bandeja admin ya lo muestra)
         jsonb_build_object('tipo_denuncia', new.tipo, 'motivo', new.motivo)
    from public.profiles a
   where a.es_admin
     and a.suspendido_en is null
     and a.eliminado_en is null
     and a.id <> new.reporter_user;  -- un admin que denuncia no se auto-avisa
  return new;
end;
$$;

drop trigger if exists trg_denuncia_nueva on public.denuncias;
create trigger trg_denuncia_nueva
  after insert on public.denuncias
  for each row execute function public.enqueue_denuncia_nueva();

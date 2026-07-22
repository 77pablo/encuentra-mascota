-- 0036b_moderacion_rpc.sql
-- Todas las RPC son security definer y abortan si el llamador no es admin.
-- Leen saltandose RLS (por eso definer): un no-admin nunca llega al cuerpo.
--
-- Columnas de contenido verificadas contra el estado real de cada tabla
-- (no contra el brief a ciegas):
--   - pets: especie/descripcion/fotos/oculto (0001/0003).
--   - adoptions: especie/nombre/descripcion/fotos/oculto (0030).
--   - pet_tips: texto (0012).
--   - sightings: nota SI existe (0007), y ademas `foto` (tambien 0007) — se
--     agrega al snapshot porque un avistamiento con foto sin ella en el
--     snapshot deja a quien modera sin ver la evidencia.
--   - adoption_questions: pregunta/respuesta (0032).
--   - messages: texto (0001) + imagen_url. `imagen_url` la crea la migracion
--     0038 de la Funcion 3 de esta misma tanda (se aplican juntas); si 0038
--     no esta aplicada todavia, este SELECT fallaria con 42703 hasta que lo
--     este.

drop function if exists public.moderacion_bandeja();
create function public.moderacion_bandeja()
returns table (
  id uuid, tipo text, motivo text, detalle text, creado_en timestamptz,
  reporter_id uuid, reporter_nombre text,
  denunciado_id uuid, denunciado_nombre text,
  objeto_id uuid, pet_id uuid,
  denuncias_contra_denunciado int,
  contenido jsonb
)
language plpgsql security definer set search_path = public, pg_temp stable
as $$
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  return query
  select d.id, d.tipo, d.motivo, d.detalle, d.creado_en,
         d.reporter_user, rp.nombre,
         d.usuario_denunciado, dp.nombre,
         d.objeto_id, d.pet_id,
         (select count(*)::int from public.denuncias d2
            where d2.usuario_denunciado = d.usuario_denunciado
              and d2.usuario_denunciado is not null),
         case d.tipo
           when 'reporte'  then (select to_jsonb(x) from (
                                   select p.id, p.especie, p.descripcion, p.fotos, p.oculto
                                   from public.pets p where p.id = d.pet_id) x)
           when 'adopcion' then (select to_jsonb(x) from (
                                   select a.id, a.especie, a.nombre, a.descripcion, a.fotos, a.oculto
                                   from public.adoptions a where a.id = d.objeto_id) x)
           when 'pista'    then (select to_jsonb(x) from (
                                   select t.id, t.texto from public.pet_tips t where t.id = d.objeto_id) x)
           when 'avistamiento' then (select to_jsonb(x) from (
                                   select s.id, s.nota, s.foto from public.sightings s where s.id = d.objeto_id) x)
           when 'pregunta_adopcion' then (select to_jsonb(x) from (
                                   select q.id, q.pregunta, q.respuesta from public.adoption_questions q where q.id = d.objeto_id) x)
           when 'mensaje'  then (select to_jsonb(x) from (
                                   select m.id, m.texto, m.imagen_url from public.messages m where m.id = d.objeto_id) x)
           else null
         end
  from public.denuncias d
  left join public.profiles rp on rp.id = d.reporter_user
  left join public.profiles dp on dp.id = d.usuario_denunciado
  where d.estado = 'pendiente'
  order by d.creado_en asc;
end;
$$;
revoke all on function public.moderacion_bandeja() from public, anon;
grant execute on function public.moderacion_bandeja() to authenticated;

-- Retirar: oculta o borra el contenido segun tipo, resuelve la denuncia y
-- cierra las otras denuncias pendientes del mismo objeto.
create or replace function public.moderar_retirar(p_denuncia_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare d public.denuncias%rowtype;
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  select * into d from public.denuncias where id = p_denuncia_id;
  if not found then raise exception 'denuncia inexistente'; end if;

  case d.tipo
    when 'reporte'  then update public.pets set oculto = true where id = d.pet_id;
    when 'adopcion' then update public.adoptions set oculto = true where id = d.objeto_id;
    when 'pista'    then delete from public.pet_tips where id = d.objeto_id;
    when 'avistamiento' then delete from public.sightings where id = d.objeto_id;
    when 'pregunta_adopcion' then delete from public.adoption_questions where id = d.objeto_id;
    when 'mensaje'  then delete from public.messages where id = d.objeto_id;
    else null;
  end case;

  update public.denuncias
     set estado='resuelta', resuelto_en=now(), resuelto_por=auth.uid(), accion='retirado'
   where id = p_denuncia_id;

  -- otras denuncias del mismo objeto salen de la bandeja
  update public.denuncias
     set estado='resuelta', resuelto_en=now(), resuelto_por=auth.uid(), accion='retirado (en lote)'
   where estado='pendiente' and id <> p_denuncia_id and tipo = d.tipo
     and coalesce(objeto_id, pet_id) = coalesce(d.objeto_id, d.pet_id);
end;
$$;
revoke all on function public.moderar_retirar(uuid) from public, anon;
grant execute on function public.moderar_retirar(uuid) to authenticated;

create or replace function public.moderar_descartar(p_denuncia_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  update public.denuncias
     set estado='descartada', resuelto_en=now(), resuelto_por=auth.uid(), accion='descartada'
   where id = p_denuncia_id;
  if not found then raise exception 'denuncia inexistente'; end if;
end;
$$;
revoke all on function public.moderar_descartar(uuid) from public, anon;
grant execute on function public.moderar_descartar(uuid) to authenticated;

create or replace function public.moderar_suspender(p_usuario_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  update public.profiles set suspendido_en = now() where id = p_usuario_id;
  if not found then raise exception 'usuario inexistente'; end if;
end;
$$;
revoke all on function public.moderar_suspender(uuid) from public, anon;
grant execute on function public.moderar_suspender(uuid) to authenticated;

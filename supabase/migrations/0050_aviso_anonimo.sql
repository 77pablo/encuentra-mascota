-- ============================================================
-- AVISAR SIN CUENTA (Tanda 11 · Tarea 2)
--
-- Quien se topa con el perro en la calle es un desconocido: no tiene la app, no
-- se va a registrar, y es justamente la persona que TIENE al animal. Hasta acá
-- le pedíamos cuenta para todo. Esta migración abre el segundo —y último—
-- camino de escritura anónima del proyecto.
--
-- Está calcado de `avisar_escaneo_collar` (0027), que es el patrón ya probado:
--   · `security definer` con search_path fijo;
--   · `grant execute … to anon`, y nada más concedido a anon;
--   · rate-limit por ficha/reporte para que nadie martille el botón;
--   · NO delata si el reporte existe: un id inexistente, uno cerrado y uno
--     ocultado por moderación se comportan exactamente igual que uno válido
--     (retorna sin error). Sin eso, la RPC sería un oráculo para enumerar
--     reportes probando uuids.
--   · `returns void`: no hay ningún valor de salida por el que se pueda colar
--     esa diferencia.
--
-- ADITIVA Y SIN COLUMNAS NUEVAS. La web se sube antes de correr el SQL: sin
-- esta migración la RPC no existe, el cliente lo detecta (PGRST202) y la
-- tarjeta muestra que no se pudo avisar, ofreciendo el botón de contacto. Nada
-- de lo que ya existe cambia de forma.
-- ============================================================

-- ------------------------------------------------------------
-- CHECK de `tipo`: la lista UNIÓN completa.
--
-- Se reescribe entero (drop + add, mismo nombre auto-generado del CHECK inline
-- de la 0011). Los seis tipos anteriores vienen de 0011, 0026, 0027 y 0031: si
-- al copiar la lista se cayera uno, el trigger que lo encola empezaría a fallar
-- y ese aviso dejaría de existir sin que nadie se entere.
-- ------------------------------------------------------------
alter table public.notification_events drop constraint if exists notification_events_tipo_check;
alter table public.notification_events
  add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo', 'avistamiento', 'pista', 'coincidencia', 'escaneo_collar', 'busqueda_guardada', 'avistamiento_anonimo'));

-- El rate-limit de abajo lo dispara CUALQUIERA sin cuenta, y la cola crece sin
-- techo. Sin este índice, cada toque del botón pasea la tabla entera.
create index if not exists notification_events_tipo_pet_idx
  on public.notification_events (tipo, pet_id, creado_en desc);

-- ------------------------------------------------------------
-- RPC avistar_sin_cuenta(p_pet_id, p_nota, p_lat, p_lng)
--
-- La llama la pantalla pública del reporte (`/mascota/:id`, lo que abre el QR
-- de un afiche y todo link compartido) cuando alguien toca "Lo vi acá".
--
-- La ubicación llega YA DIFUMINADA desde el cliente (src/lib/difuminarUbicacion
-- .ts, el mismo borde que usan createPet y addSighting): la coordenada exacta
-- de quien avisa no se guarda en ninguna parte. Acá no se vuelve a difuminar —
-- hacerlo dos veces solo degradaría la precisión sin sumar privacidad.
--
-- `actor_id` va en null a propósito, incluso si hay sesión: la promesa de la
-- pantalla es que se puede avisar sin dejar rastro de quién sos.
-- ------------------------------------------------------------
create function public.avistar_sin_cuenta(
  p_pet_id uuid,
  p_nota text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pet public.pets%rowtype;
begin
  -- `oculto = false` no es de adorno: la función es definer, así que se saltea
  -- la policy de lectura pública de la 0004. Sin filtrarlo, un reporte retirado
  -- por moderación seguiría generándole avisos a su dueño.
  select * into v_pet
    from public.pets
   where id = p_pet_id and activo = true and oculto = false;
  -- Reporte inexistente, cerrado u oculto: no encolamos nada y NO delatamos
  -- cuál de los tres casos es.
  if not found then
    return;
  end if;

  -- Rate-limit por reporte, igual que el collar: si ya se avisó en los últimos
  -- 5 minutos, no repetimos. También retorna en silencio — un "esperá 5
  -- minutos" le confirmaría a quien prueba uuids que ese reporte existe.
  if exists (
    select 1 from public.notification_events ne
    where ne.tipo = 'avistamiento_anonimo'
      and ne.pet_id = p_pet_id
      and ne.creado_en > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
  values (
    'avistamiento_anonimo',
    p_pet_id,
    v_pet.user_id,
    null,
    -- El tope de la nota se repite acá aunque el cliente ya recorte: la RPC es
    -- pública y se puede llamar con curl (misma defensa que la 0016).
    jsonb_build_object(
      'nota', left(coalesce(p_nota, ''), 500),
      'lat', p_lat,
      'lng', p_lng
    )
  );
end;
$$;

revoke all on function public.avistar_sin_cuenta(uuid, text, double precision, double precision) from public;
-- Dos grants separados a propósito (mismo criterio que 0019/0027): un statement
-- por rol es más robusto al copiar/pegar.
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision) to anon;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision) to authenticated;

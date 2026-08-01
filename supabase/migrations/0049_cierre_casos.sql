-- 0049 — CIERRE DE CASOS: que la app pueda preguntar "¿apareció?".
--
-- POR QUÉ: los avisos que nadie cierra son el defecto estructural del rubro.
-- Hoy un reporte se queda abierto para siempre salvo que el dueño entre a
-- cerrarlo a mano, y casi nadie lo hace: quien recupera a su animal deja de
-- abrir la app. El resultado es un mapa lleno de mascotas que ya volvieron a
-- casa, que le hace perder tiempo a quien busca de verdad. Del otro lado, esto
-- produce el número que hoy no tiene nadie en Chile: cuántos reencuentros hay.
--
-- ES ADITIVA Y DEGRADA: dos columnas nullable y una función. Sin aplicarla, la
-- app funciona exactamente igual y la tarjeta ni siquiera se dibuja — el
-- cliente se da cuenta porque `select('*')` no le trae la clave
-- `preguntado_en` (ver src/lib/cierreCasos.ts: hayColumnaDeSeguimiento).
--
-- NO recrea ninguna función anterior, no borra nada, no toca policies ni
-- `notification_events`.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Las dos columnas de seguimiento
-- ───────────────────────────────────────────────────────────────────────────
-- `preguntado_en`: cuándo respondió el dueño por última vez. Es lo que evita
-- repetir el mismo hito (3/7/21 días) y lo que hace que después del último no
-- se pregunte nunca más. Nace null: para un reporte viejo eso significa "no le
-- preguntamos todavía", que es la verdad.
alter table public.pets add column if not exists preguntado_en timestamptz;

-- `cierre_motivo`: POR QUÉ se cerró. Sin esto, `activo = false` mezcla en una
-- sola bolsa tres cosas distintas ("volvió", "me cansé de buscar", "lo cerré
-- por error"), y esa mezcla es justo lo que impide medir reencuentros. Es un
-- dato de producto, no de interfaz: la app no lo muestra en ninguna pantalla.
alter table public.pets add column if not exists cierre_motivo text
  constraint pets_cierre_motivo
  check (cierre_motivo is null or cierre_motivo in ('aparecio', 'sigo_buscando', 'ya_no_busco'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. La RPC que registra la respuesta
-- ───────────────────────────────────────────────────────────────────────────
-- SIN parámetro de usuario a propósito: el dueño sale de `auth.uid()`, nunca de
-- un argumento. Es el mismo patrón de `mi_perfil()` y `anonimizar_mi_cuenta()`,
-- que ya evitó una escalada de privilegios en este repo. Si el id del usuario
-- fuera un parámetro, cualquiera podría cerrar el reporte de otra persona.
--
-- Es `security definer` porque además de cerrar tiene que escribir `reunida_en`
-- y `renovado_en` en una sola operación atómica: partirlo en dos updates desde
-- el cliente deja el estado a medio camino si el segundo falla.
create or replace function public.responder_estado(p_pet_id uuid, p_respuesta text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'no autorizado';
  end if;

  -- Lista blanca en la función además del CHECK de la columna: el CHECK protege
  -- la tabla, esto protege la RAMA de abajo. Un valor desconocido caería en el
  -- `else` de los `case` y cerraría el reporte sin que nadie lo haya pedido.
  if p_respuesta not in ('aparecio', 'sigo_buscando', 'ya_no_busco') then
    raise exception 'respuesta invalida';
  end if;

  update public.pets
     set preguntado_en = now(),
         cierre_motivo = p_respuesta,
         -- "Apareció" REGISTRA EL REENCUENTRO, no solo cierra el reporte. Si
         -- acá solo pusiéramos activo=false, el caso no sumaría al contador de
         -- Inicio (countReunidas), ni a `impacto_comunidad` (0039), ni a la
         -- galería "Volvieron a casa" (listFinalesFelices): los tres filtran
         -- por `reunida_en is not null`. Ese fue un bug real de la tanda 9,
         -- donde cerrar desde el perfil perdía el reencuentro en silencio.
         -- `coalesce` para no pisar la fecha de un reencuentro ya confirmado
         -- con su nota y su foto.
         reunida_en = case when p_respuesta = 'aparecio' then coalesce(reunida_en, now()) else reunida_en end,
         -- "Sigo buscando" es lo ÚNICO que deja el reporte abierto.
         activo = case when p_respuesta = 'sigo_buscando' then activo else false end,
         -- Y además RENUEVA la vigencia: la persona acaba de confirmar a mano
         -- que el reporte está vivo. Sin esto, el auto-archivado de la 0028 se
         -- lo sacaría igual de las búsquedas a los 45 días de publicado, un día
         -- después de que dijo "sigo buscándola". Sería absurdo y cruel.
         renovado_en = case when p_respuesta = 'sigo_buscando' then now() else renovado_en end
   where id = p_pet_id
     and user_id = auth.uid();

  -- Sin esto, responder sobre un reporte AJENO o inexistente devolvería éxito
  -- habiendo hecho cero filas: la app diría "listo" y no habría cambiado nada.
  -- Es exactamente la forma del bug de la 0017 (200 sin haber borrado nada).
  -- El texto es el mismo para "no es tuyo" y para "no existe" a propósito: no
  -- delata cuáles ids existen.
  if not found then
    raise exception 'no se pudo registrar la respuesta';
  end if;
end;
$$;

revoke all on function public.responder_estado(uuid, text) from public, anon;
grant execute on function public.responder_estado(uuid, text) to authenticated;

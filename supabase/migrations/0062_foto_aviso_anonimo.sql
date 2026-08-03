-- 0062: foto en el aviso anónimo (tanda 13, función 4).
--
-- La policy de Storage de la 0001 solo deja subir (insert) a `authenticated`: un anónimo
-- no puede subir nada, y abrir pet-photos a anon sería un depósito de basura
-- mundial en minutos. Única vía: la Edge Function aviso-anonimo-foto
-- (service_role) valida y sube A OTRO bucket, PRIVADO. Decisión de Pablo: la
-- foto solo la ve el dueño, nunca es pública — el daño máximo es una foto fea
-- a una persona, no contenido publicado en una app de mascotas.

insert into storage.buckets (id, name, public)
values ('avisos-anonimos', 'avisos-anonimos', false);

-- Dueño del reporte de la carpeta = único lector. La ruta es
-- <pet_id>/<uuid>.<ext>: el primer segmento ata la foto a su reporte.
create policy "foto de aviso: la ve el dueño del reporte"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avisos-anonimos'
    and exists (
      select 1 from public.pets p
      where p.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

create policy "foto de aviso: la borra el dueño del reporte"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avisos-anonimos'
    and exists (
      select 1 from public.pets p
      where p.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

-- Sin policy de INSERT a propósito: sube solo service_role (la Edge Function).

drop function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text);

create function public.avistar_sin_cuenta(
  p_pet_id uuid,
  p_nota text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_correo text default null,
  p_foto_path text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pet public.pets%rowtype;
  v_nota_norm text;
  v_lat numeric;
  v_lng numeric;
  v_correo text;
begin
  -- La foto solo puede venir de la Edge Function: un anónimo que llame la RPC
  -- directo no puede apuntar a rutas que no subió (ni a las de otro reporte —
  -- la policy de SELECT ya lo pararía, pero mejor ni dejar el puntero).
  if p_foto_path is not null and auth.role() <> 'service_role' then
    p_foto_path := null;
  end if;

  -- `oculto = false` no es de adorno: la funcion es definer, asi que se saltea
  -- la policy de lectura publica de la 0004. Sin filtrarlo, un reporte retirado
  -- por moderacion seguiria generandole avisos a su dueño.
  select * into v_pet
    from public.pets
   where id = p_pet_id and activo = true and oculto = false;
  -- Reporte inexistente, cerrado u oculto: no encolamos nada y NO delatamos
  -- cual de los tres casos es.
  if not found then
    -- Con foto (o sea, llamada de la Edge Function con service_role): avisarle
    -- que el aviso NO entró, sin decir por qué. El anónimo de a pie nunca pasa
    -- por acá con foto (el gate de arriba lo corta), así que esto no es un
    -- oráculo hacia afuera: es una señal interna para que la foto corra la
    -- misma suerte que el aviso.
    if p_foto_path is not null then
      raise exception 'aviso_descartado';
    end if;
    return;
  end if;

  -- Bloqueo (ver 3, arriba). Solo aplica si hay sesion; sin sesion no hay a
  -- quien comparar y `auth.uid()` es null. Silencioso: decir "no se pudo"
  -- confirma el bloqueo y arma al acosador (criterio de la 0022).
  if auth.uid() is not null and exists (
    select 1 from public.bloqueos b
    where (b.bloqueador = v_pet.user_id and b.bloqueado = auth.uid())
       or (b.bloqueador = auth.uid() and b.bloqueado = v_pet.user_id)
  ) then
    -- ver el primer descarte: la foto corre la misma suerte
    if p_foto_path is not null then
      raise exception 'aviso_descartado';
    end if;
    return;
  end if;

  -- ── NUEVO: registrar el correo de seguimiento ──────────────────────────
  -- Va ANTES de los dedupes del aviso: si el vecino toca dos veces, el aviso
  -- se descarta pero su pedido de "avisame si aparece" vale igual.
  if p_correo is not null then
    v_correo := lower(btrim(p_correo));
    if v_correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       and length(v_correo) <= 254
    then
      if (select count(*) from public.seguimientos_anonimos s
           where s.pet_id = p_pet_id) >= 50 then  -- techo: sin esto, cada fila es un correo el día del reencuentro (correo-bombing)
        -- Techo de 50 alcanzado, no agregar más.
        null;
      else
        insert into public.seguimientos_anonimos (pet_id, correo)
        values (p_pet_id, v_correo)
        on conflict (pet_id, correo) do nothing;
      end if;
    end if;
    -- Correo inválido: se ignora en silencio. La RPC es void a propósito
    -- (0050: no ser un oráculo); la validación con mensaje vive en el cliente.
  end if;
  -- ───────────────────────────────────────────────────────────────────────

  -- Forma canonica del aviso, para poder comparar dos avisos entre si:
  --   · la nota, sin mayusculas, sin espacios repetidos y con '' tratado como
  --     ausente (el cliente manda null, pero un curl puede mandar la cadena
  --     vacia y serian el mismo aviso);
  --   · el punto redondeado a 5 decimales (~1 m). Compararlo como texto o como
  --     float suelto haria que dos veces el mismo punto no coincidan consigo
  --     mismo por como se imprime un double.
  v_nota_norm := nullif(lower(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g'))), '');
  v_lat := round(p_lat::numeric, 5);
  v_lng := round(p_lng::numeric, 5);

  -- (a) DEDUPE POR CONTENIDO — el mismo aviso, otra vez.
  --
  -- LA VENTANA ES ASIMETRICA Y ESE ES EL PUNTO. Comparar contenido con una
  -- ventana unica de 5 minutos NO arregla el bug que esta seccion vino a
  -- arreglar, porque el caso MAYORITARIO no tiene contenido que comparar:
  --   · la nota es opcional ("Algo que ayude (opcional)"), y quien sostiene al
  --     perro con una mano y toca el boton con la otra no escribe nada;
  --   · el punto NO se manda nunca — el pedido de GPS se saco en la tanda 11
  --     ("Sumar donde estoy" quedo como codigo muerto), asi que lat/lng son
  --     null en el 100% de los avisos reales.
  -- O sea que para el aviso tipico la clave es (null, null, null) PARA TODO EL
  -- MUNDO, y con `is not distinct from` (null casa con null) los tres vecinos
  -- que escanean el mismo afiche vuelven a colapsar en uno: avisa el primero y
  -- a los otros dos la pantalla les dice "le mandamos tu aviso a su familia"
  -- habiendolo descartado. Exactamente el bug (a) de mas arriba.
  --
  -- Entonces: cuando NO hay nota, la ventana baja a un minuto. Alcanza para lo
  -- unico que el dedupe sin contenido puede distinguir —el doble toque del
  -- mismo dedo— y deja pasar a la segunda persona. Cuando SI hay nota, el
  -- contenido identifica el aviso y la ventana de 5 minutos de la 0050 se
  -- mantiene.
  if exists (
    select 1 from public.notification_events ne
    where ne.tipo = 'avistamiento_anonimo'
      and ne.pet_id = p_pet_id
      and ne.creado_en > now() - (case
            when v_nota_norm is null and v_lat is null and v_lng is null
              then interval '1 minute'
            else interval '5 minutes'
          end)
      and nullif(lower(btrim(regexp_replace(coalesce(ne.datos->>'nota', ''), '\s+', ' ', 'g'))), '')
            is not distinct from v_nota_norm
      and round((ne.datos->>'lat')::numeric, 5) is not distinct from v_lat
      and round((ne.datos->>'lng')::numeric, 5) is not distinct from v_lng
  ) then
    -- ver el primer descarte: la foto corre la misma suerte
    if p_foto_path is not null then
      raise exception 'aviso_descartado';
    end if;
    return;
  end if;

  -- (b) TECHO DE VOLUMEN — y por que vuelve a existir.
  --
  -- La 0050 tenia un tope duro (1 aviso por reporte cada 5 minutos). Al pasar
  -- el corte a "que el aviso sea el mismo", ese techo desaparecio: con notas
  -- distintas no quedaba NINGUN limite. Y cada fila de esta cola es un correo
  -- MAS un push al dueño, con la nota del desconocido citada textual, asi que
  -- sin techo:
  --   · alguien bloqueado cierra sesion y manda 500 avisos numerados, y el
  --     "el acoso posible es un mensaje suelto, no una conversacion" que esta
  --     escrito veinte lineas mas abajo deja de ser cierto;
  --   · el plan de correo son 300 envios/dia PARA TODO EL PROYECTO: 300
  --     llamadas seguidas desde un solo `pet_id` publico dejan sin avisos a
  --     toda la app ese dia (coincidencias incluidas).
  -- La version anterior de este archivo declaraba que el volumen "se ataja en
  -- la capa de pedidos (rate-limit del gateway)". No hay ninguno configurado:
  -- era una mitigacion inexistente, no diferida.
  --
  -- EL TECHO NO ES GRATIS y conviene decirlo: cualquier tope por reporte se
  -- puede ocupar desde afuera con el mismo `pet_id` publico, o sea que
  -- reintroduce en parte el bug (b). Por eso es ALTO y no de 1: 10 por hora
  -- deja pasar a diez personas distintas —un caso real de verdad no llega ni
  -- cerca— mientras que ocupar el cupo cuesta diez pedidos por hora sostenidos
  -- en vez de uno cada cinco minutos. Es peor para el atacante y mejor para el
  -- vecino que el tope de la 0050, que era lo que habia.
  if (
    select count(*) from public.notification_events ne
    where ne.tipo = 'avistamiento_anonimo'
      and ne.pet_id = p_pet_id
      and ne.creado_en > now() - interval '1 hour'
  ) >= 10 then
    -- ver el primer descarte: la foto corre la misma suerte
    if p_foto_path is not null then
      raise exception 'aviso_descartado';
    end if;
    return;
  end if;

  if (
    select count(*) from public.notification_events ne
    where ne.tipo = 'avistamiento_anonimo'
      and ne.pet_id = p_pet_id
      and ne.creado_en > now() - interval '1 day'
  ) >= 30 then
    -- ver el primer descarte: la foto corre la misma suerte
    if p_foto_path is not null then
      raise exception 'aviso_descartado';
    end if;
    return;
  end if;

  insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
  values (
    'avistamiento_anonimo',
    p_pet_id,
    v_pet.user_id,
    null,
    -- El tope de la nota se repite aca aunque el cliente ya recorte: la RPC es
    -- publica y se puede llamar con curl (misma defensa que la 0016).
    jsonb_build_object(
      'nota', left(coalesce(p_nota, ''), 500),
      'lat', p_lat,
      'lng', p_lng,
      'foto', p_foto_path
    )
  );
end;
$$;

revoke all on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text, text) from public;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text, text) to anon;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text, text) to authenticated;

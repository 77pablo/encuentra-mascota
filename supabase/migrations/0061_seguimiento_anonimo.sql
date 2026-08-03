-- 0061: cerrar el círculo con quien avisó desde el afiche (tanda 13, función 3).
--
-- REDESPLEGAR send-notifications ANTES de aplicar esta migración: agrega el
-- tipo 'reencuentro_seguimiento' a la cola, y una función vieja desplegada no
-- lo reconoce (F7, revisión adversarial final: sin el guardián de tipos
-- conocidos, un tipo nuevo se marcaba 'enviado' sin hacer nada).
--
-- Quien avisa desde el link público no deja identidad (actor_id null, 0050):
-- justo el caso más emotivo era el único al que no había a quién avisarle.
-- Correo OPCIONAL y de FINALIDAD ÚNICA (Ley 21.719): tabla propia con purga
-- propia — NO en datos de notification_events, que se purga a los 90 días de
-- enviada mientras este correo se necesita hasta que el caso cierre.

create table public.seguimientos_anonimos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  correo text not null,
  creado_en timestamptz not null default now(),
  unique (pet_id, correo)
);

alter table public.seguimientos_anonimos enable row level security;
-- SIN políticas, a propósito (mismo criterio que notification_events, 0011):
-- invisible para anon y authenticated. Escribe la RPC; lee el trigger.

-- El tipo nuevo entra al CHECK con la lista UNIÓN completa (incluye el
-- 'denuncia_nueva' de la 0060: estas migraciones se aplican en orden).
alter table public.notification_events drop constraint if exists notification_events_tipo_check;
alter table public.notification_events
  add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo', 'avistamiento', 'pista', 'coincidencia',
                  'escaneo_collar', 'busqueda_guardada', 'avistamiento_anonimo',
                  'denuncia_nueva', 'reencuentro_seguimiento'));

-- avistar_sin_cuenta: cambia la firma -> DROP de la de 4 parámetros y CREATE
-- con 5. Los clientes viejos llaman con parámetros nombrados, así que el
-- default de p_correo los mantiene funcionando durante la ventana de deploy.
drop function public.avistar_sin_cuenta(uuid, text, double precision, double precision);

create function public.avistar_sin_cuenta(
  p_pet_id uuid,
  p_nota text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_correo text default null
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
  -- `oculto = false` no es de adorno: la funcion es definer, asi que se saltea
  -- la policy de lectura publica de la 0004. Sin filtrarlo, un reporte retirado
  -- por moderacion seguiria generandole avisos a su dueño.
  select * into v_pet
    from public.pets
   where id = p_pet_id and activo = true and oculto = false;
  -- Reporte inexistente, cerrado u oculto: no encolamos nada y NO delatamos
  -- cual de los tres casos es.
  if not found then
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
    return;
  end if;

  if (
    select count(*) from public.notification_events ne
    where ne.tipo = 'avistamiento_anonimo'
      and ne.pet_id = p_pet_id
      and ne.creado_en > now() - interval '1 day'
  ) >= 30 then
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
      'lng', p_lng
    )
  );
end;
$$;

revoke all on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text) from public;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text) to anon;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text) to authenticated;

-- ── El trigger que cierra el círculo ─────────────────────────────────────
-- Dos finales, no tres. (a) Reencuentro: manda el correo y borra. (b) Cierre
-- sin final feliz: `activo` pasa de true a false — esto cubre 'ya_no_busco' y
-- cualquier otro cierre manual (closePet/responder_estado), y borra sin
-- mandar nada. responder_estado 'aparecio' setea reunida_en y activo = false
-- en el MISMO update: la rama (a) gana porque se evalúa primero.
--
-- OJO: el vencimiento del reporte (45 días sin renovar) es PEREZOSO — se
-- calcula al leer (`renovado_en` en las consultas), nada escribe nunca
-- `activo = false` por vencimiento — así que la rama (b) de este trigger
-- NUNCA corre por esa vía. Un reporte vencido sigue teniendo su fila en
-- `seguimientos_anonimos` sin que nada la borre hasta que el dueño lo cierre
-- a mano o lo borre. La limpieza de vencidos queda como deuda anotada.
create or replace function public.avisar_seguimientos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reunida_en is not null and old.reunida_en is null then
    -- pet_id = null A PROPÓSITO (F6, revisión adversarial final): con
    -- pet_id = new.id, `notification_events.pet_id` es `on delete cascade`
    -- (0011) y borrar el reporte recién reencontrado en la MISMA transacción
    -- que lo borra `avisar_seguimientos` de abajo (`delete from
    -- seguimientos_anonimos`) haría cascadear los eventos 'reencuentro_seguimiento'
    -- pendientes antes de que el cron los despache: correos perdidos. El
    -- nombre ya viaja en datos.nombre; el correo se manda con `petId ?? ''`
    -- (send-notifications/index.ts, degrada a la ruta '/'); `mis_avisos` ya
    -- excluye este tipo por completo (línea ~275), así que no necesita pet_id
    -- para la rama (b) de esa RPC.
    insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
    select 'reencuentro_seguimiento', null, null, null,
           jsonb_build_object('correo', s.correo,
                              'nombre', new.nombre,
                              'especie', new.especie::text)
      from public.seguimientos_anonimos s
     where s.pet_id = new.id;
    delete from public.seguimientos_anonimos where pet_id = new.id;
  elsif new.activo = false and old.activo = true then
    delete from public.seguimientos_anonimos where pet_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pets_seguimientos on public.pets;
create trigger trg_pets_seguimientos
  after update on public.pets
  for each row execute function public.avisar_seguimientos();

-- ── mis_avisos: el evento lleva el correo del vecino en datos; el dueño no
-- tiene por qué verlo (ni un "Tenés una novedad" vacío). MISMA firma:
-- create or replace con el cuerpo VERBATIM de 0051:60-138 sumando UNA línea
-- al where: ──────────────────────────────────────────────────────────────
--   and ne.tipo <> 'reencuentro_seguimiento'
-- ────────────────────────────────────────────────────────────────────────
create or replace function public.mis_avisos(p_limite int default 50)
returns table (
  id uuid,
  tipo text,
  pet_id uuid,
  datos jsonb,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  -- Sin sesion no hay bandeja. El grant ya deja afuera a `anon`, pero el grant
  -- es configuracion (se puede pisar desde el panel) y esto es codigo.
  if auth.uid() is null then
    raise exception 'no autorizado';
  end if;

  return query
    select ne.id, ne.tipo, ne.pet_id, ne.datos, ne.creado_en
      from public.notification_events ne
     where ne.tipo <> 'reporte_nuevo'
       and ne.tipo <> 'reencuentro_seguimiento'
       -- Nadie se avisa a si mismo. Es la misma regla del dispatcher
       -- ("Nunca se le avisa al actor de su propio evento", notifyTargets.ts):
       -- sin esto, dejar una pista en tu propio reporte te llenaria la bandeja.
       and (ne.actor_id is null or ne.actor_id <> auth.uid())
       and (
         -- (a) Destinatario directo, escrito en la fila.
         ne.target_user_id = auth.uid()
         -- (b) Sin destinatario en la fila: es del dueño del reporte. Se exige
         --     `target_user_id is null` para NO caer aca cuando el evento ya
         --     tiene dueño y es otro: un 'busqueda_guardada' lleva el pet_id del
         --     reporte recien publicado (mio, si yo publique) y va dirigido a
         --     quien guardo la busqueda. Sin esta condicion, el que publica veria
         --     los avisos ajenos que genero su propia publicacion.
         or (
           ne.target_user_id is null
           and ne.pet_id is not null
           and exists (
             select 1
               from public.pets p
              where p.id = ne.pet_id
                and p.user_id = auth.uid()
           )
         )
       )
       -- Bloqueo entre personas: si hay bloqueo con el actor, el aviso no se
       -- muestra. Es lo mismo que ya hace el dispatcher para el correo y el push
       -- (`elBloqueoApagaElAviso`) y lo que ya hacen las listas del cliente
       -- (tips.ts / sightings.ts). Sin esto, bloquear apagaba el correo pero la
       -- pista de esa persona seguia entrando por la bandeja.
       --
       -- La EXCEPCION es 'coincidencia', y esta decidida y documentada en
       -- notifyTargets.ts: una coincidencia es el pedido de auxilio de un
       -- animal, no contenido dirigido contra una persona, y el reporte del otro
       -- es publico igual. Si la bandeja la filtrara, la bandeja y el correo
       -- dirian cosas distintas sobre el mismo evento.
       and not exists (
         select 1
           from public.bloqueos b
          where ne.tipo <> 'coincidencia'
            and ne.actor_id is not null
            and (
              (b.bloqueador = auth.uid() and b.bloqueado = ne.actor_id)
              or (b.bloqueador = ne.actor_id and b.bloqueado = auth.uid())
            )
       )
     order by ne.creado_en desc
     -- El tope lo decide la base, no el cliente: `least` corta un p_limite
     -- absurdo y `greatest` evita un `limit 0` o negativo que devolveria una
     -- bandeja vacia que se lee como "no tenes avisos".
     limit least(greatest(p_limite, 1), 200);
end;
$$;

revoke all on function public.mis_avisos(int) from public, anon;
grant execute on function public.mis_avisos(int) to authenticated;

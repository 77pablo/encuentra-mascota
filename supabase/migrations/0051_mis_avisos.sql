-- ============================================================
-- 0051_mis_avisos.sql — LA BANDEJA DE AVISOS, DENTRO DE LA APP
--
-- Hasta hoy NADA en `src/` leia `notification_events`. Un aviso solo existia si
-- salia por correo o por push: si los dos fallaban, se perdia y la persona no se
-- enteraba nunca. Y no es hipotetico — el correo esta fallando ahora mismo (la
-- cuenta de Brevo sin activar), asi que hay avisos encolados que nadie vio.
-- Encima, el onboarding promete "te llega un aviso, no hace falta estar
-- mirando".
--
-- Esta migracion agrega UNA funcion de lectura y dos indices. Nada mas: ni una
-- columna, ni una tabla, ni un trigger, ni un cambio al CHECK de `tipo`.
--
-- SIN APLICAR: `mis_avisos` no existe -> PostgREST devuelve PGRST202 -> la
-- pantalla muestra su estado de error con reintento y el resto del Perfil sigue
-- funcionando igual (ver src/services/avisos.ts y src/screens/AvisosScreen.tsx).
-- ============================================================

-- ------------------------------------------------------------
-- LA RPC, SIN NINGUN PARAMETRO DE IDENTIDAD
--
-- `notification_events` es la unica tabla del proyecto que nace SIN policies
-- (0011: "Cola cruda. SIN políticas: invisible para anon y authenticated").
-- Eso es a proposito y no se toca: la cola guarda a quien se le aviso de que, y
-- exponerla con RLS seria abrir una superficie nueva por cada tipo de evento que
-- se agregue en el futuro. La unica puerta es esta funcion `security definer`.
--
-- Y como adentro corre con la RLS apagada, el destinatario NO puede venir en un
-- argumento: sale de `auth.uid()`. Es el patron de `mi_perfil()` y de
-- `anonimizar_mi_cuenta()` — un `p_user_id` aca seria "leeme la cola de
-- cualquiera", que es exactamente la escalada de privilegios que ese patron ya
-- evito una vez en este repo.
--
-- QUE MUESTRA Y QUE NO (la limitacion honesta):
--
--   · SI, por destinatario directo (`target_user_id`):
--       'escaneo_collar'    (0027) — alguien leyo la placa de tu mascota
--       'busqueda_guardada' (0031) — aparecio algo que calza con tu busqueda
--   · SI, por dueño del reporte (el evento NO trae destinatario y el dispatcher
--     lo resuelve con el `user_id` del `pet_id`; ver armarContexto() en
--     send-notifications/index.ts):
--       'avistamiento' (0011), 'pista' (0011), 'coincidencia' (0026/0029)
--   · NO: 'reporte_nuevo'. Su destinatario NO esta en la fila: se resuelve por
--     ZONA GPS y por comuna seguida, en el dispatcher, contra `alert_zones` y
--     `notification_prefs.comunas_seguidas`. Reproducir ese calculo aca seria
--     duplicar la regla de targeting en un segundo lugar que se desincroniza
--     (el repo ya tiene un archivo espejado, notifyTargets.ts, y lleva un
--     comentario a los gritos justamente por eso). Ademas su `pet_id` es el
--     reporte de QUIEN PUBLICO, asi que la rama de "dueño del reporte" se lo
--     mostraria a la persona equivocada: a si misma.
--
--   La interfaz NO promete que esten todos: dice "los avisos que te llegaron",
--   nunca "todos tus avisos".
--
-- Un tipo NUEVO (por ejemplo 'avistamiento_anonimo', de otra tarea de esta
-- tanda) entra solo si trae `target_user_id` o si su `pet_id` es de un reporte
-- propio. No hace falta tocar esta funcion, y el cliente tiene un texto generico
-- para los tipos que todavia no conoce.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- INDICES
--
-- Los que hay hoy son `(estado, creado_en)` —para que el dispatcher saque la
-- cola pendiente— y `(procesado_en) where estado='enviado'` —para la purga de la
-- 0023—. Ninguno de los dos sirve para leer "los avisos de esta persona", que es
-- una consulta nueva y que ahora corre cada vez que alguien abre el Perfil.
-- Sin estos dos, es un seq scan de la cola entera por apertura de pantalla.
--
-- Van con `if not exists` para poder reaplicar la migracion sin miedo.
-- ------------------------------------------------------------
create index if not exists notification_events_target_idx
  on public.notification_events (target_user_id, creado_en desc)
  where target_user_id is not null;

create index if not exists notification_events_pet_creado_idx
  on public.notification_events (pet_id, creado_en desc)
  where pet_id is not null;

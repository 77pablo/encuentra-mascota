-- ============================================================
-- WEB PUSH (VAPID) — tabla de suscripciones + limpieza en borrado
--
-- Guarda las suscripciones de `PushManager.subscribe()` que hace el navegador
-- (endpoint + llaves p256dh/auth) para poder mandar Web Push real desde las
-- Edge Functions, además del push por Expo que ya existía (solo para la app
-- nativa instalada). Ver `supabase/functions/_shared/webpush.ts`.
-- ============================================================

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- El endpoint es la identidad de la suscripción (una URL única por
  -- navegador+dispositivo+sitio que entrega el push service). `unique` es lo
  -- que hace posible el `upsert(..., { onConflict: 'endpoint' })` del cliente
  -- (`src/lib/webPush.ts`): reactivar en el mismo navegador actualiza la fila
  -- en vez de duplicarla.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);

alter table public.web_push_subscriptions enable row level security;

create index if not exists web_push_subscriptions_user_id_idx
  on public.web_push_subscriptions (user_id);

-- Cada quien gestiona (lee/crea/borra) SOLO sus propias suscripciones: es lo
-- que necesita el cliente para activar/desactivar desde el propio dispositivo.
drop policy if exists "gestionar mis suscripciones web" on public.web_push_subscriptions;
create policy "gestionar mis suscripciones web" on public.web_push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- El dispatcher (`send-notifications`/`send-push`) corre con la service_role
-- key: se saltea RLS para leer las suscripciones de CUALQUIER destinatario y
-- poder despacharle el push. No hace falta una policy propia para eso.

-- ------------------------------------------------------------
-- LIMPIEZA EN BORRADO DE CUENTA
--
-- `anonimizar_mi_cuenta()` (definida en 0017_borrado_cuenta.sql) ya borra de
-- verdad todo lo puramente personal (push_tokens, notification_prefs,
-- favorites, etc.). Las suscripciones web son igual de personales: si no se
-- borran, un push service seguiría teniendo el endpoint de un dispositivo
-- cuyo dueño ya se borró de la app, y el dispatcher intentaría mandarle avisos
-- a una cuenta fantasma (aunque `user_id` ya no resuelva a nadie útil, porque
-- `profiles.id` sigue existiendo como lápida anónima).
--
-- `create or replace` alcanza porque la firma NO cambia (`() returns void`):
-- ver el comentario de 0017 sobre por qué ahí sí hizo falta un `drop`
-- (cambiaba el tipo de retorno respecto a una versión anterior). Acá no.
-- Cuerpo copiado VERBATIM de 0017 + la línea nueva de borrado.
create or replace function public.anonimizar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Hace falta la sesion abierta para borrar la cuenta'
      using errcode = '42501';
  end if;

  -- Idempotente: si ya se anonimizo, no hay nada que hacer. La Edge Function
  -- puede reintentar sin miedo si fallo en un paso posterior.
  if exists (
    select 1 from public.profiles p where p.id = uid and p.eliminado_en is not null
  ) then
    return;
  end if;

  -- Se borra de verdad: puramente personal, sin valor para terceros.
  delete from public.notification_events where actor_id = uid;
  delete from public.push_tokens        where user_id  = uid;
  delete from public.notification_prefs where user_id  = uid;
  delete from public.favorites          where user_id  = uid;
  delete from public.alert_zones        where user_id  = uid; -- donde vive la persona
  -- Nueva en 0037: las suscripciones de Web Push, mismo motivo que push_tokens.
  delete from public.web_push_subscriptions where user_id = uid;
  -- Cascadea a sightings, pet_tips y pet_updates DE ESOS reportes (incluidos
  -- los de terceros): consecuencia aceptada de que el reporte se vaya de verdad.
  delete from public.pets               where user_id  = uid;

  -- Sobreviven apuntando a la lapida: messages (ambas direcciones), y los
  -- sightings/pet_tips que dejo en reportes AJENOS. No se tocan aca.

  update public.profiles
     set nombre       = 'Cuenta eliminada', -- el CHECK no permite vacio
         foto_perfil  = null,
         telefono     = null,
         red_social   = null,
         eliminado_en = now()
   where id = uid;

  return;
end;
$$;

-- Mismo grant que en 0017: solo alguien con sesion puede invocarla, y solo
-- se borra a si mismo. `create or replace` no toca los grants existentes,
-- pero se repite explícito para que esta migración quede autocontenida.
revoke all on function public.anonimizar_mi_cuenta() from public, anon;
grant execute on function public.anonimizar_mi_cuenta() to authenticated;

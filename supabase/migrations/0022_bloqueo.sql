-- ============================================================
-- BLOQUEAR USUARIOS  (Tanda B, pieza 1)
--
-- Apple (1.2) y Google Play exigen que una persona pueda bloquear a otra en una
-- app con contenido y mensajeria entre usuarios. Hoy no existe: la unica salida
-- ante el acoso por chat es borrar la cuenta.
--
-- El diseno completo esta en
-- docs/superpowers/specs/2026-07-19-tanda-b-tiendas-design.md (pieza 1).
-- ============================================================

-- ------------------------------------------------------------
-- 1. La tabla de bloqueos
-- ------------------------------------------------------------
-- Clave compuesta (bloqueador, bloqueado): un bloqueo es dirigido. Un bloqueo
-- mutuo son dos filas independientes. `on delete cascade` en las dos FKs para
-- que borrar una cuenta se lleve sus filas sin dejar referencias colgando.
create table if not exists public.bloqueos (
  bloqueador uuid not null references public.profiles(id) on delete cascade,
  bloqueado  uuid not null references public.profiles(id) on delete cascade,
  creado_en  timestamptz not null default now(),
  primary key (bloqueador, bloqueado),
  -- La CHECK de no-bloquearse-a-si-mismo es la restriccion de servidor que pide
  -- la regla de la casa (0016_validacion_servidor.sql): la API es publica, el
  -- formulario no defiende nada.
  constraint bloqueos_no_a_si_mismo check (bloqueador <> bloqueado)
);

alter table public.bloqueos enable row level security;

-- ------------------------------------------------------------
-- 2. RLS ASIMETRICA A PROPOSITO
-- ------------------------------------------------------------
-- Solo se puede leer/insertar/borrar donde uno es el BLOQUEADOR. Nadie puede
-- leer quien lo bloqueo. Si se pudiera, el bloqueo se convierte en una
-- notificacion de "esta persona te bloqueo", que es justo el combustible de la
-- represalia (crear otra cuenta, escribir por fuera, ir a la direccion del
-- reporte). El bloqueado se entera solo cuando intenta escribir, con un mensaje
-- neutro.
drop policy if exists "veo solo mis bloqueos" on public.bloqueos;
create policy "veo solo mis bloqueos"
  on public.bloqueos for select to authenticated
  using (auth.uid() = bloqueador);

drop policy if exists "bloqueo como yo" on public.bloqueos;
create policy "bloqueo como yo"
  on public.bloqueos for insert to authenticated
  with check (auth.uid() = bloqueador);

drop policy if exists "desbloqueo lo que bloquee" on public.bloqueos;
create policy "desbloqueo lo que bloquee"
  on public.bloqueos for delete to authenticated
  using (auth.uid() = bloqueador);

-- ------------------------------------------------------------
-- 3. EL CORAZON: una funcion anclada a auth.uid()
-- ------------------------------------------------------------
-- El bloqueo tiene que ser efectivo en los DOS sentidos, y ahi choca con la RLS
-- asimetrica: para rechazar el mensaje del bloqueado hay que leer una fila que
-- el no puede leer. Se resuelve con la misma tecnica ya verificada dos veces en
-- este proyecto (mi_perfil(), anonimizar_mi_cuenta()): `security definer` SIN
-- parametro de identidad.
--
-- Un solo parametro, y el otro lado es SIEMPRE auth.uid(). No existe firma que
-- permita preguntar "A bloqueo a B?" por dos terceros. Lo unico que filtra es
-- "uno de los dos bloqueo al otro" -- informacion que el usuario obtiene igual
-- al intentar escribir. Nunca revela la DIRECCION del bloqueo.
--
-- El `drop` no es decorativo: `create or replace` no puede cambiar el tipo de
-- retorno de una funcion existente (ya paso con anonimizar_mi_cuenta() en 0017).
drop function if exists public.hay_bloqueo_con(uuid);

create function public.hay_bloqueo_con(p_otro uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.bloqueos b
     where (b.bloqueador = auth.uid() and b.bloqueado  = p_otro)
        or (b.bloqueador = p_otro     and b.bloqueado  = auth.uid())
  );
$$;

-- Sin sesion no hay a quien comparar: el `revoke` a public/anon hace que una
-- llamada sin token devuelva error de permisos en vez de un `false` enganoso.
revoke all on function public.hay_bloqueo_con(uuid) from public, anon;
grant execute on function public.hay_bloqueo_con(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. QUE EL BLOQUEADO NO PUEDA ESCRIBIRTE
-- ------------------------------------------------------------
-- Se reescribe la politica de insert de `messages`, ya modificada por la 0017
-- para las cuentas eliminadas. Queda con las dos condiciones + la del bloqueo.
--
-- Es en el servidor y no en la pantalla porque la anon key es publica: con curl
-- y un token de sesion se escribe directo a PostgREST, saltandose la app entera.
-- Un bloqueo que solo esconde el boton no es un bloqueo.
--
-- El rechazo llega como 42501 en ambos sentidos (el que bloqueo y el bloqueado).
-- La app lo traduce a algo neutro ("No se pudo enviar el mensaje a esta
-- persona") -- NUNCA "te bloqueo": decirlo confirma el bloqueo y arma al acosador.
drop policy if exists "enviar mensajes como yo" on public.messages;
create policy "enviar mensajes como yo"
  on public.messages for insert to authenticated
  with check (
    auth.uid() = from_user
    and not exists (
      select 1 from public.profiles p
       where p.id = messages.to_user and p.eliminado_en is not null
    )
    and not public.hay_bloqueo_con(messages.to_user)
  );

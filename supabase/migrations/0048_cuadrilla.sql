-- ============================================================
-- CUADRILLA — organizar la búsqueda física del barrio
--
-- POR QUÉ: la búsqueda física del vecindario resuelve el 49% de los casos en
-- perros y el 30% en gatos; la base de datos resuelve entre el 2% y el 6%.
-- El tutor casi siempre TIENE gente dispuesta a ayudar — lo que no tiene es
-- forma de organizarla. Esto es esa forma: un tablero chico de tareas
-- concretas, un link de invitación por WhatsApp, y saber quién tiene qué.
--
-- QUÉ SE CREA (nada más que esto):
--   · cuadrillas          — una por reporte, con el token del link de invitación.
--   · cuadrilla_miembros  — quién está buscando. El dueño también es miembro.
--   · cuadrilla_tareas    — qué hay que hacer, en qué estado y de quién es.
--   · 2 funciones de pertenencia + 3 RPC + 1 trigger.
--
-- REGLA DE ORO DE ESTA MIGRACIÓN: **no toca NADA de lo que ya existe**.
-- Ni una columna nueva en `pets`, ni un trigger en la cola de avisos, ni una
-- policy vieja redefinida. El motivo es concreto y está medido: PostgREST no
-- devuelve datos parciales. Pedir una columna que todavía no existe junto a
-- las viejas hace fallar la consulta ENTERA —
--     GET /rest/v1/pets?select=id,estado,columna_que_no_existe
--     → 400 {"code":"42703","message":"column pets.columna_que_no_existe does
--            not exist"}
-- (comprobado contra el proyecto real el 1-ago-2026) — así que una columna
-- agregada acá y pedida por la app dejaría la ficha del reporte sin cargar
-- para todo el mundo hasta que alguien corriera este archivo. Viviendo en
-- tablas propias, con la migración SIN aplicar la app pide `cuadrillas`,
-- recibe 404/PGRST205 y la sección simplemente no aparece. Todo lo demás
-- sigue igual.
--
-- LO QUE NO HACE, A PROPÓSITO: no encola avisos. Un ayudante NO recibe una
-- notificación cuando le liberan una tarea. Tocar `notification_events` y su
-- Edge Function está fuera de alcance, y prometer un aviso que no mandamos es
-- peor que no tenerlo: por eso la interfaz tampoco lo dice en ninguna parte.
-- ============================================================

-- gen_random_bytes vive en pgcrypto (gen_random_uuid() sí es built-in). Mismo
-- recaudo que la 0027.
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABLAS
-- ------------------------------------------------------------

-- Una cuadrilla por reporte (`unique` en pet_id). `token` es la credencial del
-- link de invitación: 128 bits generados EN EL SERVIDOR por el default, igual
-- que `collar_token` en la 0027. El cliente nunca lo elige y —ver más abajo—
-- tampoco lo puede reescribir, porque esta tabla no tiene policy de update.
create table public.cuadrillas (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null unique references public.pets(id) on delete cascade,
  -- Quien publicó el reporte. Es quien administra: agrega y borra tareas,
  -- destraba las que quedaron tomadas y saca gente si hace falta.
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  creado_en timestamptz not null default now()
);
alter table public.cuadrillas enable row level security;

-- Quién está buscando. El DUEÑO también tiene su fila acá (la crea
-- `crear_cuadrilla`): así "ser de la cuadrilla" es una sola pregunta, y una
-- cuadrilla de una persona sola ya es una lista de tareas que le sirve a él.
create table public.cuadrilla_miembros (
  id uuid primary key default gen_random_uuid(),
  cuadrilla_id uuid not null references public.cuadrillas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  unique (cuadrilla_id, user_id)
);
alter table public.cuadrilla_miembros enable row level security;

-- Las tareas del tablero. Tres estados y nada más: pendiente (nadie la tomó),
-- tomada (alguien se hizo cargo), hecha.
create table public.cuadrilla_tareas (
  id uuid primary key default gen_random_uuid(),
  cuadrilla_id uuid not null references public.cuadrillas(id) on delete cascade,
  titulo text not null,
  estado text not null default 'pendiente',
  -- on delete set null: si quien la tomó borra su cuenta, la tarea no se va con
  -- ella. Queda visible y el CHECK de abajo la devuelve a 'pendiente' recién en
  -- el próximo update — por eso la app también trata `tomada_por is null` como
  -- "libre" al pintar.
  tomada_por uuid references public.profiles(id) on delete set null,
  tomada_en timestamptz,
  creado_en timestamptz not null default now(),
  -- Mismo tope que el formulario (defensa repetida en la base, criterio 0016).
  -- Una tarea es un renglón que se lee de un vistazo, no una descripción.
  constraint cuadrilla_tareas_titulo_largo check (length(btrim(titulo)) between 1 and 120),
  constraint cuadrilla_tareas_estado check (estado in ('pendiente', 'tomada', 'hecha')),
  -- El estado y el dueño de la tarea no pueden contradecirse. Sin esto se puede
  -- guardar una tarea 'tomada' sin nadie que la tenga (queda trabada para
  -- siempre) o una 'pendiente' con dueño (invisible para quien la tomó).
  constraint cuadrilla_tareas_estado_coherente check (
    (estado = 'pendiente') = (tomada_por is null)
  )
);
alter table public.cuadrilla_tareas enable row level security;

create index cuadrilla_miembros_cuadrilla_idx on public.cuadrilla_miembros (cuadrilla_id);
create index cuadrilla_miembros_user_idx on public.cuadrilla_miembros (user_id);
create index cuadrilla_tareas_cuadrilla_idx on public.cuadrilla_tareas (cuadrilla_id, creado_en);

-- ------------------------------------------------------------
-- PERTENENCIA
--
-- Las dos son `security definer` por una razón técnica, no de permisos:
-- `es_de_la_cuadrilla` se usa DENTRO de la policy de `cuadrilla_miembros`. Sin
-- definer, leer miembros exigiría leer miembros y Postgres corta con
-- "infinite recursion detected in policy for relation". Es el patrón estándar.
--
-- No filtran nada: solo responden por auth.uid(), o sea sobre uno mismo.
-- ------------------------------------------------------------
create function public.es_de_la_cuadrilla(p_cuadrilla_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.cuadrilla_miembros m
    where m.cuadrilla_id = p_cuadrilla_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.es_de_la_cuadrilla(uuid) from public, anon;
grant execute on function public.es_de_la_cuadrilla(uuid) to authenticated;

-- ¿Soy quien publicó el reporte de esta cuadrilla? (el que administra)
create function public.manda_en_la_cuadrilla(p_cuadrilla_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.cuadrillas c
    where c.id = p_cuadrilla_id and c.user_id = auth.uid()
  );
$$;

revoke all on function public.manda_en_la_cuadrilla(uuid) from public, anon;
grant execute on function public.manda_en_la_cuadrilla(uuid) to authenticated;

-- ------------------------------------------------------------
-- RLS · cuadrillas
-- ------------------------------------------------------------

-- La cuadrilla NO es pública: solo la ven quienes están adentro. Quien abre el
-- link sin ser miembro todavía no lee esta tabla — lee la vista previa por RPC.
create policy "ver la cuadrilla en la que estoy"
  on public.cuadrillas for select to authenticated
  using (user_id = auth.uid() or public.es_de_la_cuadrilla(id));

-- Solo quien publicó el reporte la arma, y a su nombre. (La RPC `crear_cuadrilla`
-- es la vía normal; esta policy es la red de contención si alguien insertara
-- directo contra PostgREST.)
create policy "solo el dueño del reporte arma su cuadrilla"
  on public.cuadrillas for insert to authenticated
  with check (
    user_id = auth.uid()
    and auth.uid() = (select p.user_id from public.pets p where p.id = pet_id)
  );

-- Disolverla: se lleva miembros y tareas por cascade. El link deja de servir.
create policy "el dueño disuelve su cuadrilla"
  on public.cuadrillas for delete to authenticated
  using (user_id = auth.uid());

-- NO HAY POLICY DE UPDATE, y es a propósito: sin ella nadie —ni el dueño—
-- puede reescribir `token` ni `pet_id` desde el cliente. Un token no es un
-- campo editable, es una credencial. Para invalidar un link, se disuelve la
-- cuadrilla y se arma de nuevo.

-- ------------------------------------------------------------
-- RLS · cuadrilla_miembros
-- ------------------------------------------------------------

create policy "ver quiénes somos en mi cuadrilla"
  on public.cuadrilla_miembros for select to authenticated
  using (
    public.es_de_la_cuadrilla(cuadrilla_id)
    or public.manda_en_la_cuadrilla(cuadrilla_id)
  );

-- NO HAY POLICY DE INSERT. Sumarse pasa SÍ O SÍ por `sumarme_a_la_cuadrilla`,
-- que exige el TOKEN. Con un insert directo alcanzaría con conocer (o ver de
-- refilón) un `cuadrilla_id` para meterse en la búsqueda de un desconocido.

-- Irse por voluntad propia, o que el dueño saque a alguien que no corresponde.
create policy "irme de la cuadrilla o sacar a alguien"
  on public.cuadrilla_miembros for delete to authenticated
  using (user_id = auth.uid() or public.manda_en_la_cuadrilla(cuadrilla_id));

-- ------------------------------------------------------------
-- RLS · cuadrilla_tareas
-- ------------------------------------------------------------

create policy "ver las tareas de mi cuadrilla"
  on public.cuadrilla_tareas for select to authenticated
  using (public.es_de_la_cuadrilla(cuadrilla_id));

create policy "el dueño agrega tareas"
  on public.cuadrilla_tareas for insert to authenticated
  with check (public.manda_en_la_cuadrilla(cuadrilla_id));

create policy "el dueño borra tareas"
  on public.cuadrilla_tareas for delete to authenticated
  using (public.manda_en_la_cuadrilla(cuadrilla_id));

-- Tomar / soltar / cerrar.
--   · `using`      mira la fila ANTES: se puede tocar una tarea libre, la
--                  propia, o cualquiera si sos el dueño del reporte.
--   · `with check` mira la fila DESPUÉS, y es lo que impide asignarle una
--                  tarea a un tercero: el resultado tiene que quedar libre o a
--                  nombre de uno mismo (salvo que mande el dueño, que además
--                  puede destrabar la de un ayudante que desapareció).
-- Sin el `with check`, un ayudante podría tomar una tarea libre y en el mismo
-- update ponerle `tomada_por` = otra persona.
create policy "tomar, soltar y cerrar tareas"
  on public.cuadrilla_tareas for update to authenticated
  using (
    public.es_de_la_cuadrilla(cuadrilla_id)
    and (
      tomada_por is null
      or tomada_por = auth.uid()
      or public.manda_en_la_cuadrilla(cuadrilla_id)
    )
  )
  with check (
    public.es_de_la_cuadrilla(cuadrilla_id)
    and (
      tomada_por is null
      or tomada_por = auth.uid()
      or public.manda_en_la_cuadrilla(cuadrilla_id)
    )
  );

-- La RLS de Postgres es por FILA, no por columna: la policy de arriba, que deja
-- tomar una tarea, dejaría también cambiarle el TÍTULO. Un ayudante reescribir
-- las instrucciones del tablero de otra persona no es aceptable, y la única
-- forma de acotarlo es un trigger.
create function public.cuadrilla_tarea_solo_su_estado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- El dueño del reporte edita lo que quiera.
  if public.manda_en_la_cuadrilla(new.cuadrilla_id) then
    return new;
  end if;
  if new.titulo is distinct from old.titulo
     or new.cuadrilla_id is distinct from old.cuadrilla_id
     or new.creado_en is distinct from old.creado_en then
    raise exception 'Solo quien publicó el reporte puede editar las tareas.';
  end if;
  return new;
end;
$$;

create trigger cuadrilla_tareas_solo_estado
  before update on public.cuadrilla_tareas
  for each row execute function public.cuadrilla_tarea_solo_su_estado();

-- ------------------------------------------------------------
-- RPC crear_cuadrilla(p_pet_id, p_tareas)
--
-- Arma la cuadrilla Y sus tareas sugeridas en UNA transacción. Si esto fueran
-- dos llamadas del cliente y la segunda fallara, el dueño se quedaría con un
-- tablero vacío — que es exactamente el estado que esta función existe para
-- evitar.
--
-- Es `security definer` porque tiene que insertar en `cuadrilla_miembros`, que
-- no tiene policy de insert. Por eso el gate de propiedad va ADENTRO (mismo
-- criterio que `moderar_*` en la 0040/0045): si viviera afuera, cualquier
-- autenticado armaría una cuadrilla sobre el reporte de otra persona.
--
-- No lleva rate-limit propio: solo puede existir UNA cuadrilla por reporte
-- (`unique` en pet_id) y la creación de reportes ya está limitada por la 0002.
-- ------------------------------------------------------------
create function public.crear_cuadrilla(p_pet_id uuid, p_tareas text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dueno uuid;
  v_id uuid;
  v_titulo text;
  v_creadas int := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás tener la sesión abierta para armar la cuadrilla.';
  end if;

  select p.user_id into v_dueno from public.pets p where p.id = p_pet_id;
  if v_dueno is null then
    raise exception 'Ese reporte ya no existe.';
  end if;
  if v_dueno <> auth.uid() then
    raise exception 'Solo quien publicó el reporte puede armar la cuadrilla.';
  end if;

  -- Idempotente. El caso real: el dueño toca "Organizar la búsqueda", se va,
  -- vuelve y toca de nuevo. Sin esto la lista queda con las tareas repetidas.
  select c.id into v_id from public.cuadrillas c where c.pet_id = p_pet_id;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.cuadrillas (pet_id, user_id)
  values (p_pet_id, auth.uid())
  returning id into v_id;

  -- El dueño es miembro de su propia cuadrilla.
  insert into public.cuadrilla_miembros (cuadrilla_id, user_id)
  values (v_id, auth.uid());

  -- Las sugeridas las arma el cliente (`src/lib/cuadrilla.ts`), porque dependen
  -- de la comuna, del nombre y de la especie, y ahí se pueden probar solas. Acá
  -- se validan igual: la API es pública y este arreglo puede venir de cualquier
  -- lado.
  foreach v_titulo in array coalesce(p_tareas, '{}')
  loop
    exit when v_creadas >= 12;  -- un tablero es para leerlo de un vistazo
    if length(btrim(v_titulo)) between 1 and 120 then
      insert into public.cuadrilla_tareas (cuadrilla_id, titulo)
      values (v_id, btrim(v_titulo));
      v_creadas := v_creadas + 1;
    end if;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.crear_cuadrilla(uuid, text[]) from public, anon;
grant execute on function public.crear_cuadrilla(uuid, text[]) to authenticated;

-- ------------------------------------------------------------
-- RPC cuadrilla_por_invitacion(p_token)  ·  SE PUEDE MIRAR SIN CUENTA
--
-- La vista previa del link: qué mascota es, cuánta gente hay y cuánto falta.
-- Se le concede a `anon` a propósito. Que el link de WhatsApp sea una pared de
-- login antes de decir de qué se trata es la forma más rápida de que nadie se
-- sume, y quien lo abre es un vecino al que le acaban de pedir ayuda.
--
-- Privacidad: NO devuelve user_id, contacto, el token ni las coordenadas. Lo
-- que devuelve del reporte ya es público por la 0004 (la ficha se ve sin sesión
-- en /mascota/:id) más dos números de la propia cuadrilla. Token inexistente →
-- 0 filas, indistinguible de "no existe", igual que `mascota_por_collar`.
-- ------------------------------------------------------------
create function public.cuadrilla_por_invitacion(p_token text)
returns table (
  pet_id uuid,
  mascota text,
  especie pet_especie,
  foto text,
  comuna text,
  reporte_activo boolean,
  ayudantes int,
  tareas_pendientes int,
  ya_estoy boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.id,
    -- El contenido del reporte SOLO si sigue siendo publico.
    --
    -- `oculto` lo pone la moderacion (0003 / `moderar_ocultar` de la 0040), y la
    -- lectura publica de `pets` lo respeta desde la 0004
    -- (`using (activo = true and oculto = false)`). Esta funcion es definer, o
    -- sea que se saltea esa policy: sin este filtro, una foto retirada por
    -- moderacion se seguia sirviendo a cualquiera que tuviera el link de
    -- invitacion —que para entonces ya dio la vuelta por WhatsApp— y sin
    -- necesidad de cuenta. Es la misma forma del `using(true)` que expuso las
    -- adopciones ocultas en su momento.
    --
    -- La fila se devuelve igual (la cuadrilla existe, y quien ya estaba adentro
    -- tiene que poder entrar); lo que se corta es el contenido moderado.
    case when p.oculto then null else p.nombre end,
    p.especie,
    case when p.oculto then null else p.fotos[1] end,
    case when p.oculto then null else p.comuna end,
    (p.activo and not p.oculto and p.reunida_en is null),
    (select count(*)::int from public.cuadrilla_miembros m where m.cuadrilla_id = c.id),
    (select count(*)::int from public.cuadrilla_tareas t
      where t.cuadrilla_id = c.id and t.estado = 'pendiente'),
    -- Para que quien ya se sumó y vuelve a abrir el link entre derecho, sin que
    -- la pantalla le pida sumarse de nuevo.
    (auth.uid() is not null and exists (
      select 1 from public.cuadrilla_miembros m
      where m.cuadrilla_id = c.id and m.user_id = auth.uid()
    ))
  from public.cuadrillas c
  join public.pets p on p.id = c.pet_id
  where c.token = p_token;
$$;

revoke all on function public.cuadrilla_por_invitacion(text) from public;
-- Dos grants separados (mismo criterio que 0019/0027): un statement por rol es
-- más robusto al copiar y pegar.
grant execute on function public.cuadrilla_por_invitacion(text) to anon;
grant execute on function public.cuadrilla_por_invitacion(text) to authenticated;

-- ------------------------------------------------------------
-- RPC sumarme_a_la_cuadrilla(p_token)  ·  ESTO SÍ PIDE CUENTA
--
-- DECISIÓN TOMADA A PROPÓSITO, y en contra del atajo fácil. El repo tiene un
-- camino de escritura anónima (`avisar_escaneo_collar`, 0027) y no se copia acá.
-- La diferencia no es de comodidad, es de forma:
--
--   · el collar es fuego y olvido: encola UN aviso, no deja estado que otro
--     tenga que mirar después, y nadie depende de quién lo mandó;
--   · sumarse a una cuadrilla deja estado PERSISTENTE Y COMPARTIDO. Una tarea
--     tomada por un anónimo no se le puede sacar, no se sabe a quién
--     recordarle, y el dueño mira el tablero y ve "alguien" recorriendo sus
--     cuadras. Peor todavía, sin identidad no hay a quién bloquear si el que se
--     sumó es justo la persona de la que se está protegiendo.
--
-- El costo de pedir cuenta está acotado a propósito: la VISTA PREVIA es
-- anónima, así que la fricción llega recién cuando la persona ya decidió
-- ayudar. Y el registro de la app es de una pantalla. De yapa, cada ayudante
-- invitado es un usuario nuevo del barrio correcto, que es exactamente el
-- problema de fondo del producto.
-- ------------------------------------------------------------
create function public.sumarme_a_la_cuadrilla(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_cuantos int;
begin
  if auth.uid() is null then
    raise exception 'Necesitás una cuenta para sumarte a la cuadrilla.';
  end if;

  select c.id into v_id from public.cuadrillas c where c.token = p_token;
  if v_id is null then
    -- Token gastado o inventado: no se delata que no existe (mismo criterio
    -- que la RPC del collar).
    return null;
  end if;

  -- Tope de tamaño: una cuadrilla es el barrio, no una lista de difusión. Y sin
  -- tope, un token que se filtró convierte la tabla en un buzón abierto para
  -- cualquier autenticado.
  select count(*) into v_cuantos
  from public.cuadrilla_miembros m where m.cuadrilla_id = v_id;
  if v_cuantos >= 30 then
    raise exception 'Esta cuadrilla ya está completa.';
  end if;

  insert into public.cuadrilla_miembros (cuadrilla_id, user_id)
  values (v_id, auth.uid())
  on conflict (cuadrilla_id, user_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.sumarme_a_la_cuadrilla(text) from public, anon;
grant execute on function public.sumarme_a_la_cuadrilla(text) to authenticated;

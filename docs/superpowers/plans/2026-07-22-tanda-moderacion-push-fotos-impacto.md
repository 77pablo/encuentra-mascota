# Tanda moderación + push web + fotos chat + impacto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a "Encuentra tu Mascota" cuatro funciones: un panel de moderación de denuncias solo-admin, push web real (VAPID) para la PWA, fotos en el chat, y una tarjeta pública de impacto de la comunidad.

**Architecture:** Cuatro funciones **independientes** (se pueden construir en paralelo con un implementador por función). Cada una: una migración nueva (`0036`–`0039`), servicio(s) cliente, UI, y donde aplica cambios en Edge Functions / service worker. El privilegio de admin y la suspensión siguen el patrón ya probado del repo: funciones `security definer` que chequean permiso por dentro (como `mi_perfil()`/`hay_bloqueo_con()`), nunca RLS ancha.

**Tech Stack:** Expo (React Native + TS, corre en web), Supabase (Postgres+RLS, Storage, Edge Functions Deno), jest, Playwright para E2E. Web Push con VAPID.

## Global Constraints

- **Migraciones nuevas numeradas, nunca editar una ya aplicada.** Números libres: `0036`–`0039`. Project ref: `ywlrcfaybnikaurxsgtj`.
- **`create or replace` NO puede cambiar el tipo de retorno** de una función Postgres → `drop function` antes de recrear una función con firma distinta.
- **`profiles` tiene grants fail-closed por columna (0018):** una columna nueva NO queda legible por defecto. Un dato privado se expone por `mi_perfil()`, no por `select`.
- **`notifyTargets.ts` está DUPLICADO a mano:** `src/lib/notifyTargets.ts` y `supabase/functions/send-notifications/notifyTargets.ts`. Todo cambio de reglas va en LOS DOS + mantener verde el test-espejo.
- **Copy de UI:** cálido y humano, sin tono corporativo ni infantil (regla de diseño de Pablo). Íconos de línea (Ionicons), no emojis a color en superficies de UI (salvo los ya usados como 🎉 en tiras existentes).
- **Modo oscuro:** toda pantalla/estilo nuevo usa `const colors = useColors(); const styles = useMemo(() => crearEstilos(colors), [colors]);` y `crearEstilos(colors: Colors)`. Nunca `import` estático de `colors`.
- **Tests de componentes** importan desde `../ui/AppText` DIRECTO (no el barrel `../ui`, rompe jest).
- **Verde antes de commitear cada tarea:** `npx tsc --noEmit` limpio y `npm test` verde.

---

# FUNCIÓN 1 — Panel de moderación

## Task 1: Migración `0036` — admin, suspensión y estado de denuncias

**Files:**
- Create: `supabase/migrations/0036_moderacion_admin.sql`

**Interfaces:**
- Produces (para SQL/RPC de tareas siguientes): columna `profiles.es_admin boolean`, `profiles.suspendido_en timestamptz`; columnas `denuncias.estado/resuelto_en/resuelto_por/accion`; funciones `es_admin()`, `estoy_suspendido()`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 0036_moderacion_admin.sql
-- Admin, suspension de cuentas y ciclo de estado de las denuncias.
-- El privilegio NO se abre con RLS ancha: todo pasa por RPC security definer
-- (0036b) que chequean es_admin() por dentro, el patron de mi_perfil().

-- 1) Bandera de admin y de suspension en profiles.
alter table public.profiles add column if not exists es_admin boolean not null default false;
alter table public.profiles add column if not exists suspendido_en timestamptz;

-- profiles tiene grant fail-closed por columna (0018). es_admin es un dato del
-- dueño: se expone SOLO por mi_perfil() (0036c), no se agrega al grant publico.
-- suspendido_en tampoco se concede a nadie: solo lo leen funciones definer.

-- 2) Ciclo de estado de las denuncias.
alter table public.denuncias add column if not exists estado text not null default 'pendiente'
  check (estado in ('pendiente','resuelta','descartada'));
alter table public.denuncias add column if not exists resuelto_en timestamptz;
alter table public.denuncias add column if not exists resuelto_por uuid references public.profiles(id);
alter table public.denuncias add column if not exists accion text;
create index if not exists denuncias_estado_idx on public.denuncias (estado, creado_en);

-- 3) Gate de admin. security definer para poder mirar profiles.es_admin aunque
--    la RLS/grants no lo expongan al llamador.
create or replace function public.es_admin()
returns boolean
language sql security definer set search_path = public, pg_temp stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and es_admin);
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- 4) Gate de suspension. Lo consultan las policies de insert de contenido.
create or replace function public.estoy_suspendido()
returns boolean
language sql security definer set search_path = public, pg_temp stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and suspendido_en is not null);
$$;
revoke all on function public.estoy_suspendido() from public, anon;
grant execute on function public.estoy_suspendido() to authenticated;

-- 5) Enforcement: un suspendido no publica ni escribe. Se recrea cada policy
--    de INSERT conservando VERBATIM su condicion vigente y sumando el gate.
--    (Leer las policies actuales antes de tocar; aca van con su condicion al
--    dia de 0035. La de messages arrastra 3 condiciones desde 0022.)

drop policy if exists "crear mis reportes" on public.pets;
create policy "crear mis reportes" on public.pets for insert to authenticated
  with check (auth.uid() = user_id and not public.estoy_suspendido());

drop policy if exists "crear mis adopciones" on public.adoptions;
create policy "crear mis adopciones" on public.adoptions for insert to authenticated
  with check (auth.uid() = user_id and not public.estoy_suspendido());

drop policy if exists "crear mis pistas" on public.pet_tips;
create policy "crear mis pistas" on public.pet_tips for insert to authenticated
  with check (auth.uid() = autor and not public.estoy_suspendido());

drop policy if exists "crear mis avistamientos" on public.sightings;
create policy "crear mis avistamientos" on public.sightings for insert to authenticated
  with check (auth.uid() = user_id and not public.estoy_suspendido());

drop policy if exists "crear mis preguntas" on public.adoption_questions;
create policy "crear mis preguntas" on public.adoption_questions for insert to authenticated
  with check (auth.uid() = autor and not public.estoy_suspendido());

drop policy if exists "enviar mensajes como yo" on public.messages;
create policy "enviar mensajes como yo" on public.messages for insert to authenticated
  with check (
    auth.uid() = from_user
    and not exists (
      select 1 from public.profiles p
       where p.id = messages.to_user and p.eliminado_en is not null
    )
    and not public.hay_bloqueo_con(messages.to_user)
    and not public.estoy_suspendido()
  );
```

> **NOTA para el implementador:** los nombres exactos de las policies de insert y sus columnas de dueño (`user_id`/`autor`) hay que verificarlos leyendo cada tabla en las migraciones (`0001`, `0007`, `0012`, `0030`, `0032`) y en la que las recreó por última vez. Copiar la condición vigente VERBATIM; el `not public.estoy_suspendido()` es lo único que se agrega. Un error aquí rompe publicar/chatear para todos.

- [ ] **Step 2: Verificar sintaxis SQL localmente** (no hay base local; revisión de lectura). Confirmar que cada `drop policy` tiene su `create policy` correspondiente y que la condición coincide con la migración previa.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0036_moderacion_admin.sql
git commit -m "feat(moderacion): migracion 0036 admin + suspension + estado de denuncias"
```

## Task 2: Migración `0036b` — RPCs de moderación

**Files:**
- Create: `supabase/migrations/0036b_moderacion_rpc.sql` (o al final del `0036`; separado por claridad)

**Interfaces:**
- Consumes: `es_admin()` (Task 1), tablas `denuncias`, `pets`, `adoptions`, `pet_tips`, `sightings`, `adoption_questions`, `messages`, `profiles`.
- Produces: RPCs `moderacion_bandeja()`, `moderar_retirar(uuid)`, `moderar_descartar(uuid)`, `moderar_suspender(uuid)`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 0036b_moderacion_rpc.sql
-- Todas las RPC son security definer y abortan si el llamador no es admin.
-- Leen saltandose RLS (por eso definer): un no-admin nunca llega al cuerpo.

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
                                   select s.id, s.nota from public.sightings s where s.id = d.objeto_id) x)
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
```

> **NOTA:** verificar los nombres reales de columnas de contenido antes de aplicar: `pets` (`especie/descripcion/fotos`), `adoptions` (`especie/nombre/descripcion/fotos`), `pet_tips` (`texto`), `sightings` (¿`nota`? confirmar), `adoption_questions` (`pregunta/respuesta`), `messages` (`texto/imagen_url` — `imagen_url` la crea la Función 3; si esta función se aplica antes, quitar `imagen_url` del snapshot o aplicar 0038 primero). Ajustar el `to_jsonb` a las columnas reales.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0036b_moderacion_rpc.sql
git commit -m "feat(moderacion): RPCs security definer bandeja/retirar/descartar/suspender"
```

## Task 3: Exponer `es_admin` por `mi_perfil()`

**Files:**
- Create: `supabase/migrations/0036c_mi_perfil_es_admin.sql`
- Modify: `src/services/profile.ts` (interfaz `Profile` + normalización)

**Interfaces:**
- Consumes: `mi_perfil()` (0018).
- Produces: `Profile.es_admin?: boolean` en el cliente.

- [ ] **Step 1: Migración que recrea `mi_perfil()` con `es_admin`**

```sql
-- 0036c_mi_perfil_es_admin.sql
-- create or replace NO puede cambiar el tipo de retorno: drop primero.
drop function if exists public.mi_perfil();
create function public.mi_perfil()
returns table (
  id uuid, nombre text, foto_perfil text, telefono text, red_social text,
  creado_en timestamptz, es_admin boolean
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select p.id, p.nombre, p.foto_perfil, p.telefono, p.red_social, p.creado_en, p.es_admin
  from public.profiles p
  where p.id = auth.uid()
$$;
revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;
```

- [ ] **Step 2: Añadir `es_admin` a la interfaz `Profile`** (`src/services/profile.ts:3-17`): agregar `es_admin?: boolean;`. En el escalón de respaldo (`:52`) añadir `es_admin: false`.

- [ ] **Step 3: `tsc` limpio**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0036c_mi_perfil_es_admin.sql src/services/profile.ts
git commit -m "feat(moderacion): exponer es_admin por mi_perfil()"
```

## Task 4: Servicio cliente de moderación

**Files:**
- Create: `src/services/moderacion.ts`
- Test: `src/__tests__/services/moderacion.test.ts`

**Interfaces:**
- Produces: `bandeja(): Promise<DenunciaPendiente[]>`, `retirar(id): Promise<void>`, `descartar(id): Promise<void>`, `suspender(usuarioId): Promise<void>`, tipo `DenunciaPendiente`.

- [ ] **Step 1: Test que verifica el mapeo de la RPC**

```ts
// moderacion.test.ts — mockeando supabase.rpc
import { bandeja } from '../../services/moderacion';
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn().mockResolvedValue({ data: [{
    id: 'd1', tipo: 'pista', motivo: 'Spam', detalle: null, creado_en: 'x',
    reporter_id: 'r', reporter_nombre: 'Ana', denunciado_id: 'u', denunciado_nombre: 'Bob',
    objeto_id: 'o', pet_id: null, denuncias_contra_denunciado: 3, contenido: { texto: 'hola' },
  }], error: null }) },
}));
test('bandeja mapea las filas de la RPC', async () => {
  const filas = await bandeja();
  expect(filas[0].denunciasContraDenunciado).toBe(3);
  expect(filas[0].contenido).toEqual({ texto: 'hola' });
});
```

- [ ] **Step 2: Ejecutar el test — debe fallar** (`npx jest moderacion` → módulo no existe).

- [ ] **Step 3: Implementar `src/services/moderacion.ts`**

```ts
import { supabase } from '../lib/supabase';

export interface DenunciaPendiente {
  id: string; tipo: string; motivo: string; detalle: string | null; creadoEn: string;
  reporterId: string | null; reporterNombre: string | null;
  denunciadoId: string | null; denunciadoNombre: string | null;
  objetoId: string | null; petId: string | null;
  denunciasContraDenunciado: number;
  contenido: Record<string, unknown> | null;
}

export async function bandeja(): Promise<DenunciaPendiente[]> {
  const { data, error } = await supabase.rpc('moderacion_bandeja');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, tipo: r.tipo, motivo: r.motivo, detalle: r.detalle, creadoEn: r.creado_en,
    reporterId: r.reporter_id, reporterNombre: r.reporter_nombre,
    denunciadoId: r.denunciado_id, denunciadoNombre: r.denunciado_nombre,
    objetoId: r.objeto_id, petId: r.pet_id,
    denunciasContraDenunciado: Number(r.denuncias_contra_denunciado ?? 0),
    contenido: r.contenido ?? null,
  }));
}
export async function retirar(id: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_retirar', { p_denuncia_id: id });
  if (error) throw error;
}
export async function descartar(id: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_descartar', { p_denuncia_id: id });
  if (error) throw error;
}
export async function suspender(usuarioId: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_suspender', { p_usuario_id: usuarioId });
  if (error) throw error;
}
```

- [ ] **Step 4: Test verde**

Run: `npx jest moderacion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/moderacion.ts src/__tests__/services/moderacion.test.ts
git commit -m "feat(moderacion): servicio cliente bandeja/retirar/descartar/suspender"
```

## Task 5: Pantalla de moderación + entrada condicional

**Files:**
- Create: `src/screens/ModeracionScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx` (registrar `Moderacion` en `ProfileStack`, ~líneas 120-159)
- Modify: `src/screens/ProfileScreen.tsx` (fila condicional ~líneas 539-570)

**Interfaces:**
- Consumes: `bandeja/retirar/descartar/suspender` (Task 4), `Profile.es_admin` (Task 3).

- [ ] **Step 1: Crear `ModeracionScreen`** — `FlatList` de `bandeja()`. Cada tarjeta: `tipo` + `motivo`, `detalle` si hay, "Denuncia de {reporterNombre}", "Contra {denunciadoNombre} · {denunciasContraDenunciado} denuncias", preview de `contenido` (si trae `texto`, mostrarlo; si trae `fotos`, un thumbnail de `fotos[0]`; si `imagen_url`, ese). Tres botones: **Retirar** (llama `retirar(id)`), **Descartar** (`descartar(id)`), **Suspender** (`suspender(denunciadoId)`, con `confirmAction`). Tras cada acción, recargar la bandeja. Estado vacío amable ("No hay denuncias pendientes 🙌"). Usar el patrón de estilos con `useColors()`/`crearEstilos(colors)`. Reusar `AppText`, `Button`/`TouchableOpacity` y `confirmAction` de `src/lib/confirm.ts` (o el equivalente usado en el repo — verificar el nombre real, p.ej. `confirmAction`).

- [ ] **Step 2: Registrar la pantalla** en `ProfileStack` de `TabNavigator.tsx`:

```tsx
<ProfileStackNav.Screen name="Moderacion" component={ModeracionScreen}
  options={{ headerShown: true, title: 'Moderación' }} />
```

- [ ] **Step 3: Entrada condicional en `ProfileScreen`** — junto a las filas `NotificationPrefs`/`Ayuda` (~:564-570), añadir una fila visible solo si el perfil cargado tiene `es_admin`:

```tsx
{profile?.es_admin && (
  <MenuFila icono="shield-checkmark-outline" label="Moderación"
    onPress={() => navigation.navigate('Moderacion')} />
)}
```

> Usar el MISMO componente/patrón de fila que ya usan las otras entradas del menú (verificar cómo se llama: `MenuFila`/`FilaLink`/inline `TouchableOpacity`). No inventar uno nuevo.

- [ ] **Step 4: `tsc` + tests verdes**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores, tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ModeracionScreen.tsx src/navigation/TabNavigator.tsx src/screens/ProfileScreen.tsx
git commit -m "feat(moderacion): pantalla de bandeja + entrada solo-admin en Perfil"
```

---

# FUNCIÓN 2 — Push web real (VAPID)

## Task 6: Spike de Web Push en Deno (verificar el riesgo PRIMERO)

**Files:**
- Create: `supabase/functions/_shared/webpush.ts`
- Create: `supabase/functions/_shared/webpush.spike.md` (notas del resultado)

**Interfaces:**
- Produces: `enviarWebPush(sub, payload, vapid): Promise<{ ok: boolean; gone: boolean }>` donde `sub = { endpoint, p256dh, auth }`, `payload = { title, body, ruta }`, `vapid = { publicKey, privateKey, subject }`.

- [ ] **Step 1: Elegir librería y escribir el módulo**. Usar una lib web-push compatible con Deno via esm.sh (p.ej. `import webpush from 'https://esm.sh/web-push@3'` o equivalente que funcione en el runtime de Supabase Edge). El módulo cifra el payload (aes128gcm) y firma el JWT VAPID.

```ts
// _shared/webpush.ts  (bosquejo; ajustar a la API real de la lib elegida)
import webpush from 'https://esm.sh/web-push@3.6.7';

export interface WebPushSub { endpoint: string; p256dh: string; auth: string; }
export interface WebPushPayload { title: string; body: string; ruta: string; }
export interface VapidKeys { publicKey: string; privateKey: string; subject: string; }

export async function enviarWebPush(sub: WebPushSub, payload: WebPushPayload, vapid: VapidKeys): Promise<{ ok: boolean; gone: boolean }> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return { ok: true, gone: false };
  } catch (e: any) {
    const code = e?.statusCode ?? e?.status;
    return { ok: false, gone: code === 404 || code === 410 };
  }
}
```

- [ ] **Step 2: Probar el runtime real**. Correr `npx supabase functions serve` o `wrangler`/`deno` con una función de prueba que llame `enviarWebPush` contra un endpoint real (generar una suscripción de prueba desde un navegador) o un mock que valide el formato. **Verificar que la lib carga y corre en Deno.** Si NO corre, plan B: JWT con `jose` + cifrado manual aes128gcm — anotar en `webpush.spike.md` y ajustar el módulo antes de seguir.

- [ ] **Step 3: Anotar el resultado** en `webpush.spike.md` (lib que funcionó, versión, gotchas).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/webpush.ts supabase/functions/_shared/webpush.spike.md
git commit -m "feat(push): modulo Deno de Web Push VAPID + spike de runtime"
```

## Task 7: Migración `0037` — tabla de suscripciones web + limpieza en borrado

**Files:**
- Create: `supabase/migrations/0037_web_push.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 0037_web_push.sql
create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);
alter table public.web_push_subscriptions enable row level security;
create index if not exists web_push_subscriptions_user_id_idx
  on public.web_push_subscriptions (user_id);

create policy "gestionar mis suscripciones web" on public.web_push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- El dispatcher (service_role) lee las suscripciones del destinatario; service_role
-- ignora RLS, no necesita policy propia.

-- Limpieza en borrado de cuenta: recrear anonimizar_mi_cuenta() sumando el delete.
-- (Copiar el cuerpo vigente de 0017 y agregar la linea; NO cambiar la firma.)
-- delete from public.web_push_subscriptions where user_id = auth.uid();
```

> **NOTA:** el `delete` de suscripciones en el borrado de cuenta requiere recrear `anonimizar_mi_cuenta()` con su cuerpo actual (leer `0017`) + la línea nueva. Como `anonimizar_mi_cuenta()` no cambia de firma, `create or replace` sirve. Si el cuerpo es largo, hacerlo en un bloque aparte de esta misma migración copiando el original verbatim.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0037_web_push.sql
git commit -m "feat(push): migracion 0037 web_push_subscriptions + limpieza en borrado"
```

## Task 8: Helper `urlBase64ToUint8Array` + cliente `webPush.ts`

**Files:**
- Create: `src/lib/webPush.ts`
- Test: `src/__tests__/lib/webPush.test.ts`

**Interfaces:**
- Produces: `urlBase64ToUint8Array(base64: string): Uint8Array`, `activarWebPush(userId): Promise<EstadoWebPush>`, `desactivarWebPush(): Promise<void>`, `estadoWebPush(): Promise<EstadoWebPush>`, tipo `EstadoWebPush = 'activada'|'denegada'|'no_soportado'|'inactiva'`.

- [ ] **Step 1: Test del helper puro**

```ts
import { urlBase64ToUint8Array } from '../../lib/webPush';
test('convierte base64url a Uint8Array de la longitud correcta', () => {
  const out = urlBase64ToUint8Array('BFooBar_-'); // muestra corta
  expect(out).toBeInstanceOf(Uint8Array);
  expect(out.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Test falla** (`npx jest webPush`).

- [ ] **Step 3: Implementar `src/lib/webPush.ts`**

```ts
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { env } from './env'; // usar el acceso a EXPO_PUBLIC_VAPID_PUBLIC_KEY como en env.ts

export type EstadoWebPush = 'activada' | 'denegada' | 'no_soportado' | 'inactiva';

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function soportado(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window;
}

export async function estadoWebPush(): Promise<EstadoWebPush> {
  if (!soportado()) return 'no_soportado';
  if (Notification.permission === 'denied') return 'denegada';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'activada' : 'inactiva';
}

export async function activarWebPush(userId: string): Promise<EstadoWebPush> {
  if (!soportado()) return 'no_soportado';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denegada';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey),
  });
  const json = sub.toJSON();
  await supabase.from('web_push_subscriptions').upsert({
    user_id: userId, endpoint: sub.endpoint,
    p256dh: json.keys!.p256dh, auth: json.keys!.auth,
  }, { onConflict: 'endpoint' });
  return 'activada';
}

export async function desactivarWebPush(): Promise<void> {
  if (!soportado()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
```

> **NOTA:** añadir `vapidPublicKey` al objeto `env` en `src/lib/env.ts` leyendo `process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY` **escrito literal** (Metro solo inlinea las referencias literales — bug ya visto en prod). Si falta, `activarWebPush` debe degradar (no romper): tratar vacío como `no_soportado`.

- [ ] **Step 4: Test verde** (`npx jest webPush`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/webPush.ts src/lib/env.ts src/__tests__/lib/webPush.test.ts
git commit -m "feat(push): cliente web push (suscripcion + helper base64url)"
```

## Task 9: Handlers `push`/`notificationclick` en el service worker

**Files:**
- Modify: `public/sw.js` (subir VERSION a `'v3'`, añadir handlers)

- [ ] **Step 1: Añadir al `public/sw.js`**

```js
// (subir la constante VERSION de 'v2' a 'v3' para forzar update del SW)

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = {}; }
  const title = payload.title || 'Encuentra tu Mascota';
  const body = payload.body || '';
  const ruta = payload.ruta || '/';
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { ruta },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ruta = (event.notification.data && event.notification.data.ruta) || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { c.navigate(ruta); return c.focus(); } }
    if (clients.openWindow) return clients.openWindow(ruta);
  })());
});
```

> Verificar los nombres reales de los íconos en `public/icons/` para el `icon`/`badge`.

- [ ] **Step 2: Verificar con wrangler** que el SW registra sin errores de sintaxis (`wrangler pages dev dist` tras un export, o revisión de lectura si no hay tiempo de build).

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(push): handlers push + notificationclick en el service worker (v3)"
```

## Task 10: Botón de activación en Avisos

**Files:**
- Modify: `src/screens/NotificationPrefsScreen.tsx`

**Interfaces:**
- Consumes: `activarWebPush/desactivarWebPush/estadoWebPush` (Task 8), `useAuth` para el `userId`.

- [ ] **Step 1: Añadir un bloque solo-web** al principio de la pantalla: título "Notificaciones en este dispositivo", texto explicativo, y un botón cuyo label depende de `estadoWebPush()`:
  - `no_soportado` → no renderizar el bloque.
  - `inactiva` → botón "Activar notificaciones en este dispositivo" → `activarWebPush(user.id)`.
  - `activada` → botón "Desactivar en este dispositivo" → `desactivarWebPush()`.
  - `denegada` → texto "Están bloqueadas en el navegador. Actívalas desde el candado de la barra de direcciones." (sin botón).
  Cargar el estado en un `useEffect` y refrescar tras cada acción. Estilos con `useColors()`.

- [ ] **Step 2: `tsc` + tests verdes** (`npx tsc --noEmit && npm test`).

- [ ] **Step 3: Commit**

```bash
git add src/screens/NotificationPrefsScreen.tsx
git commit -m "feat(push): boton activar notificaciones web en Avisos"
```

## Task 11: Enviar Web Push desde las Edge Functions

**Files:**
- Modify: `supabase/functions/send-notifications/index.ts` (función `enviarPush` ~línea 131)
- Modify: `supabase/functions/send-push/index.ts` (~línea 121-133)

**Interfaces:**
- Consumes: `enviarWebPush` (Task 6), tabla `web_push_subscriptions` (Task 7).

- [ ] **Step 1: En `send-notifications`**, tras/junto al envío Expo, consultar las suscripciones web del `userId` y enviar a cada una:

```ts
import { enviarWebPush } from '../_shared/webpush.ts';
// ... dentro de enviarPush(userId, { title, body, ruta }):
const vapid = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
  subject: Deno.env.get('VAPID_SUBJECT')!,
};
const { data: webSubs } = await supabase.from('web_push_subscriptions').select('*').eq('user_id', userId);
for (const s of webSubs ?? []) {
  const r = await enviarWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, { title, body, ruta }, vapid);
  if (r.gone) await supabase.from('web_push_subscriptions').delete().eq('endpoint', s.endpoint);
}
```

- [ ] **Step 2: Mismo bloque en `send-push`** (chat) para el destinatario.

- [ ] **Step 3: Verificar que no rompe el flujo Expo existente** (los envíos son best-effort; un fallo web no debe tumbar el evento). Revisión de lectura + `deno check` si está disponible.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-notifications/index.ts supabase/functions/send-push/index.ts
git commit -m "feat(push): despachar Web Push VAPID junto al push Expo"
```

---

# FUNCIÓN 3 — Fotos en el chat

## Task 12: Migración `0038` — `messages.imagen_url` + limpieza

**Files:**
- Create: `supabase/migrations/0038_chat_fotos.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 0038_chat_fotos.sql
alter table public.messages add column if not exists imagen_url text;

-- Relajar el texto: ahora un mensaje puede ser solo-foto. Al menos uno de los dos.
alter table public.messages drop constraint if exists messages_texto_largo;
alter table public.messages alter column texto drop not null;
alter table public.messages add constraint messages_texto_o_imagen check (
  (texto is null or length(btrim(texto)) between 1 and 2000)
  and (texto is not null or imagen_url is not null)
);

-- Las fotos de chat viven en el bucket pet-photos bajo <uid>/. El borrado de
-- cuenta debe barrerlas: extender mis_fotos_a_borrar() (0017) para incluirlas.
-- (Recrear con create or replace copiando el cuerpo vigente + el nuevo select.)
--   union all
--   select public.ruta_storage(imagen_url) from public.messages
--    where from_user = auth.uid() and imagen_url is not null
```

> **NOTA:** `mis_fotos_a_borrar()` (0017) devuelve rutas; hay que recrearla (misma firma → `create or replace`) uniendo el `select` de `messages.imagen_url` con `ruta_storage()`. Leer el cuerpo actual en `0017` y copiarlo verbatim + el `union all`.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0038_chat_fotos.sql
git commit -m "feat(chat): migracion 0038 imagen_url en messages + limpieza en borrado"
```

## Task 13: `sendMessage` con imagen

**Files:**
- Modify: `src/services/messages.ts` (interfaz `Message` :4-19, `sendMessage` :132-145)
- Test: `src/__tests__/services/messages.imagen.test.ts`

**Interfaces:**
- Produces: `sendMessage(ctx, fromUser, toUser, texto, imagenUrl?)`; `Message.imagen_url: string | null`.

- [ ] **Step 1: Test** que `sendMessage` con imagen y sin texto inserta `imagen_url` y `texto: null`, y que sin texto ni imagen tira error.

```ts
// mock del insert de supabase, capturar el payload
test('sendMessage acepta solo-foto', async () => {
  await sendMessage({ tipo: 'pet', id: 'p1' }, 'a', 'b', '', 'https://x/y.jpg');
  expect(capturado).toMatchObject({ pet_id: 'p1', texto: null, imagen_url: 'https://x/y.jpg' });
});
test('sendMessage sin texto ni imagen tira', async () => {
  await expect(sendMessage({ tipo: 'pet', id: 'p1' }, 'a', 'b', '')).rejects.toThrow();
});
```

- [ ] **Step 2: Test falla** (`npx jest messages.imagen`).

- [ ] **Step 3: Implementar** — añadir `imagen_url: string | null` a `Message`; cambiar la firma y el cuerpo:

```ts
export async function sendMessage(ctx: HiloCtx, fromUser: string, toUser: string, texto: string, imagenUrl?: string) {
  const clean = texto.trim();
  if (!clean && !imagenUrl) throw new Error('Mensaje vacío');
  const { error } = await supabase.from('messages').insert({
    pet_id: ctx.tipo === 'pet' ? ctx.id : null,
    adoption_id: ctx.tipo === 'adopcion' ? ctx.id : null,
    from_user: fromUser, to_user: toUser,
    texto: clean || null,
    imagen_url: imagenUrl ?? null,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Test verde** (`npx jest messages`).

- [ ] **Step 5: Commit**

```bash
git add src/services/messages.ts src/__tests__/services/messages.imagen.test.ts
git commit -m "feat(chat): sendMessage con imagen opcional (solo-foto o foto+texto)"
```

## Task 14: Adjuntar y mostrar foto en ChatScreen

**Files:**
- Modify: `src/screens/ChatScreen.tsx` (input+envío :357-376, `onSend` :139-170, render burbuja :328-344)

**Interfaces:**
- Consumes: `sendMessage(...,imagenUrl?)` (Task 13), `uploadPetPhoto` (`storage.ts`), `pickFromLibrary/takePhoto` (`pickImage.ts`).

- [ ] **Step 1: Estado y botón adjuntar** — añadir estado `imagenAdjunta: string | null` (uri local) y `subiendo: boolean`. Botón de clip/cámara junto al input → menú "Galería"/"Cámara" → `pickFromLibrary(1)`/`takePhoto()` → set `imagenAdjunta`. Mostrar un preview pequeño con ✕ para quitarla. `puedeEnviar = texto.trim().length > 0 || imagenAdjunta != null`.

- [ ] **Step 2: `onSend`** — si hay `imagenAdjunta`, `setSubiendo(true)`, `const url = await uploadPetPhoto(imagenAdjunta, me)`, luego `sendMessage(ctx, me, otherUserId, texto, url)`; limpiar adjunto y texto. El push best-effort: si no hay texto, `body: '📷 Foto'`.

- [ ] **Step 3: Render de burbuja** — si `item.imagen_url`, mostrar `<Image source={{ uri: item.imagen_url }} style={styles.bubbleImage} />` (tocar → abrir grande; usar el visor existente o un `Modal` simple con la imagen). Si además hay `item.texto`, mostrarlo debajo. Mantener `mine` para alineación.

- [ ] **Step 4: `tsc` + tests verdes** (`npx tsc --noEmit && npm test`).

- [ ] **Step 5: Commit**

```bash
git add src/screens/ChatScreen.tsx
git commit -m "feat(chat): adjuntar y mostrar una foto en la conversacion"
```

---

# FUNCIÓN 4 — Impacto de la comunidad

## Task 15: Migración `0039` — RPC `impacto_comunidad()`

**Files:**
- Create: `supabase/migrations/0039_impacto_comunidad.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 0039_impacto_comunidad.sql
-- Conteos agregados globales. Sin datos personales; visible para invitados.
create or replace function public.impacto_comunidad()
returns table (reencuentros bigint, buscando bigint, adopciones bigint, aportes bigint)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    (select count(*) from public.pets where reunida_en is not null and oculto = false),
    (select count(*) from public.pets where activo = true and oculto = false),
    (select count(*) from public.adoptions where adoptada_en is not null),
    (select (select count(*) from public.sightings) + (select count(*) from public.pet_tips));
$$;
revoke all on function public.impacto_comunidad() from public;
grant execute on function public.impacto_comunidad() to anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0039_impacto_comunidad.sql
git commit -m "feat(impacto): RPC impacto_comunidad publica"
```

## Task 16: Servicio + tarjeta en Inicio

**Files:**
- Create: `src/services/impacto.ts`
- Test: `src/__tests__/services/impacto.test.ts`
- Modify: `src/screens/HomeScreen.tsx` (Promise.all de carga + nueva Card)

**Interfaces:**
- Produces: `getImpacto(): Promise<Impacto | null>`, tipo `Impacto = { reencuentros; buscando; adopciones; aportes }`.

- [ ] **Step 1: Test del servicio** — mock de `supabase.rpc('impacto_comunidad')` devolviendo una fila; `getImpacto()` normaliza bigint→Number; en error devuelve `null`.

```ts
test('getImpacto normaliza numeros', async () => {
  const i = await getImpacto();
  expect(i).toEqual({ reencuentros: 12, buscando: 5, adopciones: 3, aportes: 40 });
});
```

- [ ] **Step 2: Test falla** (`npx jest impacto`).

- [ ] **Step 3: Implementar `src/services/impacto.ts`**

```ts
import { supabase } from '../lib/supabase';
export interface Impacto { reencuentros: number; buscando: number; adopciones: number; aportes: number; }
export async function getImpacto(): Promise<Impacto | null> {
  const { data, error } = await supabase.rpc('impacto_comunidad');
  if (error) return null;
  const r = (data ?? [])[0];
  if (!r) return null;
  return {
    reencuentros: Number(r.reencuentros ?? 0), buscando: Number(r.buscando ?? 0),
    adopciones: Number(r.adopciones ?? 0), aportes: Number(r.aportes ?? 0),
  };
}
```

- [ ] **Step 4: Test verde** (`npx jest impacto`).

- [ ] **Step 5: Tarjeta en HomeScreen** — añadir `impacto` al estado, cargarlo en el `Promise.all` de `cargar()` con `.catch(() => null)` (degrada silenciosa). Renderizar una `Card` "Lo que logramos juntos" con los 4 números y una etiqueta cálida cada uno ("reencuentros", "mascotas buscando", "encontraron familia", "aportes de vecinos"). Visible siempre (invitado y autenticado). Estilos con `useColors()`. Solo mostrar la Card si `impacto` no es null y algún número > 0.

- [ ] **Step 6: `tsc` + tests verdes** (`npx tsc --noEmit && npm test`).

- [ ] **Step 7: Commit**

```bash
git add src/services/impacto.ts src/__tests__/services/impacto.test.ts src/screens/HomeScreen.tsx
git commit -m "feat(impacto): tarjeta publica de impacto de la comunidad en Inicio"
```

---

# Cierre — revisión y verificación

## Task 17: Revisión final de rama (adversarial)

- [ ] **Navegación:** confirmar que la entrada a `Moderacion` navega bien (está en `ProfileStack`, navegación relativa dentro del tab Perfil — OK, no es el bug de "stack raíz con nombre pelado"). Verificar que ninguna pantalla nueva registrada en el stack raíz navegue a tabs por nombre pelado.
- [ ] **Suspensión:** releer las 6 policies de insert recreadas en `0036` y confirmar que la condición previa quedó VERBATIM (comparar contra la migración que las creó por última vez). Un `and not estoy_suspendido()` de más o de menos rompe algo.
- [ ] **Privacidad de la bandeja:** `moderacion_bandeja` NO debe filtrar teléfono ni datos de más; el snapshot `contenido` es solo lo necesario para decidir.
- [ ] **notifyTargets espejo:** esta tanda NO cambia las reglas de targeting (reusa `canal_push`), así que el test-espejo debe seguir verde sin tocar los dos archivos. Confirmarlo.
- [ ] **Borrado de cuenta:** `anonimizar_mi_cuenta()` recreada limpia `web_push_subscriptions`, y `mis_fotos_a_borrar()` recreada incluye las fotos de chat. Verificar que ambas conservan su firma.

## Task 18: Verificación E2E (Playwright headless a localhost:8091)

- [ ] Levantar `expo start --web` en background, esperar compilación (~45s), correr scripts directo contra `localhost:8091` (saltar onboarding; botones RN-web por glyph/ancho — trucos en ESTADO.md).
- [ ] **Moderación:** con una cuenta marcada admin por SQL de prueba (o mockeando `es_admin` en la carga del perfil), ver la fila "Moderación", abrir la bandeja, y ejercitar Retirar/Descartar sobre una denuncia de prueba. Confirmar que un no-admin NO ve la fila.
- [ ] **Fotos en chat:** en un hilo de prueba, adjuntar un JPEG y enviarlo; ver la burbuja con la imagen; mandar foto+texto.
- [ ] **Impacto:** la tarjeta de Inicio muestra números (crear datos de prueba si la base está vacía).
- [ ] **Push web:** el botón de Avisos aparece en web y llega hasta `Notification.requestPermission` (el permiso real se omite/mockea en headless). Verificar el flujo, no el permiso del SO.
- [ ] Limpiar todos los datos de prueba al terminar; dejar la base limpia.

## Task 19: Regenerar `dist` y anotar el checklist de despliegue

- [ ] `npx tsc --noEmit` limpio, `npm test` verde (contar suites/tests).
- [ ] `npx expo export --platform web`; borrar `dist/borrar-cuenta` hasta que haya correo de contacto.
- [ ] Escribir en `ESTADO.md` el bloque de la tanda + el **orden de despliegue**: (1) generar VAPID + `supabase secrets set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT`; (2) redeploy `send-notifications` + `send-push`; (3) aplicar `0036`→`0036b`→`0036c`→`0037`→`0038`→`0039` (con el PAT, `User-Agent` de navegador); (4) subir `dist`; (5) `update profiles set es_admin=true` en la cuenta de Pablo; añadir `EXPO_PUBLIC_VAPID_PUBLIC_KEY` al `.env`/entorno de build.
- [ ] Commit del `dist` regenerado + ESTADO.md.

---

## Self-review (cobertura del spec)

- **Función 1 (moderación):** Tasks 1–5 → migración admin/suspensión/estado (1), RPCs (2), es_admin en mi_perfil (3), servicio (4), pantalla+entrada (5). ✅
- **Función 2 (push web):** Tasks 6–11 → spike Deno (6), tabla (7), cliente+helper (8), SW handlers (9), botón Avisos (10), envío desde Edge (11). ✅ Riesgo VAPID atacado primero (Task 6).
- **Función 3 (fotos chat):** Tasks 12–14 → migración (12), sendMessage (13), ChatScreen (14). ✅ Limpieza de borrado cubierta (12).
- **Función 4 (impacto):** Tasks 15–16 → RPC (15), servicio+tarjeta (16). ✅ Público, en Inicio.
- **Transversal:** revisión final (17), E2E (18), dist+despliegue (19). ✅
- **Pendientes de Pablo** (VAPID keygen, `es_admin=true`) anotados en Task 19 y en el spec.

# Tanda 3 — Avisos externos, Pistas del barrio y Modo invitado — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir el circuito de la app: que los avisos salgan del teléfono (correo + push), que el barrio pueda dejar pistas en un reporte, y que se pueda explorar la app sin cuenta.

**Architecture:** Tres funciones independientes, una por agente, cada una en su worktree. Los avisos se encolan con triggers de Postgres (nunca el cliente) y los despacha una Edge Function que comparte la lógica de targeting con la app. Las pistas son una tabla nueva con lectura pública y borrado por autor o dueño. El modo invitado quita la bifurcación de sesión del navegador raíz y mete un portero (`requireAuth`) en cada acción protegida.

**Tech Stack:** Expo (React Native + TypeScript) sobre react-native-web · Supabase (Postgres + RLS + Edge Functions) · Jest · Playwright para la verificación visual.

Spec: `docs/superpowers/specs/2026-07-18-avisos-pistas-invitado-design.md`

## Global Constraints

- **Idioma:** todo el texto visible al usuario en español de Chile, cálido y en el tono de la app ("Creá tu cuenta para…"). Nada de jerga de sistema.
- **Diseño:** usar exclusivamente los tokens de `src/theme` y los componentes de `src/ui`. Prohibido color, espaciado o tipografía a mano. Íconos: Ionicons de línea, nunca emojis a color en la interfaz.
- **Degradación:** si falta una tabla o una migración, la función degrada a vacío y **no** tumba la pantalla. Es el patrón ya usado en favoritos y novedades.
- **Tests:** cada archivo de `src/lib/` nuevo va con su test en `__tests__/lib/`. `npm test` y `npx tsc --noEmit` deben quedar en verde antes de cada commit.
- **Migraciones:** archivos nuevos en `supabase/migrations/`, numerados, nunca editar una migración ya aplicada.
- **Commits:** frecuentes, en español, con prefijo `feat:` / `test:` / `fix:`. Sin `Co-Authored-By`.
- **Sin dependencias nuevas** salvo que la tarea lo diga explícitamente. Ninguna tarea de esta tanda las necesita.

---

# FUNCIÓN A — Avisos que salen de la app

Rama: `feat/avisos`

### Task A1: Migración `0011_avisos.sql`

**Files:**
- Create: `supabase/migrations/0011_avisos.sql`

**Interfaces:**
- Produces: tablas `notification_prefs` y `notification_events`; triggers en `pets`, `sightings` y `pet_tips`.

**Nota sobre `pet_tips`:** esa tabla la crea la Función B (migración `0012`). El trigger sobre ella va en un
bloque condicional (`if to_regclass('public.pet_tips') is not null then …`) para que `0011` se pueda aplicar
antes o después de `0012` sin fallar. La migración `0012` vuelve a intentar crear ese trigger por su cuenta.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- AVISOS: preferencias por usuario + cola de eventos escrita SOLO por triggers.

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  zona boolean not null default true,
  avistamientos boolean not null default true,
  pistas boolean not null default true,
  coincidencias boolean not null default true,
  canal_email boolean not null default true,
  canal_push boolean not null default true,
  actualizado_en timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;

create policy "gestionar mis preferencias de aviso"
  on public.notification_prefs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cola cruda. SIN políticas: invisible para anon y authenticated.
-- Solo la Edge Function la toca, con la service role key (que salta RLS).
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('reporte_nuevo', 'avistamiento', 'pista')),
  pet_id uuid not null references public.pets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  datos jsonb not null default '{}',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  intentos int not null default 0,
  creado_en timestamptz not null default now(),
  procesado_en timestamptz
);
alter table public.notification_events enable row level security;

create index notification_events_pendientes_idx
  on public.notification_events (estado, creado_en);

-- Encoladores. Solo insertan: nada de lógica de targeting acá.
create or replace function public.enqueue_reporte_nuevo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_events (tipo, pet_id, actor_id, datos)
  values ('reporte_nuevo', new.id, new.user_id,
          jsonb_build_object('lat', new.lat, 'lng', new.lng,
                             'especie', new.especie, 'estado_pet', new.estado));
  return new;
end; $$;

create trigger pets_notificar after insert on public.pets
  for each row execute function public.enqueue_reporte_nuevo();

create or replace function public.enqueue_avistamiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_events (tipo, pet_id, actor_id, datos)
  values ('avistamiento', new.pet_id, new.user_id,
          jsonb_build_object('lat', new.lat, 'lng', new.lng));
  return new;
end; $$;

create trigger sightings_notificar after insert on public.sightings
  for each row execute function public.enqueue_avistamiento();

create or replace function public.enqueue_pista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_events (tipo, pet_id, actor_id, datos)
  values ('pista', new.pet_id, new.user_id,
          jsonb_build_object('extracto', left(new.texto, 120)));
  return new;
end; $$;

-- pet_tips puede no existir todavía (la crea 0012). Si existe, enganchamos ya.
do $$
begin
  if to_regclass('public.pet_tips') is not null then
    execute 'drop trigger if exists pet_tips_notificar on public.pet_tips';
    execute 'create trigger pet_tips_notificar after insert on public.pet_tips
             for each row execute function public.enqueue_pista()';
  end if;
end $$;
```

- [ ] **Step 2: Verificar la forma del esquema contra el que ya existe**

Confirmá que los nombres de columna usados coinciden con la base real: `sightings` debe tener `pet_id`,
`user_id`, `lat`, `lng` (mirá `supabase/migrations/0007_avistamientos.sql`), y `pets` debe tener `user_id`,
`lat`, `lng`, `especie`, `estado` (mirá `0001_init.sql`). Si algún nombre no calza, corregí la migración —
no inventes columnas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_avisos.sql
git commit -m "feat(avisos): migracion 0011 - preferencias y cola de eventos"
```

---

### Task A2: Lógica de targeting `src/lib/notifyTargets.ts`

**Files:**
- Create: `src/lib/notifyTargets.ts`
- Test: `__tests__/lib/notifyTargets.test.ts`

**Interfaces:**
- Consumes: `distanciaKm` de `src/lib/geo.ts` (verificá el nombre real exportado antes de importarlo).
- Produces:

```ts
export type TipoEvento = 'reporte_nuevo' | 'avistamiento' | 'pista';

export type EventoAviso = {
  id: string;
  tipo: TipoEvento;
  petId: string;
  actorId: string | null;
  datos: { lat?: number; lng?: number; especie?: string; extracto?: string; estado_pet?: string };
};

export type Prefs = {
  userId: string;
  zona: boolean; avistamientos: boolean; pistas: boolean; coincidencias: boolean;
  canalEmail: boolean; canalPush: boolean;
};

export type ZonaAlerta = { userId: string; lat: number; lng: number; radioKm: number };

export type Contexto = {
  duenoPetId: string;            // user_id del dueño del reporte del evento
  nombrePet: string | null;      // para el texto ("Alguien vio a Pelusa")
  zonas: ZonaAlerta[];           // todas las zonas activas (solo se usan en 'reporte_nuevo')
  prefs: Record<string, Prefs>;  // por userId; si falta, se asumen los valores por defecto
};

export type Destinatario = { userId: string; canales: ('email' | 'push')[] };

export const PREFS_POR_DEFECTO: Omit<Prefs, 'userId'>;
export function resolverDestinatarios(evento: EventoAviso, ctx: Contexto): Destinatario[];
export function componerAviso(evento: EventoAviso, ctx: Contexto): { titulo: string; cuerpo: string; ruta: string };
```

`ruta` es la ruta relativa del reporte (`/mascota/<petId>`); quien envía le antepone `EXPO_PUBLIC_WEB_URL`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { resolverDestinatarios, componerAviso, EventoAviso, Contexto } from '../../src/lib/notifyTargets';

const ctxBase: Contexto = { duenoPetId: 'dueno', nombrePet: 'Pelusa', zonas: [], prefs: {} };

describe('resolverDestinatarios', () => {
  it('avisa al dueño de un avistamiento', () => {
    const ev: EventoAviso = { id: 'e1', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    expect(resolverDestinatarios(ev, ctxBase)).toEqual([
      { userId: 'dueno', canales: ['email', 'push'] },
    ]);
  });

  it('nunca le avisa al actor de su propio evento', () => {
    const ev: EventoAviso = { id: 'e2', tipo: 'pista', petId: 'p1', actorId: 'dueno', datos: {} };
    expect(resolverDestinatarios(ev, ctxBase)).toEqual([]);
  });

  it('avisa a las zonas que cubren el reporte nuevo y no a las lejanas', () => {
    const ev: EventoAviso = {
      id: 'e3', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66 },
    };
    const ctx: Contexto = {
      ...ctxBase,
      zonas: [
        { userId: 'cerca', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'lejos', lat: -34.9, lng: -71.9, radioKm: 5 },
      ],
    };
    expect(resolverDestinatarios(ev, ctx).map((d) => d.userId)).toEqual(['cerca']);
  });

  it('deduplica cuando una persona tiene dos zonas que solapan', () => {
    const ev: EventoAviso = {
      id: 'e4', tipo: 'reporte_nuevo', petId: 'p1', actorId: 'autor',
      datos: { lat: -33.45, lng: -70.66 },
    };
    const ctx: Contexto = {
      ...ctxBase,
      zonas: [
        { userId: 'ana', lat: -33.451, lng: -70.661, radioKm: 5 },
        { userId: 'ana', lat: -33.452, lng: -70.662, radioKm: 10 },
      ],
    };
    expect(resolverDestinatarios(ev, ctx)).toHaveLength(1);
  });

  it('respeta el interruptor apagado del tipo', () => {
    const ev: EventoAviso = { id: 'e5', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: false, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: true },
      },
    };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });

  it('devuelve solo los canales encendidos', () => {
    const ev: EventoAviso = { id: 'e6', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: true, canalPush: false },
      },
    };
    expect(resolverDestinatarios(ev, ctx)[0].canales).toEqual(['email']);
  });

  it('no devuelve destinatarios si el usuario apagó los dos canales', () => {
    const ev: EventoAviso = { id: 'e7', tipo: 'avistamiento', petId: 'p1', actorId: 'vecino', datos: {} };
    const ctx: Contexto = {
      ...ctxBase,
      prefs: {
        dueno: { userId: 'dueno', zona: true, avistamientos: true, pistas: true,
                 coincidencias: true, canalEmail: false, canalPush: false },
      },
    };
    expect(resolverDestinatarios(ev, ctx)).toEqual([]);
  });
});

describe('componerAviso', () => {
  it('usa el nombre de la mascota cuando lo hay', () => {
    const ev: EventoAviso = { id: 'e8', tipo: 'avistamiento', petId: 'p1', actorId: 'v', datos: {} };
    const aviso = componerAviso(ev, ctxBase);
    expect(aviso.titulo).toContain('Pelusa');
    expect(aviso.ruta).toBe('/mascota/p1');
  });

  it('funciona sin nombre de mascota', () => {
    const ev: EventoAviso = { id: 'e9', tipo: 'avistamiento', petId: 'p1', actorId: 'v', datos: {} };
    const aviso = componerAviso(ev, { ...ctxBase, nombrePet: null });
    expect(aviso.titulo.length).toBeGreaterThan(0);
    expect(aviso.titulo).not.toContain('null');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest __tests__/lib/notifyTargets.test.ts`
Expected: FAIL — "Cannot find module '../../src/lib/notifyTargets'".

- [ ] **Step 3: Implementar `src/lib/notifyTargets.ts`**

Funciones puras, sin red ni imports de Supabase (la Edge Function las va a importar). Reglas exactas:
`reporte_nuevo` cruza `ctx.zonas` con `distanciaKm(zona, evento.datos)` ≤ `radioKm` y pref `zona`;
`avistamiento` y `pista` van solo a `ctx.duenoPetId` con la pref del tipo correspondiente; siempre se filtra
`actorId` y se deduplica por `userId`; un usuario sin entrada en `ctx.prefs` usa `PREFS_POR_DEFECTO`
(todo `true`). Si un evento `reporte_nuevo` viene sin `lat`/`lng`, devolvé `[]` en vez de reventar.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/lib/notifyTargets.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifyTargets.ts __tests__/lib/notifyTargets.test.ts
git commit -m "feat(avisos): logica de targeting con tests"
```

---

### Task A3: Servicio de preferencias `src/services/notificationPrefs.ts`

**Files:**
- Create: `src/services/notificationPrefs.ts`

**Interfaces:**
- Produces:

```ts
export async function getMisPrefs(): Promise<Prefs>;        // devuelve PREFS_POR_DEFECTO si no hay fila ni tabla
export async function guardarMisPrefs(p: Partial<Omit<Prefs, 'userId'>>): Promise<void>;  // upsert
```

- [ ] **Step 1: Implementar siguiendo el patrón existente**

Copiá la forma de `src/services/alertZones.ts` (mismo cliente, mismo manejo de errores). Clave: si la consulta
falla porque la tabla no existe todavía, `getMisPrefs` devuelve `PREFS_POR_DEFECTO` y **no** propaga el error;
`guardarMisPrefs` sí propaga, para que la pantalla pueda avisar que no se pudo guardar.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/services/notificationPrefs.ts
git commit -m "feat(avisos): servicio de preferencias"
```

---

### Task A4: Pantalla "Avisos" en Perfil

**Files:**
- Create: `src/screens/NotificationPrefsScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx` (registrar la pantalla en el stack de Perfil)
- Modify: `src/screens/ProfileScreen.tsx` (entrada nueva, **justo debajo** de "Mi zona de alerta")

- [ ] **Step 1: Construir la pantalla**

Seis interruptores agrupados en dos bloques con encabezado: **"Qué quiero que me avisen"** (zona,
avistamientos, pistas, coincidencias) y **"Por dónde"** (correo, push). Cada interruptor lleva una línea que
explique en criollo qué llega — por ejemplo, para zona: *"Cuando se pierda una mascota cerca de tu zona"*.
Carga con `getMisPrefs`, guarda con `guardarMisPrefs` al tocar cada interruptor (optimista: mueve el
interruptor y si falla lo revierte y avisa con `notify`). Estados de carga y error con reintentar, igual que
`AlertZoneScreen`.

Debajo de "Por dónde", una nota fija y honesta: *"El push llega solo en la app instalada en tu teléfono."*

- [ ] **Step 2: Verificar en el navegador**

Run: `npx expo start --web` y entrá a Perfil → Avisos. Comprobá que los seis interruptores se mueven, que al
volver a entrar quedaron guardados, y que la pantalla no se rompe si la migración `0011` no está aplicada
(en ese caso muestra los valores por defecto).

- [ ] **Step 3: Correr toda la suite**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 4: Commit**

```bash
git add src/screens/NotificationPrefsScreen.tsx src/navigation/TabNavigator.tsx src/screens/ProfileScreen.tsx
git commit -m "feat(avisos): pantalla de preferencias en Perfil"
```

---

### Task A5: Edge Function `send-notifications`

**Files:**
- Create: `supabase/functions/send-notifications/index.ts`
- Create: `supabase/functions/send-notifications/README.md`
- Modify: `SETUP-PUSH-CORREO.md` (sección nueva con los pasos de despliegue)

- [ ] **Step 1: Escribir la función**

Deno, siguiendo el patrón de la Edge Function `send-push` que ya está documentada en `SETUP-PUSH-CORREO.md`.
Flujo: cliente con **service role key** → `select` de hasta 50 eventos `pendiente` ordenados por `creado_en`
→ para cada uno arma el `Contexto` (dueño y nombre del pet, zonas de alerta activas, prefs de los candidatos)
→ `resolverDestinatarios` + `componerAviso` → despacha → marca `enviado`, o `error` sumando `intentos`.
Un evento con `intentos >= 3` se salta (para que la cola no se trabe) y queda en `error`.

Correo: API de Resend (`POST https://api.resend.com/emails`) con `RESEND_API_KEY` y `RESEND_FROM` del entorno.
Push: `POST https://exp.host/--/api/v2/push/send` con los tokens de la tabla de `pushTokens`. Si falta la
variable de entorno de un canal, ese canal se salta sin marcar error (el otro canal igual se envía).

La lógica de targeting **se importa**, no se reescribe: copiá `notifyTargets.ts` a la carpeta de la función o
importalo por ruta relativa, según lo que soporte el runtime. Si tenés que duplicarlo, dejá un comentario
bien visible en los DOS archivos diciendo que están espejados.

- [ ] **Step 2: Verificar tipos y correr la suite**

Run: `npm test && npx tsc --noEmit`
Expected: verde. (La carpeta `supabase/functions` debe estar excluida de `tsconfig.json`; si no lo está,
excluila — es código Deno, no del bundle de la app.)

- [ ] **Step 3: Documentar el despliegue**

En `SETUP-PUSH-CORREO.md`, sección nueva con los comandos exactos: `supabase functions deploy
send-notifications`, las variables de entorno a setear (`RESEND_API_KEY`, `RESEND_FROM`,
`EXPO_PUBLIC_WEB_URL`), y cómo agendarla con `pg_cron` o un cron externo cada minuto.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions SETUP-PUSH-CORREO.md
git commit -m "feat(avisos): edge function de despacho + guia de despliegue"
```

---

# FUNCIÓN B — Pistas del barrio

Rama: `feat/pistas`

### Task B1: Migración `0012_pistas.sql`

**Files:**
- Create: `supabase/migrations/0012_pistas.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- PISTAS DEL BARRIO: cualquiera con cuenta aporta datos sobre un reporte.
create table public.pet_tips (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  oculto boolean not null default false,
  creado_en timestamptz not null default now()
);
alter table public.pet_tips enable row level security;

create index pet_tips_pet_id_idx on public.pet_tips (pet_id, creado_en desc);

-- Lectura pública (coherente con 0004: los reportes activos se ven sin sesión).
create policy "pistas visibles para todos"
  on public.pet_tips for select to anon, authenticated
  using (oculto = false);

create policy "crear mis pistas"
  on public.pet_tips for insert to authenticated
  with check (auth.uid() = user_id);

-- Borra el autor de la pista o el dueño del reporte.
create policy "borrar mis pistas o las de mi reporte"
  on public.pet_tips for delete to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = (select p.user_id from public.pets p where p.id = pet_id)
  );

-- Anti-spam: máximo 10 pistas por usuario por hora (mismo patrón que 0002).
create or replace function public.check_tip_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare recientes int;
begin
  select count(*) into recientes
  from public.pet_tips
  where user_id = new.user_id and creado_en > now() - interval '1 hour';
  if recientes >= 10 then
    raise exception 'Dejaste muchas pistas por ahora. Intenta de nuevo en un rato.';
  end if;
  return new;
end; $$;

create trigger pet_tips_rate_limit
  before insert on public.pet_tips
  for each row execute function public.check_tip_rate_limit();

-- Si la migración 0011 (avisos) ya está aplicada, enganchamos el aviso al dueño.
do $$
begin
  if to_regprocedure('public.enqueue_pista()') is not null then
    execute 'drop trigger if exists pet_tips_notificar on public.pet_tips';
    execute 'create trigger pet_tips_notificar after insert on public.pet_tips
             for each row execute function public.enqueue_pista()';
  end if;
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0012_pistas.sql
git commit -m "feat(pistas): migracion 0012 - tabla pet_tips con RLS y anti-spam"
```

---

### Task B2: Lógica pura `src/lib/tips.ts`

**Files:**
- Create: `src/lib/tips.ts`
- Test: `__tests__/lib/tips.test.ts`

**Interfaces:**
- Produces:

```ts
export const TIP_MAX = 500;
export type Tip = { id: string; petId: string; userId: string; texto: string; creadoEn: string };

export function validarTip(texto: string): { ok: true; texto: string } | { ok: false; error: string };
export function ordenarTips(tips: Tip[]): Tip[];                       // más nuevas primero
export function puedeBorrarTip(tip: Tip, userId: string | null, duenoPetId: string): boolean;
export function firmaAutor(nombre: string | null): string;             // 'Un vecino' si no hay nombre
```

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { validarTip, ordenarTips, puedeBorrarTip, firmaAutor, TIP_MAX, Tip } from '../../src/lib/tips';

const tip = (over: Partial<Tip> = {}): Tip => ({
  id: 't1', petId: 'p1', userId: 'autor', texto: 'lo vi', creadoEn: '2026-07-18T10:00:00Z', ...over,
});

describe('validarTip', () => {
  it('rechaza el texto vacío', () => {
    expect(validarTip('   ')).toEqual({ ok: false, error: expect.any(String) });
  });
  it('recorta los espacios de los bordes', () => {
    expect(validarTip('  lo vi cerca  ')).toEqual({ ok: true, texto: 'lo vi cerca' });
  });
  it('rechaza el texto más largo que el máximo', () => {
    expect(validarTip('a'.repeat(TIP_MAX + 1)).ok).toBe(false);
  });
  it('acepta el texto justo en el máximo', () => {
    expect(validarTip('a'.repeat(TIP_MAX)).ok).toBe(true);
  });
});

describe('ordenarTips', () => {
  it('deja las más nuevas primero', () => {
    const viejo = tip({ id: 'viejo', creadoEn: '2026-07-01T10:00:00Z' });
    const nuevo = tip({ id: 'nuevo', creadoEn: '2026-07-18T10:00:00Z' });
    expect(ordenarTips([viejo, nuevo]).map((t) => t.id)).toEqual(['nuevo', 'viejo']);
  });
  it('no muta el arreglo original', () => {
    const arr = [tip({ id: 'a' }), tip({ id: 'b', creadoEn: '2026-07-19T10:00:00Z' })];
    ordenarTips(arr);
    expect(arr.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('puedeBorrarTip', () => {
  it('deja borrar al autor', () => {
    expect(puedeBorrarTip(tip(), 'autor', 'dueno')).toBe(true);
  });
  it('deja borrar al dueño del reporte', () => {
    expect(puedeBorrarTip(tip(), 'dueno', 'dueno')).toBe(true);
  });
  it('no deja borrar a un tercero', () => {
    expect(puedeBorrarTip(tip(), 'otro', 'dueno')).toBe(false);
  });
  it('no deja borrar a un invitado', () => {
    expect(puedeBorrarTip(tip(), null, 'dueno')).toBe(false);
  });
});

describe('firmaAutor', () => {
  it('usa el nombre cuando lo hay', () => {
    expect(firmaAutor('Ana')).toBe('Ana');
  });
  it('firma como vecino cuando no hay nombre', () => {
    expect(firmaAutor(null)).toBe('Un vecino');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest __tests__/lib/tips.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/tips.ts`**

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/lib/tips.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tips.ts __tests__/lib/tips.test.ts
git commit -m "feat(pistas): logica pura con tests"
```

---

### Task B3: Servicio `src/services/tips.ts`

**Files:**
- Create: `src/services/tips.ts`

**Interfaces:**
- Produces:

```ts
export async function listarTips(petId: string): Promise<Tip[]>;            // [] si falta la tabla
export async function crearTip(petId: string, texto: string): Promise<Tip>;
export async function borrarTip(id: string): Promise<void>;
```

`listarTips` trae también el nombre del autor cuando la sesión lo permite (join a `profiles`); sin sesión ese
campo viene nulo y la interfaz firma "Un vecino" (ver `firmaAutor`). Seguí el patrón de
`src/services/petUpdates.ts`.

- [ ] **Step 1: Implementar el servicio**

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/services/tips.ts
git commit -m "feat(pistas): servicio de pistas"
```

---

### Task B4: Sección "Pistas del barrio" en el detalle

**Files:**
- Modify: `src/screens/PetDetailScreen.tsx` (sección nueva **entre** Novedades e Historia)

- [ ] **Step 1: Construir la sección**

Encabezado "Pistas del barrio" con ícono de línea, y bajada: *"Lo que fue viendo el vecindario."* Composer
(campo multilínea + botón "Dejar una pista") con contador de caracteres al acercarse a `TIP_MAX`, deshabilitado
mientras el texto no valide. Cada pista: firma del autor (`firmaAutor`), tiempo relativo con el helper de
`src/lib/time.ts`, texto, y botón de borrar solo si `puedeBorrarTip`. Borrar pide confirmación con
`confirmAction`.

Estado vacío: *"Todavía nadie dejó una pista. Si viste algo, contalo — cualquier dato suma."*

**Diferenciar de Novedades:** Novedades es la voz del dueño y va en tarjeta llena; Pistas es la voz del barrio
y va en tarjetas más livianas con la firma arriba. No deben leerse como la misma sección repetida.

**Invitado:** el composer se reemplaza por un botón que llama a `requireAuth('dejar_pista')` de la Función C.
Si al momento de implementar esto la Función C todavía no está fusionada, dejá la llamada escrita contra esa
firma y un `TODO(merge)` de una línea — se resuelve en la fusión.

- [ ] **Step 2: Verificar en el navegador**

Publicá un reporte de prueba, dejá una pista, comprobá que aparece con la firma y el tiempo, borrala como
autor, y comprobá que el dueño también puede borrar una pista ajena. Borrá el reporte de prueba al terminar.

- [ ] **Step 3: Correr toda la suite**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 4: Commit**

```bash
git add src/screens/PetDetailScreen.tsx
git commit -m "feat(pistas): seccion en el detalle del reporte"
```

---

# FUNCIÓN C — Modo invitado

Rama: `feat/invitado`

### Task C1: El portero `src/lib/requireAuth.ts`

**Files:**
- Create: `src/lib/requireAuth.ts`
- Test: `__tests__/lib/requireAuth.test.ts`

**Interfaces:**
- Produces:

```ts
export type AccionProtegida =
  | 'contactar' | 'publicar' | 'guardar' | 'dejar_pista'
  | 'avistamiento' | 'novedad' | 'denunciar' | 'reencuentro';

export const MENSAJES: Record<AccionProtegida, string>;  // 'Creá tu cuenta para escribirle al dueño', etc.
export function mensajeDe(accion: AccionProtegida): string;
```

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { MENSAJES, mensajeDe, AccionProtegida } from '../../src/lib/requireAuth';

const ACCIONES: AccionProtegida[] = ['contactar', 'publicar', 'guardar', 'dejar_pista',
  'avistamiento', 'novedad', 'denunciar', 'reencuentro'];

describe('mensajes del portero', () => {
  it('tiene un mensaje para cada acción protegida', () => {
    ACCIONES.forEach((a) => expect(typeof MENSAJES[a]).toBe('string'));
  });
  it('todos los mensajes invitan a crear cuenta', () => {
    ACCIONES.forEach((a) => expect(MENSAJES[a].toLowerCase()).toContain('cuenta'));
  });
  it('los mensajes son distintos entre sí', () => {
    expect(new Set(ACCIONES.map((a) => MENSAJES[a])).size).toBe(ACCIONES.length);
  });
  it('mensajeDe devuelve el texto de la acción', () => {
    expect(mensajeDe('contactar')).toBe(MENSAJES.contactar);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest __tests__/lib/requireAuth.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar los mensajes**

Ocho mensajes distintos, en el tono de la app: *"Creá tu cuenta para escribirle al dueño"*, *"Creá tu cuenta
para publicar un reporte"*, *"Creá tu cuenta para guardar este reporte"*, *"Creá tu cuenta para dejar una
pista"*, *"Creá tu cuenta para avisar que la viste"*, *"Creá tu cuenta para contar una novedad"*, *"Creá tu
cuenta para denunciar este reporte"*, *"Creá tu cuenta para marcar el reencuentro"*.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/lib/requireAuth.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/requireAuth.ts __tests__/lib/requireAuth.test.ts
git commit -m "feat(invitado): mensajes del portero con tests"
```

---

### Task C2: Hook `useRequireAuth`

**Files:**
- Create: `src/hooks/useRequireAuth.ts`

**Interfaces:**
- Consumes: `useAuth()` de `src/hooks/useAuth.tsx`, `mensajeDe` de `src/lib/requireAuth.ts`.
- Produces:

```ts
export function useRequireAuth(): (accion: AccionProtegida) => boolean;
```

Devuelve `true` si hay sesión (el llamador sigue con lo suyo). Si no hay sesión: muestra el mensaje de la
acción y navega a `Register`, y devuelve `false`.

- [ ] **Step 1: Implementar el hook**

Usá `useNavigation` de React Navigation. La intención se guarda pasando los parámetros de vuelta a la
pantalla de registro (`{ volverA: <ruta actual>, params: <params actuales> }`), de modo que al terminar de
registrarse el usuario vuelva a donde estaba en vez de caer en Inicio.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRequireAuth.ts
git commit -m "feat(invitado): hook del portero"
```

---

### Task C3: Navegación sin bifurcación de sesión

**Files:**
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/auth/RegisterScreen.tsx` y `src/screens/auth/LoginScreen.tsx` (honrar `volverA`)

- [ ] **Step 1: Reescribir el navegador raíz**

`TabNavigator` se monta **siempre**, con o sin sesión. Las pantallas `Login`, `Register` y `ForgotPassword`
quedan siempre registradas en el stack raíz para poder empujarlas desde cualquier lado. La rama `recovering`
(recuperar contraseña) se mantiene tal cual: sigue teniendo prioridad sobre todo lo demás. `MascotaPublica`
y el `linking` no se tocan.

**Cuidado con el `key={initialRouteName}`** que hoy fuerza el remonte del stack: al dejar de bifurcar por
sesión, revisá que iniciar y cerrar sesión sigan llevando al lugar correcto y que no quede una pantalla de
auth colgada en el historial después de entrar.

- [ ] **Step 2: Honrar la vuelta después de registrarse**

Al completar registro o login con `volverA` en los parámetros, navegar ahí en vez de al Inicio.

- [ ] **Step 3: Verificar en el navegador**

Abrí la app sin sesión: tiene que caer en Inicio, no en el login. Navegá Inicio, Lista, Mapa y el detalle de
un reporte. Después iniciá sesión y comprobá que todo sigue funcionando como antes, y que cerrar sesión te
deja en la app en modo invitado (no en una pantalla rota).

- [ ] **Step 4: Correr toda la suite**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add src/navigation/RootNavigator.tsx src/screens/auth
git commit -m "feat(invitado): la app arranca con o sin sesion"
```

---

### Task C4: Degradar los servicios y pantallas con sesión nula

**Files:**
- Modify: `src/hooks/useFavorites.tsx`, `src/hooks/useZoneAlert.ts`, `src/hooks/useUnread.tsx`
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/screens/HomeScreen.tsx`, `src/screens/ListScreen.tsx`, `src/screens/MapScreen.tsx` (lo que asuma sesión)

- [ ] **Step 1: Degradar los hooks**

`useFavorites` → conjunto vacío y el corazón dispara `requireAuth('guardar')`. `useZoneAlert` → apagado, sin
consultar. `useUnread` → cero, sin suscripción de realtime. Ninguno debe consultar la base sin sesión ni
reventar con `user` nulo.

- [ ] **Step 2: Perfil sin sesión**

Pantalla de bienvenida con el perrito de la app, una línea cálida (*"Entrá para publicar, guardar y hablar con
el barrio"*) y dos botones: "Entrar" y "Crear cuenta". Nada de secciones vacías ni de un perfil fantasma.

- [ ] **Step 3: Verificar en el navegador**

Sin sesión, recorré Inicio, Lista, Mapa, detalle y Perfil. Ninguna pantalla debe mostrar error, spinner
infinito ni un dato de otro usuario. Mirá la consola: no debe haber errores de red por consultas que no
correspondían.

- [ ] **Step 4: Correr toda la suite**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add src/hooks src/screens
git commit -m "feat(invitado): los servicios degradan sin sesion"
```

---

### Task C5: Poner el portero en cada acción protegida

**Files:**
- Modify: `src/screens/PetDetailScreen.tsx` (contactar, avistamiento, novedad, denunciar, reencuentro, guardar)
- Modify: `src/navigation/TabNavigator.tsx` (Publicar y Mensajes)
- Modify: `src/components/PetCard.tsx` (el corazón)

- [ ] **Step 1: Cablear `useRequireAuth` en cada acción**

Las ocho acciones de `AccionProtegida`. Patrón: `if (!requireAuth('contactar')) return;` como primera línea
del manejador. Los tabs Publicar y Mensajes **siguen visibles**: al tocarlos sin sesión disparan el portero en
vez de navegar.

- [ ] **Step 2: Verificar en el navegador**

Sin sesión, tocá una por una las ocho acciones y comprobá que cada una muestra **su** mensaje (no uno genérico)
y lleva a registro. Después registrate desde una de ellas y comprobá que volvés a la pantalla donde estabas.

- [ ] **Step 3: Correr toda la suite**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 4: Commit**

```bash
git add src/screens src/navigation src/components
git commit -m "feat(invitado): portero en las acciones protegidas"
```

---

## Fusión (la hago yo, no los agentes)

Orden: **C → A → B.**

Choques esperados:
- `ProfileScreen.tsx`: A agrega la entrada "Avisos"; C agrega el estado sin sesión. Conviven: la entrada va
  dentro de la rama con sesión.
- `PetDetailScreen.tsx`: B agrega su sección; C agrega los guardas. Conviven: el guarda va adentro del
  composer de B.
- `TabNavigator.tsx`: A registra la pantalla de Avisos; C toca Publicar y Mensajes. Conviven.

Después de fusionar: `npm test` y `npx tsc --noEmit` en verde, y la verificación visual de las tres funciones
juntas en el navegador.

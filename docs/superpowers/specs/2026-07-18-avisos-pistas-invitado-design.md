# Diseño — Tanda 3: avisos externos, pistas del barrio y modo invitado

Fecha: 2026-07-18 · Proyecto: Encuentra tu Mascota · Rama base: `master`

## Por qué

Las tres funciones atacan el mismo hueco: **hoy la app solo sirve si ya estás adentro mirándola.**

- Nada sale del teléfono: las alertas de zona, los avistamientos y las coincidencias son solo in-app.
- El vecino no tiene dónde aportar una pista suelta: o abre un chat privado, o marca un punto en el mapa.
- Para ver un reporte hay que registrarse, así que el vecino que recibe un afiche por WhatsApp se va.

Una mascota perdida se juega en las primeras 24 horas. Las tres funciones abren el circuito: el invitado
entra por el link, lee y deja una pista, y el dueño se entera aunque tenga la app cerrada.

---

## A. Avisos que salen de la app (correo + push)

### Decisión de fondo: la cola la escribe la base, no el cliente

Si el cliente decidiera a quién avisar, cualquiera podría forjar avisos hacia otros usuarios. Por eso los
eventos se encolan con **triggers en Postgres** y el despacho ocurre en una **Edge Function**. El cliente
nunca escribe en la cola.

### Datos — migración `0011_avisos.sql`

```
notification_prefs
  user_id uuid pk -> profiles(id) on delete cascade
  zona          boolean not null default true   -- reportes nuevos en mi zona de alerta
  avistamientos boolean not null default true   -- alguien vio a MI mascota
  pistas        boolean not null default true   -- alguien dejó una pista en MI reporte
  coincidencias boolean not null default true   -- apareció un posible match
  canal_email   boolean not null default true
  canal_push    boolean not null default true
  actualizado_en timestamptz not null default now()

notification_events            -- cola cruda, la escriben SOLO los triggers
  id uuid pk default gen_random_uuid()
  tipo text not null           -- 'reporte_nuevo' | 'avistamiento' | 'pista'
  pet_id uuid not null -> pets(id) on delete cascade
  actor_id uuid -> profiles(id) on delete set null   -- quién lo generó (no se le avisa a sí mismo)
  datos jsonb not null default '{}'                  -- lat/lng del avistamiento, extracto de la pista…
  estado text not null default 'pendiente'           -- 'pendiente' | 'enviado' | 'error'
  intentos int not null default 0
  creado_en timestamptz not null default now()
  procesado_en timestamptz
```

RLS:
- `notification_prefs`: cada quien lee y escribe **solo la suya** (`auth.uid() = user_id`), igual que `favorites`.
- `notification_events`: **ninguna política para `authenticated` ni `anon`** — la tabla es invisible desde la
  app. Solo la Edge Function la toca, con la service role key.

Triggers (`after insert`): en `pets` → `reporte_nuevo`; en `sightings` → `avistamiento`; en `pet_tips` →
`pista`. Son `security definer` y solo hacen el insert en la cola: nada de lógica de targeting en SQL.

Índice: `notification_events (estado, creado_en)` para que la Edge Function lea rápido lo pendiente.

### Lógica de targeting — `src/lib/notifyTargets.ts` (TypeScript puro, con tests)

Un solo lugar decide a quién le toca cada aviso, y lo comparte la app y la Edge Function.

```ts
type Evento = { tipo: 'reporte_nuevo' | 'avistamiento' | 'pista'; petId: string; actorId: string | null; datos: … }
type Destinatario = { userId: string; email: string | null; pushToken: string | null; canales: ('email'|'push')[] }

resolverDestinatarios(evento, contexto): Destinatario[]
componerAviso(evento, contexto): { titulo: string; cuerpo: string; url: string }
```

Reglas:
- `reporte_nuevo` → dueños de zonas de alerta cuyo centro esté dentro del radio (reusa `distanciaKm` de
  `src/lib/geo.ts` y la lógica ya probada de `src/lib/alerts.ts`), con `prefs.zona = true`.
- `avistamiento` y `pista` → **solo el dueño del reporte**, con su preferencia correspondiente.
- Nunca se le avisa al actor de su propio evento (`actorId`).
- Un destinatario sin preferencias guardadas se trata con los valores por defecto (todo en `true`).
- Se deduplica por `userId` (una persona, un aviso, aunque tenga dos zonas que solapan).

El texto es cálido y en el tono de la app, no un correo de sistema: *"Hay una mascota perdida cerca tuyo"*,
*"Alguien vio a Pelusa"*, *"Dejaron una pista sobre Pelusa"*.

### Despacho — Edge Function `supabase/functions/send-notifications`

Lee hasta N eventos `pendiente`, resuelve destinatarios, despacha y marca `enviado` (o `error` sumando
`intentos`; a los 3 intentos se abandona el evento para que la cola no se trabe). Correo por la **API de
Resend**; push por la **API de Expo**, reusando los tokens de `pushTokens.ts`.

**Se despliega cuando el usuario quiera.** Mientras no exista, los triggers siguen encolando y no se envía
nada: la app funciona igual. Ese es el comportamiento esperado, no un bug.

### Interfaz — pantalla "Avisos" en Perfil

Entrada en Perfil junto a "Mi zona de alerta". Cuatro interruptores de tipo y dos de canal, con un texto que
explique en criollo qué llega por cada uno. Si la tabla no existe todavía, la pantalla degrada a los valores
por defecto sin romper (mismo patrón que favoritos y novedades).

---

## B. Pistas del barrio

### Datos — migración `0012_pistas.sql`

```
pet_tips
  id uuid pk default gen_random_uuid()
  pet_id uuid not null -> pets(id) on delete cascade
  user_id uuid not null -> profiles(id) on delete cascade
  texto text not null
  oculto boolean not null default false
  creado_en timestamptz not null default now()
```

RLS:
- `select` para `authenticated` **y `anon`** cuando `oculto = false` (coherente con la lectura pública de
  reportes de `0004`, y necesario para el modo invitado).
- `insert` para `authenticated` con `auth.uid() = user_id`.
- `delete` para el **autor** o el **dueño del reporte** (subconsulta a `pets`), igual que la política de
  borrado de `sightings`.

Anti-spam: trigger `before insert` con el mismo patrón de `0002` — máximo **10 pistas por usuario por hora**,
con el mismo mensaje amable.

Denuncias: se reusa el flujo existente. `denuncias` referencia `pet_id`, así que denunciar una pista denuncia
el reporte que la contiene; para el alcance de esta tanda alcanza, y el dueño puede borrar la pista él mismo.

### Interfaz

Sección **"Pistas del barrio"** en `PetDetailScreen`, **debajo de Novedades** y arriba de Historia. Novedades
es la voz del dueño; Pistas es la voz del barrio, y se distinguen visualmente (avatar + nombre del autor,
tiempo relativo, tono más liviano).

**Autoría vista por un invitado:** `profiles` no se lee sin sesión (ver C), así que el invitado no puede
resolver el nombre del autor. En ese caso la pista se muestra firmada como **"Un vecino"** con el avatar
genérico; con sesión iniciada se ve el nombre real. La pista **nunca** deja de mostrarse por no poder resolver
al autor: el texto es lo que importa.

Composer para quien tenga cuenta; para el invitado, un botón que dispara
`requireAuth` (función C). Cada pista muestra el ícono de borrar solo si sos el autor o el dueño.

Estado vacío: *"Todavía nadie dejó una pista. Si viste algo, contalo — cualquier dato suma."*

Archivos: `src/lib/tips.ts` (validación y ordenamiento, puro + tests), `src/services/tips.ts`, sección en
`PetDetailScreen.tsx`.

---

## C. Modo invitado

### Navegación

`RootNavigator` deja de bifurcar entre "Login" y "App": **siempre monta `TabNavigator`**, haya sesión o no.
Las pantallas de auth (`Login`, `Register`, `ForgotPassword`) pasan a estar siempre registradas en el stack
raíz, para poder empujarlas desde cualquier lado. La rama `recovering` (recuperar contraseña) queda igual.

Tabs sin sesión: Inicio, Mapa y Lista funcionan normal. Publicar y Mensajes siguen visibles — tocarlos
dispara `requireAuth`, que es mejor que esconderlos (el invitado ve que la app hace más de lo que está viendo).
Perfil, sin sesión, muestra una pantalla de bienvenida con "Entrar" y "Crear cuenta".

### El portero — `src/lib/requireAuth.ts` + `useRequireAuth`

```ts
requireAuth(accion: AccionProtegida): boolean   // true si puede seguir
```

Sin sesión, muestra un mensaje amable con el texto propio de esa acción (*"Creá tu cuenta para escribirle al
dueño"*, *"…para guardar este reporte"*, *"…para dejar una pista"*, *"…para avisar que la viste"*,
*"…para publicar un reporte"*) y navega a Registro **guardando la intención**, de modo que al terminar de
registrarse vuelva a la pantalla donde estaba. Los textos viven en un mapa único, para que suenen parejos.

Acciones protegidas: contactar, publicar, guardar (favorito), dejar pista, marcar avistamiento, publicar
novedad, denunciar, marcar reencuentro.

### Degradación de los servicios

Todo lo que hoy asume `user.id`: `useFavorites` (set vacío, el corazón dispara `requireAuth`), `useZoneAlert`
(apagado), `useUnread` (cero), Perfil (bienvenida). Ninguno debe reventar con sesión nula.

### Datos del dueño

`profiles` hoy solo se lee con sesión iniciada. El invitado ve la ficha completa **sin** los datos de contacto
del dueño — que es lo correcto, porque contactar exige cuenta igual. Donde el nombre del dueño no esté
disponible, se degrada a un texto neutro; **no** se abre `profiles` al público en esta tanda.

---

## Construcción: tres agentes en paralelo

Un worktree por función (`feat/avisos`, `feat/pistas`, `feat/invitado`), con `node_modules` por junction,
igual que en las tandas anteriores.

**Orden de fusión: C → A → B.** C es la estructural (navegación); A toca Perfil; B toca el detalle. Los choques
esperados son `ProfileScreen.tsx` (A agrega "Avisos", C agrega el estado sin sesión) y `PetDetailScreen.tsx`
(B agrega su sección, C agrega los guardas de `requireAuth`). Fusionando la estructural primero, los otros dos
se acomodan encima.

Para que B y C no choquen de más: B escribe su composer asumiendo que **existe** `requireAuth`; si al momento
de fusionar todavía no está, se resuelve en el merge (es una línea).

## Verificación

- Tests unitarios de la lógica pura: `notifyTargets.ts`, `tips.ts`, `requireAuth.ts`. La suite completa
  (`npm test`) y `npx tsc --noEmit` deben quedar en verde.
- Prueba visual en el navegador (Playwright a `localhost:8091`), que es la que vale:
  - **C**: entrar sin sesión, navegar Inicio/Lista/Mapa/detalle, y comprobar que cada acción protegida
    muestra su mensaje y lleva a registro.
  - **B**: dejar una pista, verla aparecer, borrarla como autor y como dueño.
  - **A**: la pantalla de Avisos guarda las preferencias, y la cola `notification_events` se llena al publicar
    un reporte / dejar una pista (se comprueba contra la base con la service role key).
- El envío real de correo y push **no** es verificable en esta tanda: necesita desplegar la Edge Function,
  verificar el dominio en Resend y armar el build de EAS. Queda escrito y documentado en `SETUP-PUSH-CORREO.md`.

Truco conocido para Playwright sobre RN-web: los botones no se pueden clickear por texto (pega en el tab bar o
en el header). Hay que buscar en JS el `div` cuyo `innerText` **termina** con la etiqueta y que sea ancho
(`offsetWidth > 250`, `offsetHeight < 90`) — el botón real trae el glyph de Ionicons antes del texto — y hacer
`page.mouse.click` sobre su centro.

## Pendiente del usuario al cerrar la tanda

1. Aplicar `0011_avisos.sql` y `0012_pistas.sql` en el SQL Editor de Supabase.
2. Verificar un dominio en Resend y cambiar el remitente (hoy entrega solo a `pdanielespinozavega@gmail.com`).
3. Desplegar la Edge Function `send-notifications` con la service role key en el entorno.
4. `eas init` + build para que el push llegue de verdad.

## Fuera de alcance (a propósito)

Pistas anónimas sin cuenta, pistas con punto en el mapa (se fusionarían con "Visto por acá"), aprobación previa
del dueño, digest diario de avisos, y abrir `profiles` a lectura pública.

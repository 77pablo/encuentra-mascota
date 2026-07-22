# Tanda 6 funciones + pulido — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seis funciones (tarjeta compartible, búsqueda guardada, preguntas en adopción, guía "encontré", filtro comuna en adopción, carnet Mi mascota) + tres pulidos de adopción, construidas por 4 agentes en paralelo.

**Architecture:** Cada agente trabaja en su propio worktree sobre `feat/mvp-encuentra-mascota` con archivos calientes disjuntos y migraciones numeradas fijas (0031 B, 0032/0033 C, 0034 D). El orquestador fusiona (orden C → B → D → A), reconcilia los solapes declarados, corre el test-espejo y hace revisión final de rama adversarial.

**Tech Stack:** Expo RN + TypeScript, Supabase (Postgres + RLS + PostgREST), jest, react-native-view-shot.

**Spec:** `docs/superpowers/specs/2026-07-22-tanda-6funciones-pulido-design.md` — leerlo ANTES de empezar.

## Global Constraints (aplican a TODA tarea)

- Colores SIEMPRE con el patrón dinámico: `const colors = useColors(); const styles = useMemo(() => crearEstilos(colors), [colors])`. Nunca `StyleSheet.create` a nivel de módulo con colores.
- **Excepción:** assets compartibles/imprimibles (`TarjetaCompartir`) van en **paleta CLARA fija** (`lightColors` de `src/theme`), como `AfichePoster`/`CollarTag`.
- Textos en español chileno cálido (tono de la app; mirar pantallas vecinas).
- Todo texto público nuevo pasa por `moderarTexto` (`src/lib/moderarTexto.ts`) ANTES de escribir en la base — también al EDITAR.
- Borrados vía PostgREST siempre con `.select()` y verificando filas devueltas (un delete rechazado por RLS no da error, borra 0 filas).
- Navegación desde pantallas del stack RAÍZ a tabs: **anidada absoluta** `navigation.navigate('App', { screen: '<Tab>', params: {...} })`. Nombre pelado = botón muerto.
- Cuentas borradas firman "Un vecino" (`getNombrePublico` en `src/services/profile.ts`).
- Migraciones: encabezado comentado explicando qué y por qué; CHECKs de largo en toda columna que escribe el usuario (patrón 0016); `security definer` siempre con `set search_path = public, pg_temp`.
- Cada tarea: TDD donde haya lógica (test primero), `npx tsc --noEmit` limpio y `npm test` verde antes de commitear. Commits chicos y frecuentes.
- Los agentes NO tocan migraciones de otro agente ni `App.tsx` (la navegación raíz la reconcilia el orquestador si hay choque; declarar en el resumen qué se registró).

---

## Orquestador · Tarea 0: infraestructura de worktrees

El aislamiento automático del Agent tool **falla** en esta sesión (arranca en System32). Crear a mano, un worktree por agente:

- [ ] **Paso 1: crear worktrees + junctions + .env + puertos**

```powershell
cd C:\Users\pdani\encuentra-mascota
git worktree add ..\em-agente-a -b tanda6/a-tarjeta
git worktree add ..\em-agente-b -b tanda6/b-busqueda
git worktree add ..\em-agente-c -b tanda6/c-adopcion
git worktree add ..\em-agente-d -b tanda6/d-guia-carnet
foreach ($w in 'a','b','c','d') {
  cmd /c mklink /J "C:\Users\pdani\em-agente-$w\node_modules" "C:\Users\pdani\encuentra-mascota\node_modules"
  Copy-Item C:\Users\pdani\encuentra-mascota\.env "C:\Users\pdani\em-agente-$w\.env"
}
```

Puertos si algún agente levanta la app: A=8092, B=8093, C=8094, D=8095.

- [ ] **Paso 2: despachar los 4 agentes en paralelo** (un mensaje, 4 llamadas Agent), cada uno con: ruta de su worktree, su sección de este plan completa, el spec, y la instrucción de commitear en su rama y reportar QUÉ NO PROBÓ.

---

# AGENTE A — F1 · Tarjeta compartible

Worktree: `C:\Users\pdani\em-agente-a` · rama `tanda6/a-tarjeta` · sin migraciones.

### Tarea A1: helper puro `tarjetaTextos`

**Files:**
- Create: `src/lib/tarjeta.ts`
- Test: `src/lib/tarjeta.test.ts`

**Interfaces:**
- Produces: `tarjetaTextos(pet: Pet): { banda: string; titulo: string; subtitulo: string | null; esPerdida: boolean }` — `banda` = "PERDIDA EN MAIPÚ" / "ENCONTRADA" (mayúsculas, sin emoji: el color de la banda ya comunica); `titulo` = nombre o "¿La has visto?" si no hay nombre (perdida) / "¿Es tuya?" (encontrada); `subtitulo` = "Perro · Quiltro" (especie capitalizada + raza si hay).

- [ ] **Paso 1: test que falla**

```ts
import { tarjetaTextos } from './tarjeta';
const base = { id: 'x', estado: 'perdida', especie: 'perro', nombre: 'Luna',
  raza: 'Quiltro', comuna: 'Maipú', descripcion: '', fotos: [] } as any;

test('perdida con comuna y nombre', () => {
  expect(tarjetaTextos(base)).toEqual({
    banda: 'PERDIDA EN MAIPÚ', titulo: 'Luna', subtitulo: 'Perro · Quiltro', esPerdida: true });
});
test('encontrada sin comuna ni nombre ni raza', () => {
  const t = tarjetaTextos({ ...base, estado: 'encontrada', comuna: null, nombre: null, raza: null });
  expect(t.banda).toBe('ENCONTRADA');
  expect(t.titulo).toBe('¿Es tuya?');
  expect(t.subtitulo).toBe('Perro');
  expect(t.esPerdida).toBe(false);
});
test('perdida sin nombre', () => {
  expect(tarjetaTextos({ ...base, nombre: null }).titulo).toBe('¿La has visto?');
});
```

- [ ] **Paso 2:** `npm test -- tarjeta` → FALLA (módulo no existe)
- [ ] **Paso 3:** implementar `tarjetaTextos` (mayúsculas con `toLocaleUpperCase('es')`, capitalizar especie)
- [ ] **Paso 4:** `npm test -- tarjeta` → PASA
- [ ] **Paso 5:** commit `feat(tarjeta): textos de la tarjeta compartible`

### Tarea A2: componente `TarjetaCompartir` + captura

**Files:**
- Create: `src/components/TarjetaCompartir.tsx`
- Modify: `src/lib/aficheImage.ts` (solo si hace falta parametrizar tamaño de captura; no romper el afiche)
- Create: `src/lib/compartirTarjeta.ts`

**Interfaces:**
- Consumes: `tarjetaTextos` (A1), `captureRef` vía `aficheImage.ts`, `petUrl` de `src/lib/links.ts`, QR con el patrón de `AfichePoster` (`src/lib/qr.ts`).
- Produces: `<TarjetaCompartir pet={pet} innerRef={ref} />` (vista 1080×1080 renderizada off-screen, patrón del afiche) y `compartirTarjeta(ref, pet): Promise<'compartida'|'descargada'|'error'>`.

- [ ] **Paso 1:** leer `AfichePoster.tsx` + `AficheGenerator.tsx` + `src/lib/aficheImage.ts` enteros (es el patrón a seguir, incluida la vista off-screen y cómo se captura).
- [ ] **Paso 2:** `TarjetaCompartir`: vista cuadrada (lado fijo 1080 con `transform: scale` para previsualizar, como haga el afiche): banda superior con color `#C62828` (perdida) / `#2E7D32` (encontrada) y el texto de `tarjetaTextos`; foto del reporte ocupando el centro (`fotos[0]`, `resizeMode cover`); pie con `titulo` + `subtitulo`, QR chico a `petUrl(pet.id)` y "Encuentra tu Mascota". **Paleta clara fija** (`lightColors`), nunca `useColors`.
- [ ] **Paso 3:** `compartirTarjeta`: captura con el helper de `aficheImage`; en web intenta `navigator.share({ files: [new File(...)] })` gateado por `navigator.canShare?.({ files })`; si no, descarga (`<a download="mascota.png">` con el dataURL) y devuelve `'descargada'`. En nativo `expo-sharing` (`Sharing.shareAsync(uri)`). Errores → `notify` en español, devuelve `'error'`.
- [ ] **Paso 4:** test de render del componente (patrón de los tests de componentes existentes: render con un pet de fixture, asserts sobre los textos) — la captura/compartir NO se testea unitario, queda para verificación visual.
- [ ] **Paso 5:** `npm test` + `npx tsc --noEmit` → verdes. Commit `feat(tarjeta): componente 1080x1080 + compartir con archivo`.

### Tarea A3: entradas en detalle y post-publicar

**Files:**
- Modify: `src/screens/PetDetailScreen.tsx` (botón "Compartir tarjeta" junto al compartir de texto existente)
- Modify: `src/screens/PublishScreen.tsx` (en la confirmación post-publicación, ofrecer compartir la tarjeta)

- [ ] **Paso 1:** en `PetDetailScreen`, localizar el botón de compartir actual (`shareReport`); agregar al lado "Compartir tarjeta" que monta `TarjetaCompartir` off-screen y llama `compartirTarjeta`. El compartir de texto SE CONSERVA.
- [ ] **Paso 2:** en `PublishScreen`, tras publicar OK (donde hoy se ofrece la guía de perdida), sumar la oferta de tarjeta. ⚠️ **Solape declarado con el agente D en este archivo**: tocar lo MÍNIMO (un bloque autocontenido), el orquestador reconcilia.
- [ ] **Paso 3:** `npm test` + `tsc` verdes. Commit `feat(tarjeta): entradas en detalle y post-publicar`.
- [ ] **Paso 4:** verificación visual propia (puerto 8092): abrir un reporte → "Compartir tarjeta" descarga un PNG 1080×1080 correcto (banda/foto/QR). Reportar captura.

---

# AGENTE B — F2 · Búsqueda guardada con aviso

Worktree: `C:\Users\pdani\em-agente-b` · rama `tanda6/b-busqueda` · migración `0031`.

### Tarea B1: migración `0031_busquedas_guardadas.sql`

**Files:**
- Create: `supabase/migrations/0031_busquedas_guardadas.sql`

**Interfaces:**
- Produces: tabla `busquedas_guardadas(id, user_id, tipo, especie, comuna, creado_en)`; eventos `tipo='busqueda_guardada'` con `target_user_id` (patrón escaneo_collar del 0027).

- [ ] **Paso 1: escribir la migración** (base; ajustar comentarios al estilo del repo):

```sql
-- 0031 · Búsquedas guardadas: "avisame si aparece un gato en Ñuñoa".
create table public.busquedas_guardadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('perdida', 'encontrada')),
  especie text check (especie is null or especie in ('perro', 'gato', 'otro')),
  comuna text not null check (length(btrim(comuna)) between 1 and 80),
  creado_en timestamptz not null default now()
);
alter table public.busquedas_guardadas enable row level security;
create policy "busquedas propias" on public.busquedas_guardadas
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tope 5 por usuario (una policy no puede contar filas).
create function public.limite_busquedas_guardadas() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.busquedas_guardadas where user_id = new.user_id) >= 5 then
    raise exception 'BUSQUEDAS_TOPE';
  end if;
  return new;
end $$;
create trigger trg_limite_busquedas before insert on public.busquedas_guardadas
  for each row execute function public.limite_busquedas_guardadas();

-- CHECK de tipos de la cola: lista UNIÓN vigente + el nuevo (patrón 0026/0027).
alter table public.notification_events drop constraint if exists notification_events_tipo_check;
alter table public.notification_events add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo','avistamiento','pista','coincidencia','escaneo_collar','busqueda_guardada'));

-- Al publicarse un reporte, encolar un aviso por usuario cuya búsqueda calce.
-- security definer: lee búsquedas de TODOS los usuarios (la RLS no lo dejaría).
create function public.enqueue_busquedas_guardadas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
  select distinct on (b.user_id)
    'busqueda_guardada', new.id, b.user_id, new.user_id,
    jsonb_build_object('estado', new.estado, 'especie', new.especie,
                       'comuna', new.comuna, 'nombre', new.nombre)
  from public.busquedas_guardadas b
  where b.user_id <> new.user_id
    and b.tipo = new.estado::text
    and (b.especie is null or b.especie = new.especie::text)
    and (b.comuna = new.comuna or b.comuna = any(coalesce(new.comunas_alcance, '{}')));
  return new;
end $$;
create trigger trg_busquedas_guardadas after insert on public.pets
  for each row execute function public.enqueue_busquedas_guardadas();
```

- [ ] **Paso 2:** contrastar contra `0027_mi_mascota.sql` (columnas reales de `notification_events`, nombre exacto del CHECK) y `0020` (nombres reales `pets.comuna`/`comunas_alcance`). Ajustar si algo difiere.
- [ ] **Paso 3:** commit `feat(busqueda-guardada): migracion 0031 (tabla + tope 5 + trigger de encolado)`. **NO aplicarla** (la aplica el orquestador).

### Tarea B2: `notifyTargets` ×2 (espejo) + test-espejo

**Files:**
- Modify: `src/lib/notifyTargets.ts`
- Modify: `supabase/functions/send-notifications/notifyTargets.ts` (copia IDÉNTICA)
- Test: el test-espejo existente (buscarlo: `grep -r "espejo" src`) + casos nuevos

**Interfaces:**
- Consumes: `EventoAviso` ya tiene `target_user_id` (escaneo_collar).
- Produces: `TipoEvento` suma `'busqueda_guardada'`; `resolverDestinatarios` lo trata como destinatario directo (= `target_user_id`), **sin filtrar por la pref `zona` ni por ninguna pref de tipo** (opt-in explícito: guardaste la búsqueda, te avisamos), respetando SÍ los canales; `componerAviso` arma "Apareció un reporte que calza con tu búsqueda: PERDIDA en Maipú — perro «Luna»" con ruta `/mascota/:id`.

- [ ] **Paso 1: tests que fallan** (en el archivo de tests de notifyTargets): destinatario directo excluye al actor; ignora pref `zona=false`; respeta `canal_email=false`; texto con y sin nombre; el test-espejo cubre el tipo nuevo.
- [ ] **Paso 2:** `npm test -- notifyTargets` → FALLA
- [ ] **Paso 3:** implementar en `src/lib/notifyTargets.ts` siguiendo el bloque de `escaneo_collar` (líneas ~114-120 y ~180-190); copiar el archivo ENTERO a la copia de la Edge Function.
- [ ] **Paso 4:** `npm test` → verde (incluido espejo). Commit `feat(busqueda-guardada): tipo nuevo en notifyTargets (ambas copias)`.

### Tarea B3: servicio + UI

**Files:**
- Create: `src/services/busquedasGuardadas.ts` + test
- Create: `src/screens/MisBusquedasScreen.tsx`
- Modify: `src/screens/ExplorarScreen.tsx` (botón "Guardar esta búsqueda")
- Modify: `src/screens/ProfileScreen.tsx` (entrada "Mis búsquedas")
- Modify: navegación donde se registran las pantallas de Perfil (seguir el patrón de `MisBusquedas` vecinas como `AlertZone`/`MyPets`)

**Interfaces:**
- Produces: `listBusquedas(): Promise<BusquedaGuardada[]>`, `guardarBusqueda(b: {tipo, especie?, comuna}): Promise<void>` (traduce el error `BUSQUEDAS_TOPE` a "Ya tenés 5 búsquedas guardadas…"), `borrarBusqueda(id): Promise<void>` (con `.select()`).

- [ ] **Paso 1:** servicio con TDD (mock de supabase como en `src/services/*.test.ts` vecinos): listar, guardar, tope→mensaje amigable, borrar verifica fila devuelta.
- [ ] **Paso 2:** en `ExplorarScreen`: cuando los filtros activos incluyen comuna, botón "🔔 Avisarme de esta búsqueda" (portero `useRequireAuth` para invitados) que llama `guardarBusqueda({ tipo: filtroEstado, especie: filtroEspecie ?? null, comuna })`. Si no hay comuna en el filtro, el botón no aparece.
- [ ] **Paso 3:** `MisBusquedasScreen`: lista ("🔴 Perdida · Perro · Maipú"), borrar con confirmación, vacío amable ("Guardá una búsqueda desde Explorar…"). Entrada en Perfil junto a "Mi zona de alerta".
- [ ] **Paso 4:** `npm test` + `tsc` verdes. Commit `feat(busqueda-guardada): servicio + Explorar + Mis busquedas`.
- [ ] **Paso 5:** verificación visual propia (8093, la migración NO está aplicada: verificar que la UI degrada sin romper — el guardar falla con mensaje, no crashea). Reportarlo.

---

# AGENTE C — F3 preguntas + F5 comuna + pulido adopción

Worktree: `C:\Users\pdani\em-agente-c` · rama `tanda6/c-adopcion` · migraciones `0032`, `0033`.

### Tarea C1: migración `0032_preguntas_adopcion.sql`

**Files:**
- Create: `supabase/migrations/0032_preguntas_adopcion.sql`

- [ ] **Paso 1: escribir** (base):

```sql
-- 0032 · Preguntas públicas en adopciones (como comentarios: 1 respuesta del dueño).
create table public.adoption_questions (
  id uuid primary key default gen_random_uuid(),
  adoption_id uuid not null references public.adoptions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  pregunta text not null check (length(btrim(pregunta)) between 1 and 500),
  respuesta text check (respuesta is null or length(btrim(respuesta)) between 1 and 1000),
  creado_en timestamptz not null default now(),
  respondido_en timestamptz
);
alter table public.adoption_questions enable row level security;

-- Visible si la adopción es visible PARA QUIEN CONSULTA (la RLS de adoptions
-- se aplica dentro del exists → preguntas de adopciones ocultas no se filtran).
create policy "preguntas visibles" on public.adoption_questions
  for select to anon, authenticated
  using (exists (select 1 from public.adoptions a where a.id = adoption_id));
create policy "preguntar" on public.adoption_questions
  for insert to authenticated
  with check (auth.uid() = user_id
              and exists (select 1 from public.adoptions a where a.id = adoption_id));
-- Responder: SOLO el dueño de la adopción, y SOLO las columnas de respuesta
-- (permiso a nivel de columna, patrón 0018).
create policy "responder" on public.adoption_questions
  for update to authenticated
  using (exists (select 1 from public.adoptions a
                 where a.id = adoption_id and a.user_id = auth.uid()));
revoke update on public.adoption_questions from authenticated;
grant update (respuesta, respondido_en) on public.adoption_questions to authenticated;
create policy "borrar pregunta" on public.adoption_questions
  for delete to authenticated
  using (auth.uid() = user_id or exists
         (select 1 from public.adoptions a where a.id = adoption_id and a.user_id = auth.uid()));

-- denuncias.tipo suma 'pregunta_adopcion' — drop ROBUSTO por pg_constraint
-- (copiar el patrón exacto de 0030, líneas ~269-297; el nombre del constraint
-- puede no ser 'denuncias_tipo_check').
```

- [ ] **Paso 2:** copiar del `0030` el bloque del drop robusto del CHECK de `denuncias` y recrearlo con la lista + `'pregunta_adopcion'`. Verificar la lista vigente en `0030:297`.
- [ ] **Paso 3:** commit `feat(preguntas-adopcion): migracion 0032`. NO aplicar.

### Tarea C2: migración `0033_adopcion_comuna.sql` + servicio

**Files:**
- Create: `supabase/migrations/0033_adopcion_comuna.sql`
- Modify: `src/services/busquedaAdopciones.ts` (pasar `p_comuna`)

- [ ] **Paso 1:** la migración: `drop function public.buscar_adopciones(text, text, double precision, double precision, double precision, text, timestamptz, uuid, double precision, int);` y recrearla **copiando el cuerpo ENTERO del 0030** (líneas 179-…), con dos únicos cambios: parámetro `p_comuna text default null` (después de `p_tamano`) y condición `and (p_comuna is null or a.comuna = p_comuna)` junto a los otros filtros. **No tocar ni una coma del cursor** (el `round(::numeric,6)` y el desempate).
- [ ] **Paso 2:** en `busquedaAdopciones.ts`, sumar `comuna?: string` a los filtros y pasarla como `p_comuna` (null si ausente). Test del servicio: con y sin comuna.
- [ ] **Paso 3:** `npm test` + `tsc`. Commit `feat(adopcion): filtro por comuna en buscar_adopciones (0033)`.

### Tarea C3: preguntas en el detalle + chip comuna en el feed

**Files:**
- Create: `src/services/adoptionQuestions.ts` + test
- Modify: `src/screens/AdopcionDetailScreen.tsx` (sección "Preguntas")
- Modify: `src/screens/AdopcionFeedScreen.tsx` (chip comuna con `ComunaPickerModal`)
- Modify: `src/screens/PublicarAdopcionScreen.tsx` (solo si NO guarda `comuna` hoy: sumar sugerencia por punto, patrón PublishScreen)

**Interfaces:**
- Produces: `listQuestions(adoptionId)`, `askQuestion(adoptionId, pregunta)` (con `moderarTexto` antes), `answerQuestion(id, respuesta)` (con `moderarTexto`; setea `respondido_en`), `deleteQuestion(id)` (`.select()`), `denunciarPregunta(id, usuarioDenunciado)` vía `services/moderation.ts` con `tipo='pregunta_adopcion'`.

- [ ] **Paso 1:** servicio con TDD (mock supabase; caso moderación rechaza; caso borrar 0 filas → error amigable).
- [ ] **Paso 2:** sección en el detalle: lista de preguntas (firma `getNombrePublico` + `respuesta` anidada con "Responde [dueño]"), input (auth; portero invitado), responder inline solo dueño, tachito autor/dueño, denunciar. Patrón visual: la sección de pistas de `PetDetailScreen`.
- [ ] **Paso 3:** chip "Comuna" en el feed (junto a especie/tamaño), reusa `ComunaPickerModal`; pasa `comuna` al hook/servicio. Verificar primero si `PublicarAdopcionScreen` guarda comuna (grep `comuna` ahí); si no, agregar la sugerencia.
- [ ] **Paso 4:** `npm test` + `tsc`. Commit `feat(adopcion): preguntas publicas + filtro comuna en el feed`.

### Tarea C4: pulido — editar adopción + encabezado del chat

**Files:**
- Create: `src/screens/EditAdoptionScreen.tsx`
- Modify: `src/services/adoptions.ts` (`updateAdoption`)
- Modify: `src/screens/AdopcionDetailScreen.tsx` (botón "Editar", solo dueño)
- Modify: `src/screens/ChatScreen.tsx` (encabezado de hilo de adopción → tocable)
- Modify: registro de navegación de `EditAdoption` (declarar en el resumen dónde)

**Interfaces:**
- Produces: `updateAdoption(id, campos)` — SOLO campos editables (nombre, descripcion, fotos, edad, tamano, esterilizado, vacunas, convive_*, requisitos, comuna); NUNCA `user_id`/`adoptada`/`oculta` por este camino. Pasa por `moderarTexto`.

- [ ] **Paso 1:** `updateAdoption` con TDD (rechaza texto ofensivo; el update usa `.select()` para detectar RLS-0-filas).
- [ ] **Paso 2:** `EditAdoptionScreen` con el patrón de `EditPetScreen` (leerla entera primero): pre-carga, guarda, vuelve al detalle refrescado.
- [ ] **Paso 3:** en `ChatScreen`, cuando el hilo es de adopción (`HiloCtx`), el encabezado navega al detalle: `navigation.navigate('App', { screen: 'Adopcion', params: ... })` o la ruta raíz `AdopcionDetail` según cómo esté registrado — copiar el patrón del encabezado de hilos de reporte.
- [ ] **Paso 4:** `npm test` + `tsc`. Commit `feat(adopcion): editar publicacion + encabezado de chat tocable`.
- [ ] **Paso 5:** verificación visual propia (8094): editar una adopción de prueba local si la base lo permite; si no, reportar QUÉ NO SE PROBÓ.

---

# AGENTE D — F4 guía + F6 carnet + data.ruta

Worktree: `C:\Users\pdani\em-agente-d` · rama `tanda6/d-guia-carnet` · migración `0034`.

### Tarea D1: `GuiaEncontradaScreen`

**Files:**
- Create: `src/screens/GuiaEncontradaScreen.tsx`
- Modify: `src/screens/HomeScreen.tsx` (tarjeta junto a la guía de perdida)
- Modify: `src/screens/PublishScreen.tsx` (ofrecer tras publicar una "encontrada" — ⚠️ solape declarado con agente A: bloque mínimo autocontenido)
- Modify: registro de navegación (donde esté `GuiaPerdida`)

- [ ] **Paso 1:** leer `GuiaPerdidaScreen.tsx` ENTERA (estructura, checklist con estado local que degrada, tono). Espejarla con estos pasos: 1) Asegurala sin arriesgarte (no la persigas a la calle), 2) Revisá si tiene chip — gratis en veterinarias (CTA a Ayuda rápida), 3) Sacale fotos claras, 4) Publicá el reporte como "Encontrada" (CTA a Publicar pre-seleccionado), 5) Avisá en la comuna (CTA a Explorar), 6) Cuidado temporal responsable, 7) Registro Nacional de Mascotas (link).
- [ ] **Paso 2:** TODOS los CTAs con navegación anidada absoluta (`navigate('App', { screen: 'Publicar', params: { estado: 'encontrada' } })` — verificar el nombre real del tab y del param en `GuiaPerdidaScreen`). Test NO tautológico: si hay test de navegación, validar contra los nombres registrados reales, no contra una whitelist local.
- [ ] **Paso 3:** entradas: tarjeta en `HomeScreen` junto a la de la guía perdida; oferta post-publicar "encontrada" en `PublishScreen` (simétrica a la de perdida).
- [ ] **Paso 4:** `npm test` + `tsc`. Commit `feat(guia): recien encontre una mascota`.

### Tarea D2: migración `0034` + libs `edadDesde` y `recordatorios`

**Files:**
- Create: `supabase/migrations/0034_mi_mascota_carnet.sql`
- Create: `src/lib/edadDesde.ts` + `src/lib/edadDesde.test.ts`
- Create: `src/lib/recordatorios.ts` + `src/lib/recordatorios.test.ts`

**Interfaces:**
- Produces: `edadDesde(fechaNacimiento: string, hoy: Date): string | null` ("2 años y 3 meses" / "8 meses" / "3 semanas"; futura → null). `estadoDosis(fecha: string | null | undefined, hoy: Date): 'al_dia' | 'vence_pronto' | 'vencida' | null` (≤14 días → vence_pronto). `resumenRecordatorios(nombre: string, carnet: Carnet, hoy: Date): string | null` ("A Luna le toca la vacuna" / "…el antiparasitario"; nada pendiente → null; varias cosas → la más urgente). `type Carnet = { vacunaProxima?: string | null; antiparasitarioInternoProximo?: string | null; antiparasitarioExternoProximo?: string | null }`.

- [ ] **Paso 1: migración:**

```sql
-- 0034 · Carnet de "Mi mascota": edad + próximas dosis (aviso solo in-app).
alter table public.my_pets
  add column if not exists fecha_nacimiento date,
  add column if not exists vacuna_proxima date,
  add column if not exists antiparasitario_interno_proximo date,
  add column if not exists antiparasitario_externo_proximo date;
-- Rango sano (la API es pública, patrón 0016). Fechas fijas y no current_date:
-- un CHECK con current_date se comporta distinto en restore y confunde.
alter table public.my_pets
  add constraint my_pets_nacimiento_rango check (fecha_nacimiento is null or
    fecha_nacimiento between date '1985-01-01' and date '2100-12-31'),
  add constraint my_pets_vacuna_rango check (vacuna_proxima is null or
    vacuna_proxima between date '2020-01-01' and date '2100-12-31'),
  add constraint my_pets_antiint_rango check (antiparasitario_interno_proximo is null or
    antiparasitario_interno_proximo between date '2020-01-01' and date '2100-12-31'),
  add constraint my_pets_antiext_rango check (antiparasitario_externo_proximo is null or
    antiparasitario_externo_proximo between date '2020-01-01' and date '2100-12-31');
```

- [ ] **Paso 2:** TDD de `edadDesde` (años+meses, solo meses, semanas, futura→null, hoy mismo→"recién nacida") y de `recordatorios` (vencida ayer, vence en 14, vence en 15→al_dia, todo null→resumen null, prioridad vencida>vence_pronto, texto vacuna vs antiparasitario). `hoy` SIEMPRE parámetro.
- [ ] **Paso 3:** `npm test` → verdes. Commit `feat(carnet): migracion 0034 + edadDesde + recordatorios`.

### Tarea D3: carnet en la UI + banner

**Files:**
- Modify: `src/screens/MyPetsScreen.tsx` (formulario + ficha + banner)
- Modify: `src/services/myPets.ts` (campos nuevos)
- Modify: `src/screens/HomeScreen.tsx` (banner si algo vence)

- [ ] **Paso 1:** `myPets.ts`: sumar los 4 campos a tipos/insert/update (⚠️ el `select` de columnas nuevas ANTES de la migración rompe la consulta entera — usar `select('*')` si ya lo usa, o degradar; verificar cómo selecciona hoy).
- [ ] **Paso 2:** formulario: 4 campos de fecha opcionales que funcionen en web (input date en web / DateTimePicker si ya hay uno en el repo — buscar cómo pide `fecha_nacimiento` el registro, `RegisterScreen`, y reusar ese patrón).
- [ ] **Paso 3:** ficha: edad ("🎂 2 años y 3 meses") + carnet con las 3 dosis y su estado en color (al día = texto normal, vence pronto = warning, vencida = danger — colores del tema).
- [ ] **Paso 4:** banner en `MyPetsScreen` y `HomeScreen` (solo con sesión y si algún estado ≠ al_dia; texto de `resumenRecordatorios`; tocar → Mis mascotas con navegación al patrón del repo). En Home degradar en silencio si `my_pets` falla.
- [ ] **Paso 5:** `npm test` + `tsc`. Commit `feat(carnet): formulario, ficha y banner de recordatorios`.

### Tarea D4: pulido — consumir `data.ruta` del push

**Files:**
- Create: `src/lib/rutaANavegacion.ts` + test
- Modify: `src/lib/pushSetup.ts` (listener; leerlo primero — el registro de push ya vive ahí)

**Interfaces:**
- Produces: `rutaANavegacion(ruta: unknown): { name: 'AdopcionDetail' | 'MascotaPublica'; params: { id: string } } | null` — `/adopcion/<uuid>` → AdopcionDetail; `/mascota/<uuid>` → MascotaPublica; cualquier otra cosa (null, vacía, ruta desconocida, id no-uuid) → null. Verificar los nombres REALES de las rutas raíz en el navigator antes de fijarlos.

- [ ] **Paso 1:** TDD de `rutaANavegacion` (los 4 casos de arriba + uuid válido).
- [ ] **Paso 2:** en `pushSetup.ts`: `Notifications.addNotificationResponseReceivedListener` → extraer `data.ruta` → `rutaANavegacion` → si hay destino, navegar (ver cómo accede el repo a la navegación fuera de componentes; si no existe `navigationRef`, crearlo con el patrón oficial de React Navigation y usarlo en `App.tsx`/RootNavigator). **Solo nativo** (`Platform.OS !== 'web'`); en web no-op.
- [ ] **Paso 3:** `npm test` + `tsc`. Commit `feat(push): tocar la notificacion navega a data.ruta`. Reportar: NO verificable end-to-end sin build nativo (anotado en el spec).

---

## Orquestador · Cierre (después de los 4 agentes)

- [ ] **Merge en orden C → B → D → A** sobre `feat/mvp-encuentra-mascota` (`--no-ff`), reconciliando: `PublishScreen` (A tarjeta + D guía encontrada), `HomeScreen` (D ×2), navegación raíz (C `EditAdoption` + D `GuiaEncontrada`/navigationRef), y cualquier choque en Perfil (B `MisBusquedas`).
- [ ] Test-espejo de `notifyTargets` verde tras el merge (si A/C/D no lo tocaron, debe seguir verde igual).
- [ ] `npm test` completo + `npx tsc --noEmit` en la rama fusionada.
- [ ] **Revisión final de rama adversarial** (agente revisor dedicado, diff completo de la tanda): navegación desde stack raíz, RLS de `adoption_questions` (intentar leer preguntas de adopción oculta, responder sin ser dueño, tocar `pregunta` vía update), el trigger de búsquedas (spam/duplicados), moderación en TODOS los caminos de escritura nuevos (incluido editar), y tests tautológicos.
- [ ] Aplicar migraciones **0031 → 0032 → 0033 → 0034** vía API admin (PAT que me pasa Pablo por archivo; User-Agent de navegador). Verificar contra la base: CHECK de la cola con 6 tipos, RLS de preguntas (ataques desde `anon`), firma nueva de `buscar_adopciones` (sin sobrecarga duplicada), columnas del carnet.
- [ ] Verificación visual Playwright (localhost:8091, servidor en background, esperar texto antes de capturar): las 9 piezas del spec.
- [ ] Actualizar `ESTADO.md` + memoria. Recordatorio a Pablo: migraciones aplicadas ANTES de subir la web; luego regenerar `dist` y drag-and-drop a Cloudflare.
- [ ] Borrar worktrees (`git worktree remove ...`) y ramas de agente.

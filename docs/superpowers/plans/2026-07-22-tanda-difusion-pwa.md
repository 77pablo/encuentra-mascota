# Tanda difusión + PWA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Links compartidos con vista previa y foto (worker OG), app instalable (PWA), y tarjetas compartibles de adopción y final feliz.

**Architecture:** 3 agentes en paralelo en worktrees (A `_worker.js` · B PWA · C tarjetas), archivos disjuntos, interfaz A↔B por nombres de archivo fijos. Sin migraciones. El orquestador fusiona C → B → A y verifica con wrangler local.

**Tech Stack:** Cloudflare Pages advanced mode (`_worker.js`), Web App Manifest + Service Worker, Expo RN web, jest.

**Spec:** `docs/superpowers/specs/2026-07-22-tanda-difusion-pwa-design.md` — leerlo ANTES de empezar.

## Global Constraints

- La app está EN PRODUCCIÓN: nada puede romper lo existente. Los tests actuales (700) siguen verdes.
- Colores de UI con `useColors()` + `crearEstilos` en `useMemo`; las TARJETAS van en paleta CLARA fija (`lightColors` de `src/theme`).
- Español chileno cálido. Tests donde haya lógica (TDD). `hoy`/`ahora` como parámetro en lógica testeable.
- `npx tsc --noEmit` limpio + `npm test` verde antes de CADA commit.
- Nombres de archivo FIJOS de la interfaz A↔B: `/manifest.webmanifest`, `/sw.js`, `/registrar-sw.js`, `/icons/icono-180.png` (más `icono-192.png`, `icono-512.png`, `icono-maskable-512.png`).
- Anon key y URL de Supabase: leerlas de `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) y COPIARLAS literales al worker (son públicas por diseño; el worker no tiene process.env).

---

# AGENTE A — `_worker.js` (OG + SPA + cabeceras + inyección PWA)

Worktree `C:\Users\pdani\em-agente-a` · rama `tanda7/a-worker`.

### Tarea A1: lógica pura testeable

**Files:**
- Create: `public/_worker.js`
- Create: `__tests__/worker/ogWorker.test.ts` (o `.js` si el transform de jest no toma el worker; decidir leyendo `jest.config`)

**Interfaces:**
- Produces (exportadas del worker además del default): `escaparHtml(s: string): string`;
  `armarMetaTags(datos: { titulo, descripcion, imagen, url }): string`;
  `tituloDeReporte(row): string` ("🔴 PERDIDA en Maipú — Perro «Luna»", reunido → "¡Volvió a casa! …");
  `tituloDeAdopcion(row): string` ("Luna busca hogar en Ñuñoa", adoptada → "¡Ya encontró familia! …");
  `inyectarEnHead(html: string, extra: string): string` (inserta antes de `</head>`; si no hay head, devuelve html intacto);
  `TAGS_PWA` (constante con manifest/theme-color/apple-touch-icon/script registrar-sw — nombres fijos del spec).

- [ ] **Paso 1 (TDD):** tests primero: escaparHtml (`&<>"'`, texto chileno con tildes intacto); armarMetaTags escapa una descripción `"><script>alert(1)</script>`; tituloDeReporte perdida/encontrada/sin comuna/reunida; tituloDeAdopcion normal/adoptada/sin comuna; inyectarEnHead con y sin `</head>`; descripción recortada a ~150 con "…".
- [ ] **Paso 2:** implementar las puras dentro de `public/_worker.js` (JS plano ESM, sin imports de node ni de la app — Cloudflare lo ejecuta tal cual).
- [ ] **Paso 3:** tests verdes. Commit `feat(worker): logica pura de OG (escapado + titulos + inyeccion)`.

### Tarea A2: el fetch handler

- [ ] **Paso 1:** `export default { async fetch(request, env) }` con este orden:

```js
const url = new URL(request.url);
// 1) assets: extensión de archivo o prefijos conocidos → tal cual
if (/\.[a-z0-9]+$/i.test(url.pathname) || url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
  return env.ASSETS.fetch(request);
}
// 2) SPA: index.html como base de TODA ruta sin extensión
const indexResp = await env.ASSETS.fetch(new Request(new URL('/', request.url)));
let html = await indexResp.text();
// 3) OG solo para /mascota/:uuid y /adopcion/:uuid — fallar ABIERTO
const m = url.pathname.match(/^\/(mascota|adopcion)\/([0-9a-f-]{36})$/);
let extra = TAGS_PWA;
if (m) {
  try {
    const datos = await datosPublicos(m[1], m[2]); // PostgREST + AbortSignal.timeout(2000)
    if (datos) extra += armarMetaTags(datos);
  } catch (e) { /* index pelado */ }
}
return new Response(inyectarEnHead(html, extra), { headers: CABECERAS_HTML });
```

- [ ] **Paso 2:** `CABECERAS_HTML` = content-type html + **las 5 cabeceras copiadas de `public/_headers`** (X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy geolocation=(self)... — copiar VERBATIM del archivo). `datosPublicos`: fetch a `<SUPABASE_URL>/rest/v1/pets?...` / `adoptions?...` con apikey (select del spec), 0 filas → null.
- [ ] **Paso 3:** tests del handler con un `env.ASSETS` falso (jest): ruta de asset pasa directo; ruta SPA devuelve html con TAGS_PWA; /mascota/uuid con fetch mockeado que cuelga → index pelado en <3s; /mascota/uuid con datos → tags presentes y escapados; cabeceras en toda respuesta HTML.
- [ ] **Paso 4:** verificación real: `npx expo export --platform web` en TU worktree y `npx wrangler pages dev dist` → los 6 checks del spec (usa `curl`; para el reporte real usá cualquier uuid de reporte activo de la base — pedilo por REST con la anon key). Documentar salidas.
- [ ] **Paso 5:** commit `feat(worker): OG + SPA + cabeceras en _worker.js`.

# AGENTE B — PWA (manifest, SW, íconos, UI de instalación)

Worktree `C:\Users\pdani\em-agente-b` · rama `tanda7/b-pwa`.

### Tarea B1: assets PWA

**Files:** Create `public/manifest.webmanifest`, `public/sw.js`, `public/registrar-sw.js`, `public/icons/icono-{180,192,512}.png` + `icono-maskable-512.png`.

- [ ] **Paso 1:** generar los íconos desde `assets/icon.png` con un script Pillow en el scratchpad (resize LANCZOS; el maskable con el logo al 80% centrado sobre fondo del color de fondo del ícono). Commitear los PNG.
- [ ] **Paso 2:** manifest: name "Encuentra tu Mascota", short_name "Encuentra", start_url "/", scope "/", display "standalone", lang "es-CL", `background_color`/`theme_color` = fondo y brand REALES de `src/theme` (lightColors), íconos 192/512 (`purpose: "any"`) + maskable-512 (`purpose: "maskable"`).
- [ ] **Paso 3:** `sw.js` conservador (spec): const VERSION; install → precache nada (los bundles son hasheados, se cachean al vuelo); fetch → si `url.origin !== location.origin` NO interceptar (return); si `/_expo/static/` o `/icons/` → cache-first; si `request.mode === 'navigate'` → network-first con fallback a caché de '/'; activate → borrar caches de versiones viejas. `registrar-sw.js`: registro con `if ('serviceWorker' in navigator)`.
- [ ] **Paso 4:** tests de la lógica de decisión del SW: extraerla a funciones puras dentro de `sw.js`... NO — sw.js debe ser standalone; en su lugar crear `src/lib/pwa/decisionCache.ts` con la función pura `estrategiaPara(url, modo, origen): 'red' | 'cache-first' | 'red-con-fallback' | 'ignorar'` + tests, y `sw.js` la REPLICA con un comentario espejo (es chica; anotar en el informe que existe la copia).
- [ ] **Paso 5:** commit `feat(pwa): manifest, service worker conservador e iconos`.

### Tarea B2: UI de instalación

**Files:** Create `src/lib/instalarPwa.ts` + test; Create `src/components/InstalarAppCard.tsx`; Modify `src/screens/HomeScreen.tsx` (tarjeta descartable), `src/screens/ProfileScreen.tsx` (entrada fija), `src/lib/` flag de descarte (patrón `onboarding.ts`).

- [ ] **Paso 1 (TDD):** `instalarPwa.ts`: `capturarPromptInstalacion()` (listener beforeinstallprompt, guarda el evento), `puedeInstalar()`, `pedirInstalacion()`, `esIos()` (userAgent), `estaInstalada()` (`matchMedia('(display-mode: standalone)')` + `navigator.standalone`). Todo gateado `Platform.OS === 'web'`; en nativo todo devuelve false/noop. Tests con mocks de window.
- [ ] **Paso 2:** `InstalarAppCard`: en Android/Chrome botón que llama `pedirInstalacion()`; en iOS modal con los 2 pasos (íconos de línea, sin capturas); se oculta si `estaInstalada()` o si fue descartada (flag persistido). Colores dinámicos.
- [ ] **Paso 3:** Inicio (descartable con ✕) + Perfil (fila "Instalar la app", no descartable, oculta si instalada). Verificación visual propia (puerto 8093): la tarjeta aparece en web, el ✕ la oculta y persiste tras reload.
- [ ] **Paso 4:** commit `feat(pwa): tarjeta e ingreso de instalacion`.

# AGENTE C — Tarjetas de adopción y final feliz

Worktree `C:\Users\pdani\em-agente-c` · rama `tanda7/c-tarjetas`.

### Tarea C1: generalización `DatosTarjeta` (sin romper reportes)

**Files:** Modify `src/components/TarjetaCompartir.tsx`, `src/components/TarjetaGenerador.tsx`, `src/lib/compartirTarjeta.ts`, `src/lib/tarjeta.ts` (+ tests existentes SIN cambios de expectativa).

**Interfaces:**
- Produces: `type DatosTarjeta = { banda: string; bandaColor: string; titulo: string; subtitulo: string | null; fotoUrl: string | null; qrUrl: string | null; nombreArchivo: string }`; `datosDeReporte(pet: Pet): DatosTarjeta` (envuelve `tarjetaTextos` + colores actuales `#C62828`/`#2E7D32` + `petUrl`); `TarjetaGenerador` pasa a `{ datos: DatosTarjeta; onFin: () => void }`.

- [ ] **Paso 1 (TDD):** tests de `datosDeReporte` (mapea 1:1 lo que hoy rinde la tarjeta: banda/título/subtítulo/QR/nombre de archivo). Refactor de componentes al shape genérico; PetDetailScreen/PublishScreen pasan `datosDeReporte(pet)`.
- [ ] **Paso 2:** suite entera verde (los tests viejos de tarjeta NO cambian de expectativas). Commit `refactor(tarjeta): DatosTarjeta generico`.

### Tarea C2: F3 adopción + F4 final feliz

**Files:** Modify `src/lib/tarjeta.ts` (+`datosDeAdopcion`, `datosDeFinalFeliz`, `diasEntre`), `src/lib/links.ts` (+`adopcionUrl` espejo de `petUrl`), `src/screens/AdopcionDetailScreen.tsx`, `src/screens/PublicarAdopcionScreen.tsx`, `src/screens/PetDetailScreen.tsx` (reencuentro), tests.

- [ ] **Paso 1 (TDD):** `datosDeAdopcion` (banda "BUSCA HOGAR" / "BUSCA HOGAR EN ÑUÑOA" mayúsculas es-CL, color `#17654B` = lightColors.brand, subtítulo "Perro · Cachorro · Mediano" con los campos presentes, QR `adopcionUrl(id)`); `datosDeFinalFeliz` (banda "¡VOLVIÓ A CASA!", color `#1E8A63` = lightColors.found, foto `final_foto ?? fotos[0]`, subtítulo "X días después" vía `diasEntre(creado_en, reunida_en)` — <1 día u orden inválido → null); `diasEntre` puro con tests (mismo día, 1, 45, fechas invertidas, inválidas).
- [ ] **Paso 2:** entradas: `AdopcionDetailScreen` botón "Compartir tarjeta" (CUALQUIERA, no solo dueño; patrón del detalle de reportes con `TarjetaGenerador`); `PublicarAdopcionScreen` oferta post-publicar (patrón PublishScreen: `confirmAction` + estado `tarjetaDatos`); `PetDetailScreen`: tras el flujo de reencuentro confirmado (post-confetti) ofrecer la tarjeta de final feliz, y botón visible en el detalle PROPIO cuando `reunida_en` no es null.
- [ ] **Paso 3:** suite + tsc verdes; verificación visual propia (8094): tarjeta de adopción descargada 1080×1080 con banda "BUSCA HOGAR…" (podés crear una adopción de prueba y BORRARLA al final — base de producción). Commit `feat(tarjeta): adopcion y final feliz`.

---

## Orquestador

- [ ] Tarea 0: worktrees `em-agente-a/b/c` (ramas `tanda7/*`), junctions de node_modules, copiar `.env`, puertos 8092/8093/8094. Despachar A, B, C en paralelo (briefs extraídos de este plan).
- [ ] Por agente al volver: review-package + revisor dedicado + fixes + re-review (flujo de siempre).
- [ ] Merge C → B → A (solape esperado: ninguno; PetDetailScreen solo C, HomeScreen solo B, public/ B y A en archivos distintos).
- [ ] Suite completa + tsc + revisión final de rama adversarial (focos: XSS en el worker con datos reales maliciosos, el SW no puede cachear Supabase ni romper el SPA offline→online, la generalización de la tarjeta no cambió la de reportes, entradas de tarjetas con navegación válida, el worker sirve TODOS los caminos que hoy sirve `_redirects`).
- [ ] Export + `wrangler pages dev dist` end-to-end + verificación visual Playwright (tarjeta instalación, tarjetas nuevas) + ESTADO/memoria + limpieza worktrees.
- [ ] Deploy: drag-and-drop de Pablo (SIN migraciones esta vez; el rollback del worker es borrar `dist/_worker.js` y re-subir).

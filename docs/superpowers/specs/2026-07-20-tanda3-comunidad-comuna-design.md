# Tanda 3 — Comunidad por comuna

Fecha: 2026-07-20 · Rama: `feat/mvp-encuentra-mascota`

## Objetivo

Darle sentido de **comunidad local** a la app: que la gente piense en **comunas**
("perdida en Maipú"), no en kilómetros. Cuatro piezas:
- **A** — comuna en cada reporte + feed "Perdidas en [comuna]".
- **B** — al publicar, sumar **comunas vecinas** para más alcance.
- **C** — **avisar** también a quien **sigue** esa comuna (además del aviso por zona GPS, que ya existe).
- **D** — el texto de compartir dice "Perdido en [comuna]".

## Estado previo (importante)

La sub-feature **C ya está a medias construida**: `notifyTargets.ts` (y su copia en la
Edge Function) ya avisa, en `reporte_nuevo`, a quienes tienen una **zona de alerta**
que cubre el punto (por distancia GPS). Esta tanda **NO reemplaza** eso: le **suma** un
segundo camino de targeting por **comuna seguida**.

## Decisiones tomadas (con el usuario)

- Comuna del reporte: **auto-sugerida desde el punto del mapa** (offline, sin API) + confirmar/cambiar.
- Cobertura: **todo Chile (346 comunas)**.
- Feed en **tres** lugares: pestaña nueva **Comunidad**, **selector en la Lista**, **sección en Inicio**.
- C: **aviso por comuna además del de zona** (no lo reemplaza).

## No-objetivos (YAGNI)

- Polígonos/point-in-polygon ni reverse-geocoding online (basta el centro de comuna más cercano; las coordenadas ya vienen difuminadas ~250 m por la Tanda A, y la comuna es un nivel grueso).
- Backfill de comuna en reportes viejos (siguen apareciendo por distancia; solo los nuevos llevan comuna).
- Grafo de adyacencia hecho a mano (las "vecinas" salen por cercanía de centros).

## 1. Dataset + helpers puros

`src/data/comunas.ts` — las 346 comunas: `{ nombre, region, lat, lng }` (centro).
De datos abiertos (se baja durante la implementación; ver Riesgos).

`src/lib/comunas.ts` (lógica pura, **TDD**):
```ts
export interface Comuna { nombre: string; region: string; lat: number; lng: number; }
export function comunaDeCoords(lat: number, lng: number): Comuna;        // la más cercana por centro
export function comunasCercanas(nombre: string, n?: number): Comuna[];   // n vecinas por cercanía de centros
export function buscarComunas(query: string): Comuna[];                   // para el selector buscable (normaliza tildes)
```
Distancias con `distanceKm` de `src/lib/geo.ts`. Casos de prueba: punto en el centro de una comuna conocida → esa comuna; vecinas de una comuna sin incluirse a sí misma y en orden de cercanía; búsqueda por texto sin tildes/caso.

## 2. Migración `0020_comunas.sql`

- `alter table public.pets add column comuna text;`
- `alter table public.pets add column comunas_alcance text[] not null default '{}';`
  - `comuna` = la "casa" del reporte (para mostrar y para el feed primario).
  - `comunas_alcance` = comunas vecinas que el autor sumó en B. El feed matchea
    `comuna = $1 or $1 = any(comunas_alcance)`.
- Índices: `create index pets_comuna_idx on public.pets (comuna);` y
  `create index pets_comunas_alcance_gin on public.pets using gin (comunas_alcance);`
- `alter table public.notification_prefs add column comunas_seguidas text[] not null default '{}';`
- **El evento lleva la comuna** (para C): actualizar `enqueue_reporte_nuevo` para
  agregar `'comuna', new.comuna` al `jsonb_build_object`.
- Columnas nuevas en `pets`: legibles con las políticas de select existentes (pets no
  tiene column-level security como profiles). Sin grants nuevos.

## 3. Publicar (A + B) — `PublishScreen`

Bajo el mapa (que ya fija `coords`):
- **Comuna sugerida:** `comunaDeCoords(coords)` → "Comuna: **[sugerida]** · Cambiar".
  Se recalcula si el usuario mueve el pin (a menos que ya la haya fijado a mano).
- **Selector buscable** (modal/lista con `buscarComunas`) para confirmar o cambiar.
- **Comunas vecinas (B):** chips con `comunasCercanas(comuna, 4)` para marcar y sumar alcance.
- `createPet` guarda `comuna` + `comunas_alcance`. La comuna se deriva del punto **real**
  (antes de difuminar), así que es exacta aunque la coordenada guardada esté movida.
- `schemas/pet.ts`: agregar `comuna` (requerida). Server: sin CHECK contra la lista (346
  valores); el cliente manda una comuna válida del dataset.

## 4. Feed por comuna (A)

Reusar la búsqueda del servidor ya existente, extendida con un filtro de comuna:
- **RPC `buscar_reportes`**: agregar parámetro opcional `p_comuna text default null`; cuando
  viene, filtra `(comuna = p_comuna or p_comuna = any(comunas_alcance))`. Preserva el
  orden y la **paginación por cursor** ya arreglada en `0015` (se agrega **solo** una
  condición al `WHERE`; NO se toca la lógica de cursor/orden).
  - ⚠️ Agregar un parámetro cambia la firma: hay que `drop function` de la **firma exacta
    vieja** y recrear (misma lección que `0017`/`0018`; si no, queda la función vieja en
    paralelo y PostgREST no sabe cuál llamar). El default `null` mantiene compatibles a los
    llamadores que no pasan comuna.
- `services/busqueda.ts` + `useBusquedaReportes`: pasar `comuna` opcional.
- **Tu comuna** como espectador: de `useMyLocation` → `comunaDeCoords`; cambiable con el selector.

Los tres lugares:
- **Pestaña "Comunidad"** (`ComunidadScreen`, nueva; registrada en `TabNavigator` como
  6.ª pestaña): encabezado "En [comuna] ▾" (selector), contador, lista con scroll infinito,
  y el **toggle de seguir** (C).
- **Lista** (`ListScreen`): un selector "En [comuna] ▾" arriba que aplica el filtro.
- **Inicio** (`HomeScreen`): sección "En tu comuna: N perdidas" con acceso a Comunidad.

## 5. Aviso por comuna (C)

- Migración `0020` ya agrega `notification_prefs.comunas_seguidas`.
- El evento `reporte_nuevo` ya lleva `comuna` (§2).
- **`notifyTargets.ts` (las DOS copias: `src/lib/` y `supabase/functions/send-notifications/`):**
  para `reporte_nuevo`, los candidatos pasan a ser **la unión** de:
  (a) zonas de alerta que cubren el punto (como hoy), y
  (b) usuarios cuyas `comunas_seguidas` contienen `evento.datos.comuna`.
  Se sigue deduplicando por `userId` y respetando el interruptor `zona` y los canales.
  - `Contexto` suma `seguidoresPorComuna` (o `prefs` con `comunasSeguidas`). Test nuevo del
    camino por comuna, y test de que el espejo entre las dos copias sigue idéntico (ya existe
    ese test de sincronía).
- **Edge Function:** cargar `comunas_seguidas` al armar el contexto y pasar la comuna del evento.
- **Seguir una comuna:** toggle "🔔 Avisarme de [comuna]" en la pestaña Comunidad →
  agrega/quita de `comunas_seguidas` (servicio nuevo `seguirComuna`/`dejarDeSeguir`).

## 6. Compartir con comuna (D)

`src/lib/share.ts` → `buildShareText`: si el reporte tiene `comuna`, anteponer el lugar
("🔴 PERDIDA en Maipú: …"). Sin comuna, queda como hoy. Test del texto con y sin comuna.

## Plan de pruebas

- **Puros (TDD):** `comunas.ts` (`comunaDeCoords`, `comunasCercanas`, `buscarComunas`),
  `notifyTargets` (camino por comuna + espejo), `share` (texto con/sin comuna).
- **RPC `buscar_reportes` con `p_comuna`:** verificar contra la base real que filtra por
  comuna y por `comunas_alcance`, sin romper la paginación.
- **Migración `0020`:** verificar columnas, índices, que el evento lleva la comuna, y que
  `comunas_seguidas` existe.
- **Pantallas:** verificación visual en el navegador (publicar con comuna + vecinas; los tres
  feeds; seguir una comuna).
- Mantener `tsc` limpio y toda la suite verde.

## Fases (dependencia + paralelización)

1. **Fundación** (secuencial, primero): dataset + `comunas.ts` (TDD) + migración `0020` +
   publicar con comuna (A parcial + B). Todo lo demás depende de esto.
2. **Feed (A):** `buscar_reportes` + servicios + pestaña Comunidad + selector en Lista + sección en Inicio.
3. **C:** `notifyTargets` ×2 + Edge Function + seguir comuna.
4. **D:** compartir.

Fases 2–4 son bastante independientes entre sí → candidatas a **agentes en paralelo** una
vez lista la Fundación.

## Riesgos

- **Dataset (el principal):** hay que conseguir las 346 comunas con centro. Se baja de datos
  abiertos durante la implementación. Si no se consiguen centros exactos de todas, el peor
  caso es que el **auto-sugerir** sea aproximado en algún borde — mitigado porque el usuario
  **confirma/cambia** a mano, y el selector buscable tiene la lista completa por nombre.
- **`notifyTargets` espejado:** cambiar la regla en las dos copias; el test de sincronía lo cubre.
- **Migración aplicada por el usuario** (no hay token en el repo); la app degrada sin romper si
  aún no está (columnas nulas → los feeds por comuna quedan vacíos, no revientan).

# Tanda de 4 funciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development para cada tarea. Steps usan checkbox (`- [ ]`). Cada función es un workstream independiente en su propio worktree; el merge y la revisión final los hace el orquestador (Claude principal), NO los agentes.

**Goal:** Sumar 4 funciones a Encuentra tu Mascota — aviso proactivo de coincidencias, ficha "Mi mascota" + collar QR, ciclo de vida del reporte, y guía "recién se me perdió" — construidas en paralelo.

**Architecture:** Cada agente trabaja en un worktree aislado (`node_modules` por junction, `.env` copiado, puerto propio) sobre una rama `feat/*` salida de `feat/mvp-encuentra-mascota`. TDD por tarea. El orquestador fusiona las 4 ramas resolviendo las colisiones conocidas y corre la revisión final.

**Tech Stack:** Expo (React Native + TS, corre en web), Supabase (Postgres + RLS + PostGIS + Edge Functions Deno), jest, zod.

## Global Constraints

- **Specs son la fuente de verdad del diseño.** Cada función tiene su spec en
  `docs/superpowers/specs/2026-07-21-*.md` con SQL, firmas y decisiones **verbatim**. Este
  plan da el orden de tareas; el detalle técnico está en el spec.
- **Nota de coordinación obligatoria:** `docs/superpowers/specs/2026-07-21-tanda-4funciones-coordinacion.md`
  (archivos compartidos, números de migración, orden de merge).
- **Migraciones asignadas (no reusar):** 0026 func.1 · 0027 func.2 · 0028 func.3.
- **`notifyTargets.ts` está ESPEJADO** en `src/lib/` y en `supabase/functions/send-notifications/`.
  Todo cambio va en las DOS copias; hay un test-espejo que falla si divergen.
- **`buscar_reportes` se recrea desde la versión de la 0015** (la del arreglo del cursor), no
  desde la 0014. `create or replace` solo si NO cambia el tipo de retorno.
- **Estilo:** copy cálido y humano, español chileno, nada de jerga de sistema. Seguir los
  componentes de `src/ui` y los patrones existentes.
- **Verificación por tarea:** `npx tsc --noEmit` limpio y `npm test` verde antes de cada commit.
- **Cada agente entrega un reporte final** de lo que hizo y **lo que NO probó** (lo más
  valioso para la revisión).

---

## Setup (lo hace el orquestador, una vez, antes de dispatch)

Por cada función, desde `C:\Users\pdani\encuentra-mascota`:
1. `git worktree add <wt-path> -b <rama> feat/mvp-encuentra-mascota`
2. Junction: `New-Item -ItemType Junction -Path <wt-path>\node_modules -Target C:\Users\pdani\encuentra-mascota\node_modules`
3. Copiar `.env` (y `.env.*` si hay) al worktree.
4. Asignar puerto: 8092 / 8093 / 8094 / 8095.

| Función | Rama | Worktree | Puerto |
|---|---|---|---|
| 1 coincidencias | `feat/coincidencias-proactivas` | `...-wt\coincidencias` | 8092 |
| 2 mi-mascota+QR | `feat/mi-mascota-collar` | `...-wt\mimascota` | 8093 |
| 3 ciclo de vida | `feat/ciclo-vida` | `...-wt\ciclovida` | 8094 |
| 4 guía | `feat/guia-perdida` | `...-wt\guia` | 8095 |

---

## Función 1 — Aviso proactivo de coincidencias
Spec: `2026-07-21-coincidencias-proactivas-design.md`

**Files:**
- Create: `supabase/migrations/0026_coincidencias.sql`
- Modify: `src/lib/notifyTargets.ts`, `src/lib/notifyTargets.test.ts`,
  `supabase/functions/send-notifications/notifyTargets.ts`,
  `src/screens/NotificationPrefsScreen.tsx`, `src/services/notificationPrefs.ts` (verificar toggle)

### Task 1.1: Targeting de `'coincidencia'` en la lógica pura (TDD)
- [ ] Escribir tests en `notifyTargets.test.ts` para `'coincidencia'`: destinatario = `ctx.duenoPetId`; excluye al `actorId`; respeta `coincidencias=false`; respeta canales email/push; `componerAviso` arma título según `match_estado` (con y sin nombre) y `ruta === /mascota/${datos.match_pet_id}`.
- [ ] Correr y verlos fallar.
- [ ] Implementar en `src/lib/notifyTargets.ts`: `TipoEvento += 'coincidencia'`; `datos += match_pet_id/match_estado/match_especie`; `quiereEsteTipo` → `p.coincidencias`; caso en `resolverDestinatarios` (igual que avistamiento/pista) y en `componerAviso`.
- [ ] **Copiar el mismo cambio** a `supabase/functions/send-notifications/notifyTargets.ts`.
- [ ] `npm test` verde (incluido el test-espejo) + `tsc` limpio. Commit.

### Task 1.2: Migración 0026 (trigger encolador)
- [ ] Escribir `0026_coincidencias.sql` siguiendo el spec: ampliar CHECK de `tipo` para incluir `'coincidencia'` (defensivo, `drop if exists` + `add`); función `enqueue_coincidencias` (security definer) con la lógica de matching (estado opuesto, especie compatible, `st_dwithin` 15 km, tope 25), brazo A (por cada match → evento con `pet_id=m.id`, `datos.match_pet_id=new.id`) y brazo B (un evento al publicador con el match más cercano); trigger `after insert on pets`.
- [ ] Validar el SQL localmente (revisión de sintaxis; no se aplica a prod acá). Commit.

### Task 1.3: Toggle de preferencia
- [ ] Verificar en `NotificationPrefsScreen.tsx` que el interruptor `coincidencias` esté visible y conectado a `notificationPrefs.ts`. Si falta, agregarlo (copy: "Coincidencias con tu mascota").
- [ ] `tsc` + test. Commit.

**Entregable:** cola encola `coincidencia`; la lógica pura resuelve destinatarios; preferencia visible. Reporte final incluye qué NO se pudo probar (el envío real necesita la migración aplicada).

---

## Función 2 — Ficha "Mi mascota" + collar QR
Spec: `2026-07-21-mi-mascota-collar-design.md`

**Files:**
- Create: `supabase/migrations/0027_mi_mascota.sql`, `src/services/myPets.ts`,
  `src/schemas/myPet.ts`, `src/screens/MyPetsScreen.tsx`, `src/screens/CollarScreen.tsx`,
  `src/lib/collarTag.ts`, `src/components/CollarTag.tsx`, tests correspondientes.
- Modify: `src/lib/notifyTargets.ts` (+ espejo + test) [COMPARTIDO],
  `supabase/functions/send-notifications/index.ts`,
  `src/screens/PublishScreen.tsx` (params de pre-carga) [COMPARTIDO], navegación/linking.

### Task 2.1: Migración 0027 (tabla + RPCs + cambios a la cola)
- [ ] Escribir `0027_mi_mascota.sql`: tabla `my_pets` (con `collar_token` default `encode(gen_random_bytes(16),'hex')`, RLS solo dueño, CHECK de longitudes); columna `pets.origen_my_pet uuid null references my_pets(id) on delete set null`; RPC `mascota_por_collar(token)` (devuelve nombre/especie/foto + `reporte_perdida_id`, nunca contacto); RPC `avisar_escaneo_collar(token,nota,lat,lng)` (encola con rate-limit 5 min); cambios a `notification_events`: `pet_id` nullable, `add target_user_id`, ampliar CHECK con `'escaneo_collar'`.
- [ ] Commit.

### Task 2.2: `'escaneo_collar'` en la lógica de avisos (TDD) [COMPARTIDO]
- [ ] Tests en `notifyTargets.test.ts`: `'escaneo_collar'` → destinatario = `evento.targetUserId`; canales; título "Alguien escaneó la placa de {nombre}"; nota escapada.
- [ ] Implementar en las DOS copias de `notifyTargets.ts` (`TipoEvento += 'escaneo_collar'`, `targetUserId`, casos en `resolverDestinatarios`/`componerAviso`).
- [ ] En `send-notifications/index.ts`: branch de `armarContexto` para `'escaneo_collar'` (destinatario de `target_user_id`, nombre de `datos.nombre_mascota`, antes del `select` a `pets`); sumar `target_user_id` a `EventoRow` y al `select` de la cola.
- [ ] `npm test` + `tsc`. Commit.

### Task 2.3: Servicio + schema de `my_pets` (TDD)
- [ ] `schemas/myPet.ts` (zod) + tests. `services/myPets.ts` (`listMyPets/createMyPet/updateMyPet/deleteMyPet`) + tests con mocks.
- [ ] Commit.

### Task 2.4: Pantalla "Mis mascotas" + reportar en un toque
- [ ] `MyPetsScreen.tsx` (lista + alta/edición con foto vía `pickImage`/`storage`); botón "Reportar como perdida" → `PublishScreen` con params (`estado`, `especie`, `raza`, `nombre`, descripción semilla, `origenMyPet`, foto).
- [ ] En `PublishScreen.tsx`: aceptar params opcionales de pre-carga y pasar `origen_my_pet` a `createPet` (agregar el campo en `createPet`/`pets.ts` insert).
- [ ] Registrar `MyPets` en navegación + entrada desde Perfil. `tsc` + test. Commit.

### Task 2.5: Etiqueta de collar (QR) + pantalla pública
- [ ] `collarTag.ts` (+ test: arma la URL `WEB_URL + /collar/<token>`) y `CollarTag.tsx` reusando `qr.ts`/`QrCode.tsx`; botón "Etiqueta de collar" en la ficha (descarga PNG web / share nativo).
- [ ] `CollarScreen.tsx` (ruta `/collar/:token`, modo invitado): llama `mascota_por_collar`; si perdida → link al reporte; si no → página sobria + "Avisar que la vi" → `avisar_escaneo_collar`. Registrar la ruta en linking.
- [ ] `tsc` + test. Commit.

**Entregable:** ficha CRUD, reportar pre-cargado, etiqueta QR, página pública de collar con aviso. Reporte final: qué NO se probó (RPC real, escaneo end-to-end sin base aplicada).

---

## Función 3 — Ciclo de vida del reporte
Spec: `2026-07-21-ciclo-vida-reporte-design.md`

**Files:**
- Create: `supabase/migrations/0028_ciclo_vida.sql`, `src/lib/cicloVida.ts` + `.test.ts`,
  `src/components/NudgeVigencia.tsx`.
- Modify: `src/services/pets.ts`, `src/services/busqueda.ts`, `src/screens/PetDetailScreen.tsx`,
  pantalla "Mis reportes".

### Task 3.1: Lógica pura del ciclo (TDD)
- [ ] `cicloVida.test.ts`: umbrales 14/30/45 (justo antes/después), reunido nunca nudgea, `vencido` bien calculado, renovación reinicia. Implementar `cicloVida.ts` (`diasDesdeRenovacion`, `debeNudgear`, `vencido`) con los umbrales en un solo lugar.
- [ ] `npm test` + `tsc`. Commit.

### Task 3.2: Migración 0028 (columna + `buscar_reportes` recreada)
- [ ] `0028_ciclo_vida.sql`: `alter table pets add column renovado_en timestamptz default now()` + backfill `= creado_en`; **recrear `buscar_reportes` copiando la 0015 completa** y agregando `and coalesce(p.renovado_en,p.creado_en) >= now() - interval '45 days'` + la columna `renovado_en` al retorno.
- [ ] Commit.

### Task 3.3: Servicio + mapeo
- [ ] `pets.ts`: `Pet.renovado_en`; `renovarReporte(id)` (`set renovado_en = now()`); `archivarReporte(id)` (`set renovado_en = now() - interval '46 days'`). `busqueda.ts`: `PetConDistancia` + mapeo suman `renovado_en`.
- [ ] `tsc` + test. Commit.

### Task 3.4: Nudge in-app
- [ ] `NudgeVigencia.tsx` (tarjeta con "Sí, volvió" → reencuentro / "Sigue perdida" → renovar / "Archivar" → archivar). Montarlo en `PetDetailScreen` (solo reporte propio, no reunido, `debeNudgear`) y realce de vencidos en "Mis reportes".
- [ ] `tsc` + test. Commit.

**Entregable:** vencidos salen de búsquedas, renovación los trae, nudge in-app funciona. Reporte final: qué NO se probó (exclusión real en `buscar_reportes` sin base aplicada).

---

## Función 4 — Guía "recién se me perdió"
Spec: `2026-07-21-guia-perdida-design.md`

**Files:**
- Create: `src/data/guiaPerdida.ts` + `.test.ts`, `src/screens/GuiaPerdidaScreen.tsx`.
- Modify: `src/screens/HomeScreen.tsx` [COMPARTIDO], `src/screens/PublishScreen.tsx` [COMPARTIDO], navegación.

### Task 4.1: Contenido como datos (TDD)
- [ ] `guiaPerdida.test.ts`: ids únicos, campos requeridos. Implementar `guiaPerdida.ts` con los ~7 pasos del spec (texto cálido, acciones opcionales que enlazan a pantallas ya existentes).
- [ ] `npm test` + `tsc`. Commit.

### Task 4.2: Pantalla de la guía
- [ ] `GuiaPerdidaScreen.tsx`: checklist con estado en AsyncStorage (degrada si falla), modo invitado, acciones por paso. Registrar `GuiaPerdida` en navegación.
- [ ] `tsc` + test. Commit.

### Task 4.3: Enganches
- [ ] Entrada en `HomeScreen` ("¿Se te perdió tu mascota? Guía paso a paso"). En `PublishScreen.onSubmit`, al publicar una `perdida`, ofrecer la guía (no en `encontrada`).
- [ ] `tsc` + test. Commit.

**Entregable:** guía accesible desde Inicio y ofrecida tras publicar perdida. Reporte final: qué NO se probó.

---

## Merge + revisión final (orquestador, NO los agentes)

Orden y reconciliación (ver nota de coordinación para el detalle):
1. Fusionar en una rama de integración desde `feat/mvp-encuentra-mascota`: func.4 → func.3 → func.1 → func.2 (las más independientes primero).
2. **Reconciliar `notifyTargets.ts` (2 copias):** unir los casos `'coincidencia'` y `'escaneo_collar'`. Correr el **test-espejo**.
3. **Reconciliar el CHECK de `notification_events.tipo`** al valor unión: `('reporte_nuevo','avistamiento','pista','coincidencia','escaneo_collar')`.
4. **Cruce func.1↔func.3:** agregar `and coalesce(m.renovado_en,m.creado_en) >= now() - interval '45 days'` al matching de `enqueue_coincidencias` y a `buscar_coincidencias` (que un reporte vencido no genere coincidencias).
5. Resolver colisiones additivas en `PublishScreen`, `HomeScreen`, `PetDetailScreen`, navegación/linking.
6. `npx tsc --noEmit` limpio + `npm test` verde.
7. **Revisión final de rama** (opus): buscar lo que se cae ENTRE tareas — CHECK unión, espejo sincronizado, RPC del collar sin filtrar contacto, `buscar_reportes` sin perder el arreglo del cursor de la 0015, RLS de `my_pets`, `pet_id` nullable sin romper triggers viejos.
8. Verificación visual con Playwright de los caminos nuevos (headless, contra dev server).
9. Actualizar `ESTADO.md` y memoria.

## Self-review del plan (hecho)
- **Cobertura del spec:** cada sección de los 4 specs tiene tarea. Los cruces (func.1↔2 en la cola/espejo, func.1↔3 en el matching, colisiones de pantallas) están en el paso de merge.
- **Sin placeholders:** las tareas apuntan al SQL/firmas verbatim del spec (DRY), no a "TODO".
- **Consistencia de tipos:** `renovado_en`, `target_user_id`, `origen_my_pet`, `collar_token`, `match_pet_id` usados igual en plan y specs.

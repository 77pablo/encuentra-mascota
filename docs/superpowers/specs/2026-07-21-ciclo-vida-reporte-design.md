# Ciclo de vida del reporte — diseño

**Fecha:** 2026-07-21
**Estado:** aprobado, listo para plan
**Parte de:** tanda de 4 funciones en paralelo (ver `2026-07-21-tanda-4funciones-coordinacion.md`)

## Problema

Lo que envenena estas apps son los reportes viejos que nadie actualizó: el mapa se llena de
casos que quizás ya se resolvieron, y deja de sentirse confiable. Hoy un reporte queda
`activo=true` para siempre salvo que el dueño lo cierre a mano.

## Decisión de producto (aprobada)

**Nudge + auto-archivar**, sin perder nada y **sin cron**:
- A los **14 y 30 días** le preguntamos amablemente al dueño *"¿[nombre] ya volvió a casa?"*
- **Auto-archivado a los 45 días** de la última renovación: el reporte deja de aparecer en
  búsquedas/mapa/listas públicas, pero **no se borra** y el dueño lo reactiva en un toque.

## Estado actual relevante

- `pets.activo`: `true` = abierto, `false` = **cerrado/reunido** (lo usan `closePet`,
  `countReunidas` cuenta `activo=false`, y "Finales felices"). **No se puede reusar
  `activo=false` para "archivado por inactividad"** o se contaminaría el conteo de
  reencuentros.
- `pets.oculto`: lo usa la **moderación**. Tampoco reusar.
- `buscar_reportes` (0014) filtra `activo=true and oculto=false`.

## Arquitectura

### Migración `0028_ciclo_vida.sql`

1. **Columna `renovado_en timestamptz`** en `pets`, `default now()`, y backfill
   `update pets set renovado_en = creado_en where renovado_en is null` para los reportes
   viejos. Representa "última vez que el dueño confirmó que sigue vigente" (o la creación).

2. **Auto-archivado perezoso** — modificar `buscar_reportes` para excluir los vencidos:
   agregar a la cláusula `where` la condición
   `and coalesce(p.renovado_en, p.creado_en) >= now() - interval '45 days'`.
   No hace falta cron: un reporte no renovado en 45 días simplemente deja de aparecer. Como
   la función se recrea con `create or replace`, **hay que copiar la firma y el cuerpo
   completos de la 0014/0015** y agregar solo esa línea (no cambia el tipo de retorno, así
   que `create or replace` alcanza; recordar que cambiar el tipo de retorno exige `drop`).
   ⚠️ **Coordinación:** ninguna otra función de la tanda toca `buscar_reportes`, así que
   esta migración es la única fuente de verdad de esa función tras la tanda. Partir de la
   versión de la 0015 (la que arregló el cursor), no de la 0014.

   Además, `buscar_reportes` **suma una columna al retorno** para que el cliente sepa cuándo
   nudgear: `renovado_en timestamptz`. (Ver impacto en el mapeo del cliente abajo.)

3. **RPC `renovar_reporte(p_pet_id uuid)`** — opcional; se puede hacer con un `update`
   directo desde el cliente porque la RLS ya permite `update` al dueño. Preferimos el
   `update` directo (menos superficie): `renovarReporte` en `services/pets.ts` hace
   `update pets set renovado_en = now() where id = ? (and user_id via RLS)`.

### Cliente

- **`services/pets.ts`:**
  - `Pet` suma `renovado_en?: string | null`.
  - `renovarReporte(id)`: `update ... set renovado_en = now()` (lo trae de vuelta y reinicia
    el reloj de 45 días).
  - `archivarReporte(id)`: **archivar es "dejar vencer ya"**. Setea
    `renovado_en = now() - interval '46 days'`, de modo que el reporte cae fuera del umbral
    de 45 días y sale de las búsquedas al instante, quedando en "Mis reportes" como
    reactivable. Se reusa la MISMA columna `renovado_en` en vez de agregar un estado nuevo:
    "archivado a propósito" y "vencido por inactividad" se tratan igual (ambos salen de
    búsquedas y se reactivan con un toque), así que no hace falta distinguirlos.
    Alternativa considerada y descartada por YAGNI: una columna `archivado_en` separada.
  - `listMyReports`: hoy filtra por `activo`. Debe seguir trayendo los reportes activos del
    usuario **incluidos los vencidos/archivados** (para que el dueño los vea y reactive), y
    marcar cuáles están vencidos. Como `listMyReports` no pasa por `buscar_reportes`
    (consulta directa a `pets` por `user_id`), los vencidos ya aparecen; se agrega el flag
    derivado en el cliente (`vencido = coalesce(renovado_en, creado_en) < ahora - 45d`).

- **Lógica pura `src/lib/cicloVida.ts`** (con tests): dadas `creado_en`/`renovado_en` y
  "ahora", devuelve el estado del ciclo: `diasDesdeRenovacion`, `debeNudgear` (cruzó 14 o 30
  días y sigue vigente), `vencido` (≥45 días). Un solo lugar con los umbrales.

- **Nudge in-app** (`components/NudgeVigencia.tsx`): tarjeta amable que aparece:
  - En el **detalle del propio reporte** (`PetDetailScreen`, solo si `pet.user_id === yo` y
    el reporte no está reunido y `debeNudgear`). ⚠️ **Colisión con nada más en PetDetail**
    dentro de la tanda, pero es un archivo históricamente conflictivo (ver coordinación).
  - En **"Mis reportes"** (lista): un realce en las tarjetas vencidas con acción rápida.
  - Acciones: **"Sí, volvió"** → flujo de reencuentro existente (`markReunited`/`closePet`
    según cómo esté hoy) / **"Sigue perdida"** → `renovarReporte` / **"Archivar"** →
    `archivarReporte`.
  - **No usa push ni la cola de avisos** (decisión: mantener in-app para no acoplar más la
    cola; el push-nudge queda como mejora futura).

- **Copy calmado**, en el tono de la app: *"Pasaron 15 días. ¿[nombre] ya volvió a casa?"*
  Nada de lenguaje de sistema ni alarmante.

## Casos borde / decisiones

- **Reportes reunidos:** nunca se nudgean ni se archivan por vencimiento (ya están cerrados
  con `activo=false`).
- **Un reporte archivado que el dueño reactiva** vuelve a búsquedas al instante (renovado_en
  = now) y reinicia el reloj de 45 días.
- **El `>= now() - interval '45 days'` en `buscar_reportes`** también afecta a
  `buscar_coincidencias`? No: son funciones distintas. Un reporte vencido **no debería**
  generar coincidencias tampoco. → Sumar la misma condición a `buscar_coincidencias`
  (excluir el `m` vencido) **y** al trigger `enqueue_coincidencias` de la func. 1.
  ⚠️ **Esto cruza con la función 1** — anotarlo en coordinación: la condición de vencimiento
  debe aplicarse también en el matching. Se reconcilia en el merge (la func. 3 aporta la
  columna `renovado_en`; el matching de la func. 1 la consume). Si al momento del merge la
  func. 1 ya está, se agrega la línea; si no, queda de follow-up inmediato.
- **Zona horaria:** todo en `timestamptz`, comparado contra `now()` del servidor. El cliente
  solo deriva el flag para el nudge; la verdad de la visibilidad la tiene Postgres.

## Testing

- `cicloVida.test.ts`: umbrales 14/30/45 (justo antes/después), reunido nunca nudgea,
  vencido calculado bien, renovación reinicia.
- Manual post-deploy: crear un reporte con `renovado_en` viejo (vía API admin) y confirmar
  que **no** aparece en `buscar_reportes`; renovar y confirmar que vuelve.

## Archivos

- `supabase/migrations/0028_ciclo_vida.sql` (nuevo; recrea `buscar_reportes` desde la 0015)
- `src/lib/cicloVida.ts` + `.test.ts` (nuevos)
- `src/services/pets.ts` (editar: `Pet.renovado_en`, `renovarReporte`, `archivarReporte`)
- `src/services/busqueda.ts` (editar: `PetConDistancia`/mapeo suma `renovado_en`)
- `src/components/NudgeVigencia.tsx` (nuevo)
- `src/screens/PetDetailScreen.tsx` (nudge en reporte propio — archivo conflictivo)
- Pantalla "Mis reportes" (realce de vencidos)

## Fuera de alcance (YAGNI)

- Push/email de recordatorio (in-app por ahora). Columna `archivado_en` separada.
  Configurar los umbrales por usuario. Estadísticas de cuántos se archivaron.

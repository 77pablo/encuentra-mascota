# Aviso proactivo de coincidencias — diseño

**Fecha:** 2026-07-21
**Estado:** aprobado, listo para plan
**Parte de:** tanda de 4 funciones en paralelo (ver `2026-07-21-tanda-4funciones-coordinacion.md`)

## Problema

Las coincidencias perdido↔encontrado ya se calculan (`buscar_coincidencias`, migración
0014) pero son **pasivas**: solo las ve quien abre el detalle de un reporte. La promesa
central de la app —"te avisamos apenas aparece algo que podría ser tu mascota"— hoy no se
cumple. Toda la infraestructura para avisar (cola `notification_events` escrita por
triggers, `notifyTargets.ts` + su espejo, Edge Function `send-notifications`, `pg_cron`)
ya está desplegada y probada; falta el evento y el targeting.

Además, la preferencia por usuario **ya existe**: `notification_prefs.coincidencias`
(boolean, default true) se creó en la migración 0011 pero nunca se usó.

## Decisión de producto

**Avisar a ambos lados**, resuelto con una sola regla simétrica:

> Al publicarse un reporte **N**, se avisa al **dueño de cada reporte existente que calza**
> con N (estado opuesto, especie compatible, dentro del radio, activo, no oculto, no
> reunido). Y al **dueño de N** se le avisa de las coincidencias que ya existían.

Por qué esto cubre "ambos lados": si publicás un *perdido*, los dueños de *encontrados*
que calzan reciben aviso; y cuando más tarde alguien publica un *encontrado* que calza con
tu perdido, vos recibís el aviso. El caso del que recién publica lo cubre el segundo brazo
(aviso al dueño de N).

## Arquitectura

### Migración `0026_coincidencias.sql`

1. **Ampliar el CHECK de `notification_events.tipo`** para aceptar `'coincidencia'`.
   Se escribe defensivo (drop + add con la lista completa) porque otra migración de esta
   misma tanda (`0027`, función 2) también toca este CHECK; la reconciliación al valor
   unión (`'reporte_nuevo','avistamiento','pista','coincidencia','escaneo_collar'`) la hace
   el merge (ver nota de coordinación). Esta migración deja como mínimo
   `... 'coincidencia'` incluido.

2. **Trigger encolador `enqueue_coincidencias`** (`after insert on public.pets`,
   `security definer set search_path = public`). Para el nuevo reporte `new`:
   - Recorre los reportes existentes `m` con la MISMA lógica que `buscar_coincidencias`:
     `m.id <> new.id`, `m.activo`, `not m.oculto`, `m.reunida_en is null`,
     `m.estado <> new.estado`, especie compatible (`m.especie = new.especie or
     m.especie = 'otro' or new.especie = 'otro'`), y `st_dwithin(m.ubicacion,
     new.ubicacion, radio*1000)` con radio 15 km. Tope de 25 filas por lado (defensa
     contra un punto con densidad anómala; `buscar_coincidencias` en la app usa 10).
   - **Brazo A (avisar a los dueños de los reportes existentes):** por cada `m`, inserta
     un evento `tipo='coincidencia'`, `pet_id = m.id` (el reporte de referencia, cuyo
     dueño recibe), `actor_id = new.user_id`, `datos = { match_pet_id: new.id,
     match_estado: new.estado, match_especie: new.especie }`.
   - **Brazo B (avisar al que recién publicó):** un evento `tipo='coincidencia'`,
     `pet_id = new.id`, `actor_id = null` (el aviso no es "de nadie", es del sistema),
     `datos = { match_pet_id: <id del m más cercano> }`, **solo si hubo al menos un `m`**.
     Se emite uno solo (el más cercano) para no spamear al que acaba de publicar; en el
     detalle ya ve la lista completa. Si preferimos cero ruido para el publicador, este
     brazo puede quedar detrás de un `if`, pero por defecto va (decisión "ambos lados").
   - Nota `ubicacion`: es la columna generada `geography(Point,4326)` de la 0014; en un
     `after insert` ya está disponible en `new`.

   Es un trigger separado del `enqueue_reporte_nuevo` (0011) a propósito: distinta
   responsabilidad, no queremos que un cambio en el aviso de zona toque el de coincidencia.

### `notifyTargets.ts` (y su espejo `supabase/functions/send-notifications/notifyTargets.ts`)

⚠️ **Los dos archivos deben cambiar igual.** Hay un test-espejo que falla si divergen.

- `TipoEvento` suma `'coincidencia'`.
- `EventoAviso['datos']` suma `match_pet_id?: string; match_estado?: string;
  match_especie?: string`.
- `resolverDestinatarios`: `'coincidencia'` se resuelve **igual que `avistamiento`/`pista`**
  → destinatario único = `ctx.duenoPetId` (el dueño del `pet_id` del evento), excluyendo al
  actor, filtrado por la preferencia de tipo y por canales.
- `quiereEsteTipo`: `'coincidencia'` mira `p.coincidencias`.
- `componerAviso`: caso `'coincidencia'`. Título p. ej.
  *"Apareció un encontrado que podría ser {nombre|tu mascota}"* según `match_estado`
  (si el match es 'encontrada', el reporte de referencia es un perdido → "apareció un
  encontrado"; y viceversa). Cuerpo: *"Alguien reportó una mascota que podría ser la tuya,
  cerca. Entrá a verla."* **`ruta = /mascota/${datos.match_pet_id}`** (se abre el reporte
  del OTRO, que es lo que la persona quiere ver), no el propio.

### Edge Function `send-notifications/index.ts`

- `armarContexto`: para `'coincidencia'`, los candidatos son `[duenoPetId]` (igual que
  avistamiento/pista); ese branch ya existe (`ev.tipo === 'reporte_nuevo' ? ... : [duenoPetId]`),
  así que **no hay que tocar `armarContexto`** salvo confirmar que `'coincidencia'` cae en
  el `else`. `componerAviso` toma la especie/estado del `datos` del evento; no hace falta
  consultar el reporte match (mostramos texto genérico + link).

### Pantalla de Avisos (`NotificationPrefsScreen` / `services/notificationPrefs.ts`)

El interruptor `coincidencias` **probablemente ya se muestra** (la columna existe desde
0011 y la memoria menciona "4 interruptores de tipo"). El agente **verifica** que el toggle
esté visible y conectado; si no, lo agrega con un copy tipo *"Coincidencias con tu mascota"*.

## Casos borde / decisiones

- **Sin coordenadas:** `st_dwithin` no aplica si el punto es null; en `pets` `lat`/`lng` son
  `not null`, así que siempre hay punto. No hay rama vacía que manejar en el trigger.
- **Bloqueos (Tanda B):** en v1 **no** se filtra por bloqueo. Los dos reportes son públicos
  y el aviso no revela identidad (link a un reporte que ya es público). Anotado como posible
  mejora futura (`hay_bloqueo_con`).
- **Reportes reunidos o borrados entre encolar y despachar:** `armarContexto` ya hace
  `maybeSingle` sobre `pets` y devuelve `null` si el reporte de referencia no está → el
  evento se marca sin avisar. El `match_pet_id` roto solo produce un link a un reporte que
  `getPet` maneja con `PET_NO_DISPONIBLE`. Nada revienta.
- **Volumen:** tope de 25 matches por lado por publicación; con la densidad real (pocos
  dentro de 15 km) es holgado. El dispatcher procesa de a 50 por corrida cada 5 min.
- **Idempotencia:** si un reporte se publica dos veces (no debería), se generarían eventos
  duplicados; aceptable para v1, no se deduplica en la cola.

## Testing

- `notifyTargets.test.ts`: casos de `'coincidencia'` (destinatario = dueño; excluye actor;
  respeta `coincidencias=false`; respeta canales; ruta apunta al match).
- Test-espejo existente: correr los mismos casos contra la copia de la Edge Function.
- `componerAviso`: título correcto según `match_estado`, con y sin nombre.
- Verificación manual contra la base (post-deploy): publicar dos reportes opuestos que
  calcen y confirmar que se encolan eventos `coincidencia` con `estado='pendiente'` y el
  `datos.match_pet_id` correcto; que un anónimo no puede leer la cola (RLS).

## Archivos

- `supabase/migrations/0026_coincidencias.sql` (nuevo)
- `src/lib/notifyTargets.ts` (editar) + `src/lib/notifyTargets.test.ts` (editar)
- `supabase/functions/send-notifications/notifyTargets.ts` (editar, espejo)
- `src/screens/NotificationPrefsScreen.tsx` + `src/services/notificationPrefs.ts`
  (verificar/ajustar el toggle `coincidencias`)

## Fuera de alcance (YAGNI)

- Filtrado por bloqueo. Agrupar varios matches en un solo aviso. Deep-link nativo (el push
  ya lleva `data.ruta`). Reintentos/dedupe sofisticados en la cola.

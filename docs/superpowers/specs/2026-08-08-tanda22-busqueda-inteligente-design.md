# Tanda 22 — Búsqueda inteligente por especie (diseño)

**Fecha**: 2026-08-08 · **Estado**: APROBADO por Pablo (8-ago, chat). **REVISADO
contra el código antes de planificar**: dos de las tres piezas propuestas YA EXISTÍAN
(lección de esta misma sesión: verificar el fuente antes de proponer). El alcance
real quedó en los tres huecos de abajo.

**Origen**: investigación de necesidades (8-ago). Evidencia dura: los gatos se
encuentran 13× más buscando activamente que esperando en refugios y el 75% aparece a
<500 m; los perros con chip vuelven al doble y los gatos con chip 24× más (los números
ya viven en `src/data/registrosChip.ts` y `src/lib/planBusqueda.ts`).

## Lo que YA existe (verificado en el fuente, NO se construye)

- **Guía felina**: `src/lib/planBusqueda.ts` ya diferencia por especie Y ámbito
  (interior/exterior): esconderse a <100 m, salir de noche con linterna y en
  silencio, puerta a puerta pidiendo permiso, re-revisar escondites, arenero y
  comida con olor + cámara, "el hambre lo mueve" del día 5. Con reloj por ventanas.
- **Chip del lado del VECINO**: `GuiaEncontrada` tiene el paso "cualquier
  veterinaria lo lee gratis" + pantalla `Microchip` dedicada con los registros
  chilenos verificados a mano (vivos y muertos) + link a la consulta del Registro
  Nacional. `AyudaScreen` también enlaza.
- **Rótulo del tablero**: `TableroDifusion` ya etiqueta la categoría `refugio` como
  "Refugio" (la 0063 ya la contempla en su CHECK).

## Qué se construye (los huecos reales)

### Pieza 1 — Refugios y caniles municipales, curados a mano

La semilla tiene 301 veterinarias y **0 refugios** (OSM no mapea `animal_shelter`
útil en Chile). "Llamá al canil municipal" es el paso 1 de toda guía chilena.

- **Dataset curado**: `data/refugios-curados.json` con nombre, comuna, región,
  dirección, lat/lng y **fuente verificable** (URL municipal u oficial de la
  organización). Regla dura: sin fuente, no entra. La recolección se hace con
  búsqueda web durante la implementación; alcance inicial **Araucanía (Temuco y
  alrededores) + Región Metropolitana**; el formato queda listo para sumar regiones.
- **Semilla**: `scripts/semilla-refugios.js`, hermano de `semilla-lugares.js`: lee el
  JSON local (sin Overpass), upsertea a `lugares` con `categoria='refugio'` y la
  unique existente (`osm_tipo='curado'`, `osm_id` = slug estable), idempotente.
- **Efecto**: aparecen solos en el tablero de difusión y en `lugares_cerca`, sin
  tocar UI.
- **Límite dicho de frente**: la tabla `lugares` NO tiene columna de teléfono (diseño
  de la 0063; la semilla de vets tampoco lo carga). El tablero muestra nombre,
  dirección y el botón a Maps. Agregar teléfono sería una migración: NO en esta
  tanda; la fuente queda en el JSON del repo para auditoría.

### Pieza 2 — El registro del lado del DUEÑO

El vecino que encuentra ya tiene todo; el dueño que declara chip, nada. Un chip con
registro desatendido anula su ventaja (el registro da el contacto, no el chip).

- En **Publicar** y **Editar reporte**, bajo el campo del chip y SOLO cuando tiene
  contenido: recordatorio de una línea «¿Los datos del chip están al día en el
  Registro? Un chip con datos viejos no llama a nadie.» con acción a la pantalla
  `Microchip` existente (ruta ya montada en el stack raíz).
- Texto en lib pura testeable; tono del repo (voseo, sin alarmar); NUNCA se muestra
  ni valida el número contra nada (el oráculo sigue cerrado; esto es contenido).

### Pieza 3 — La trampera que falta en el plan felino

Único hueco real del contenido felino: el préstamo de tramperas. Paso nuevo en
`PASOS_PLAN` (ventana `dia5`, `especies: ['gato']`): trampera de captura como
recurso cuando el gato se ve pero no se deja agarrar — los refugios y agrupaciones
las prestan (y con la Pieza 1, el tablero ya le muestra refugios cerca). Id nuevo
estable, sin tocar ids existentes (hay tests que los referencian).

## Qué NO entra (YAGNI)

- Teléfono en `lugares` (migración) — anotado como deuda consciente.
- Integración con la API del Registro Nacional (no existe consulta por URL, ya
  investigado en `registrosChip.ts`).
- UI nueva de refugios (solo entran al tablero existente).
- Cambios de esquema o RPC: **cero migraciones en esta tanda**.

## Verificación

- Tests: validador del dataset (fuente https obligatoria, coordenadas dentro de
  Chile, comuna/región no vacías), semilla (formato del upsert, idempotencia
  simulada), texto del nudge (tono + condición "solo con chip escrito"), paso
  trampera (aparece para gato en dia5, no para perro, ids intactos).
- Suite entera verde (tsc 0, jest exit 0).
- E2E contra el dist: campo de chip con texto → aparece el recordatorio → navega a
  Microchip; sin texto → no aparece.
- Despliegue: semilla contra producción (dos corridas, 0 duplicados, spot-check de
  un refugio por región), verificación del tablero con un punto cerca de un refugio
  sembrado.

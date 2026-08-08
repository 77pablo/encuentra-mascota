# Tanda 22 — Búsqueda inteligente por especie (diseño)

**Fecha**: 2026-08-08 · **Estado**: APROBADO por Pablo (8-ago, chat) — las 3 piezas.
**Origen**: investigación de necesidades (8-ago). Evidencia dura: los gatos se encuentran
13× más buscando activamente que esperando en refugios y el 75% aparece a <500 m del punto
de fuga; los perros con chip vuelven al doble y los gatos con chip 24× más. En Chile el
chip es obligatorio (Ley Cholito 21.020) y existe el Registro Nacional de Mascotas, pero
nadie le dice al vecino que el escaneo es gratis en cualquier veterinaria.

## Qué se construye

### Pieza 1 — Guía felina (la búsqueda de un gato NO es la de un perro)

Hoy `GuiaPerdida` trata a las especies parecido. Cambia a contenido condicional por
`especie` del reporte:

- **Gato perdido**: guía específica — buscar de NOCHE y en silencio con linterna (los ojos
  reflejan), radio corto (~200 m, revisar escondites: bajo autos, entretechos, patios
  vecinos), no perseguirlo ni gritarle (se esconde más), dejar su arenero/manta con olor
  afuera, pedirle a los vecinos revisar bodegas y quinchos, trampera de captura como
  último recurso (prestada por refugios). El dato que ordena todo: la mayoría está
  escondido CERCA, callado — no "se fue", está atrapado o asustado.
- **Perro perdido**: se mantiene la guía actual y se agrega el énfasis inverso — los
  perros SÍ se alejan kilómetros, por eso pesan la difusión (t15), los carteles en
  semáforos (t18) y el tablero de veterinarias.
- **Otro**: queda el contenido genérico actual.

Reglas: contenido puro en `src/lib/` (testeable sin red), tono del repo (voseo, sin
promesas, sin "seguro lo encontrás"), guardas de tono en tests como `porQueCoincide`.
Sin migración: la especie ya viaja en el reporte.

### Pieza 2 — El chip que nadie escanea

- **Guía del que ENCONTRÓ una mascota** (`GuiaEncontrada` o equivalente): paso nuevo y
  temprano — «Llevala a cualquier veterinaria: leerle el chip es gratis y toma un minuto.
  Si tiene chip y los datos están al día, el reencuentro es inmediato.» + link al
  Registro Nacional de Mascotas (registratumascota.cl).
- **Lado del DUEÑO**: al publicar una perdida (si declaró chip) y en Mi Mascota,
  recordatorio «Verificá que tus datos estén al día en el Registro Nacional» con el
  mismo link. Un dueño con registro desactualizado anula la ventaja del chip.

Reglas: links con `Linking.openURL` como los grupos de difusión; texto en lib pura con
tests; NUNCA pedir ni mostrar el número de chip (el oráculo sigue cerrado, esto es solo
contenido). Sin migración.

### Pieza 3 — Refugios y caniles municipales en el tablero

La semilla de lugares tiene 301 veterinarias y **0 refugios** (OSM no mapea
`animal_shelter` en Chile de forma útil). El "llamá al canil municipal" es el paso 1 de
toda guía chilena y no lo cubrimos.

- **Dataset curado a mano** en el repo: `data/refugios-curados.json` (o equivalente) con
  nombre, comuna, teléfono/contacto, y **fuente verificable** (URL municipal o de la
  organización). Regla dura: sin fuente, no entra. La recolección se hace con búsqueda
  web durante la implementación; alcance inicial **Araucanía (Temuco y alrededores) +
  Región Metropolitana**; el formato queda listo para sumar regiones por PR de datos.
- **Semilla**: script hermano de `scripts/semilla-lugares.js` que upsertea a la tabla
  `lugares` existente con la categoría de refugio (la 0063 ya la contempla), idempotente
  (misma unique), respetando el patrón del script actual (User-Agent no aplica: acá no
  hay Overpass, se lee el JSON local).
- **Efecto**: aparecen solos en el tablero de difusión (que ya sugiere lugares cercanos
  por categoría) sin tocar UI. Si el tablero hoy etiqueta solo "veterinaria", ajustar el
  rótulo por categoría.

Sin migración de esquema (la tabla y la categoría existen). La corrida de la semilla
contra producción sigue el protocolo de despliegue de siempre.

## Qué NO entra (YAGNI)

- Nada de UI nueva de "refugios" (solo entran al tablero existente).
- Ninguna integración con la API del Registro Nacional (solo link).
- Sin cambios de esquema ni RPC.
- La guía felina no agrega push ni recordatorios; es contenido.

## Verificación

- Tests de lib para el contenido condicional por especie y las guardas de tono.
- Tests unitarios del script de semilla (formato, fuente obligatoria, idempotencia
  simulada), como los del script de Overpass.
- E2E contra el dist: reporte de gato → guía felina; reporte de perro → guía canina;
  guía de encontrada muestra el paso del chip con link.
- Despliegue: semilla contra producción (dos corridas, 0 duplicados), verificación del
  tablero con un refugio real cerca de un punto de prueba.

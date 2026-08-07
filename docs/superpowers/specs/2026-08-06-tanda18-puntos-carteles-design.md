# Tanda 18 — "¿Dónde pego los carteles?" (puntos de alto tráfico)

**Fecha:** 6-ago-2026 · **Aprobación:** Pablo eligió "intersecciones para carteles" entre los ítems
del roadmap, sabiendo el trade-off de la dependencia en vivo con OpenStreetMap. **Sin costo:**
Overpass API es gratis; código sobre el stack existente.

## Por qué
`docs/competencia-y-oportunidades.md`: la búsqueda física del barrio resuelve el **30-49%** de los
casos y es donde la app es más floja. Los carteles grandes en esquinas de tráfico funcionan (14 de
43 familias entrenadas recuperaron su perro así). Hoy la guía dice "pegá en las esquinas de más
tráfico" pero no dice CUÁLES. Esto las sugiere.

## Proxy: semáforos (traffic_signals de OSM)
Un semáforo está, por definición, en una esquina de tráfico donde los autos PARAN y alcanzan a leer
un cartel. La guía ya nombra "semáforos, paraderos". Query Overpass trivial que devuelve nodos con
coordenadas directas — no hay que calcular intersecciones de calles (caro y frágil). Se muestran los
~6 más cercanos al punto del reporte.

## Verificado el 6-ago (lo más riesgoso, antes de diseñar)
- **CORS OK desde el navegador**: `overpass-api.de` responde `Access-Control-Allow-Origin: *`.
- La query `node(around:R,lat,lng)["highway"="traffic_signals"];out;` devuelve semáforos cerca de
  Santiago.
- **Overpass es LENTO e INESTABLE** (vi un 504 en una de dos corridas). Por eso: bajo demanda (nunca
  en la carga de la ficha), con timeout, y degradando al consejo genérico si falla. Nunca bloquea nada.
- En el navegador NO se puede setear `User-Agent` (header prohibido) — pero ahí el navegador manda su
  propio UA, que Overpass acepta (el 406 del seed era por el UA de Node/undici, no aplica en browser).

## Componentes (archivos)
- **`src/lib/puntosCartel.ts`** (puro, testeable): `armarQueryOverpass(lat, lng, radioM)` → string de
  la consulta; `parsearSemaforos(json, centro, tope=6)` → `{ lat, lng, distanciaM }[]` ordenados por
  distancia, tope 6, ignorando nodos sin coords. Sin red, sin `new Date()`.
- **`src/services/puntosCartel.ts`**: `buscarPuntosCartel(lat, lng, radioM, signal?)` → hace el fetch
  a Overpass con `AbortController` + timeout (~15 s), parsea con la lib pura, devuelve la lista o
  lanza (el componente lo trata como "no se pudo, mostrá el consejo genérico"). Nunca deja la ficha rota.
- **`src/components/PuntosCartel.tsx`**: sección en la ficha (mismo gate que el plan/tablero: dueño,
  perdida, no reunida). Botón "¿Dónde pego los carteles?" que dispara la búsqueda (bajo demanda);
  estado cargando; en éxito, lista de semáforos con distancia + "Ver en el mapa" (`abrirBusquedaMapa`
  con las coords, reusando `lib/mapas.ts`), + atribución "© colaboradores de OpenStreetMap"; en
  error/vacío, el **consejo genérico** de siempre (esquinas de tráfico: semáforos, paraderos, la
  entrada del almacén) sin romper nada.
- **`src/screens/PetDetailScreen.tsx`** (modificar): montar `<PuntosCartel pet={pet} />` junto al
  `PlanBusqueda` (mismo gate `esMio && !reunida && pet.estado === 'perdida'`).

## Reglas transversales (heredadas)
Tono sin culpar; nada de `new Date()` en libs puras; degradación explícita ante fallo de red (nunca
un estado roto ni un catch mudo — se dice "no pudimos, probá el consejo de abajo"); atribución ODbL
obligatoria al mostrar datos de OSM (como en el mapa/tablero); guardas de forma contra mutación;
verificación final contra el dist compilado.

## Sin migración, sin Edge Function, sin backend
Todo cliente + una llamada directa a Overpass desde el navegador. El punto del reporte ya está
difuminado ~250 m (privacidad), así que los semáforos se buscan alrededor del punto público, no de la
ubicación exacta — no expone nada nuevo.

# Tanda 14 — difusión con registro · coincidencia por foto · mapa en la web · pulido

**Fecha:** 3-ago-2026 · **Estado:** aprobada por Pablo (3-ago) · **Rama base:** `feat/t13` (ya
desplegada: migraciones `0059`–`0062` aplicadas, funciones desplegadas, falta subir el `dist`).

## Por qué esta tanda y no otra

Pablo pidió "pulir, mejorar, agregar opciones y nuevas funciones". Se le planteó que el camino de
más valor era destrabar el lanzamiento (nombre → dominio → correo → legales → tiendas) y **lo
descartó explícitamente: el nombre y el dominio todavía no están decididos**, así que ese camino
está bloqueado por una decisión suya, no por código. Queda entonces producto, y después pulido.

De las cuatro funciones candidatas Pablo eligió **las cuatro**. Dos venían con supuestos falsos que
se verificaron **antes** de diseñar, y las dos verificaciones cambiaron el diseño:

1. **OpenStreetMap no tiene los teléfonos.** Medido contra Overpass el 3-ago sobre la Región
   Metropolitana: 332 veterinarias y refugios, **91 % con nombre, 8 % con teléfono, 12 % con algún
   contacto, 66 % con calle, y UN solo refugio en toda la RM**. Un directorio "llamá a estas 12"
   habría nacido sin a quién llamar. Decisión: la pantalla promete un **recorrido**, no una lista de
   llamados.
2. **CLIP no corre en el build nativo.** `transformers.js` corre sobre WASM: anda en la PWA y no en
   el build de EAS que apunta a Google Play. Decisión: el vector se calcula en una **Edge Function**,
   así la función existe igual en las dos plataformas y nadie descarga 40 MB.

Y la exploración del código encontró lo que ordenó la tanda:

3. **En la web no hay mapa.** `src/components/PlatformMap.web.tsx` es un placeholder: dibuja un
   cuadro gris que dice *"El mapa solo está disponible en la app móvil"* y su `Marker` devuelve
   `null`. Como **la web es la única plataforma publicada**, hoy toda la dimensión geográfica de la
   app es invisible para todos los usuarios reales: el pin del reporte, el rastro de avistamientos y
   el mapa de Explorar existen en los datos, llegan al cliente y se descartan al dibujar.

## Restricciones globales (valen para las cuatro áreas)

- **`pets` no suma columnas.** Media app la lee con `select('*')`; una columna nueva que falte rompe
  la ficha entera (es la razón documentada de `pet_chips` en la 0054 y de las tablas de la 0048).
  Todo lo nuevo va en tablas propias.
- **Lo que falta nunca descarta.** Regla heredada de la 0054: un reporte sin foto, sin señas o sin
  vector tiene que seguir encontrando coincidencias. Los datos nuevos sólo suman puntos.
- **Nada bloquea publicar.** El cálculo del vector, la semilla de lugares y el tablero son
  best-effort: si fallan, el flujo de publicar un reporte sigue igual.
- **Tono.** Las reglas ya escritas en `src/lib/cuadrilla.ts`, `CuadrillaScreen.tsx` y
  `PlanBusqueda.tsx` (no gamificar, no sonar a "nadie te ayudó", `miembros <= 1 → 'Tu cuadrilla'`)
  se conservan tal cual y se aplican al tablero nuevo.
- **Migraciones:** `0063` en adelante. El guardián `__tests__/db/ultimaMigracion.test.ts` espera hoy
  `0062` y hay que moverlo, como en cada tanda.
- **Las Edge Functions están fuera del typecheck y de la suite.** La lógica decidible vive en
  `_shared/` como módulo puro, probado desde jest, con el espejo en `src/lib/` cuando corresponda
  (lección de la tanda 13: los espejos se copian **carácter por carácter**, comentarios incluidos).

---

## Área A — Un solo tablero de "¿a quién le avisé?"

### El problema, medido

Hay **cuatro caminos de salida** hacia afuera de la app y **ninguno deja registro**:

| Camino | Módulo | Produce |
|---|---|---|
| Texto a WhatsApp | `src/lib/share.ts` (`buildShareText`, `shareReport`) | texto plano |
| Tarjeta cuadrada | `src/lib/tarjeta.ts` + `compartirTarjeta.ts` | PNG 1080×1080 |
| Afiche imprimible | `src/lib/afiche.ts` + `aficheImage.ts` | PNG + pedido de imprenta |
| Placa de collar | `src/lib/collarTag.ts` | PNG 680×420 |

`compartirTarjeta` **ya devuelve** `ResultadoCompartir` (`'compartida' | 'descargada' | 'cancelada' |
'error'`) y **ningún llamador lo lee**: `TarjetaGenerador.tsx` descarta el valor y llama `onFin()`.
El enganche para cerrar el círculo ya existe y está sin cablear.

### Qué se construye

Un tablero por reporte con destinos de **tres tipos**, en una tabla nueva `difusion_destinos`:

- **`persona`** — texto libre que escribe el dueño: "el grupo del edificio", "la junta de vecinos",
  "mi tía que vive a dos cuadras". Es la mayoría de los avisos reales.
- **`lugar`** — de la semilla de OSM: veterinarias y refugios dentro del radio del reporte. Trae
  nombre, dirección (cuando existe) y punto. **No promete teléfono.**
- **`institucion`** — cuentas institucionales verificadas de la 0057 que estén en la comuna. **Hoy
  hay cero registradas**, así que este tipo nace vacío y la pantalla no debe dejar un hueco donde
  debería haber algo: si no hay ninguna, no se muestra la sección.

Cada destino tiene estado `pendiente | avisado` y `avisado_en`. Al lado, lo que ya existe: el
mensaje listo (`buildShareText`), el afiche, el link. Para un `lugar`, un botón que abre Google Maps
con el nombre (`src/lib/mapas.ts` ya tiene `urlBusquedaMapa`), que es de dónde la persona saca el
teléfono en un toque.

Forma de las dos tablas nuevas (los tipos exactos los fija el plan):

- `difusion_destinos(id, pet_id → pets, tipo, etiqueta, lugar_id → lugares, institucion_id →
  profiles, estado, avisado_en, creado_en)`. El dueño del reporte es el único que escribe y lee; un
  destino `persona` guarda su texto en `etiqueta` y deja los dos punteros en null.
- `lugares(id, osm_tipo, osm_id, nombre, categoria, lat, lng, direccion, comuna, actualizado_en)`,
  con `unique (osm_tipo, osm_id)` para que re-correr la semilla actualice en vez de duplicar.
  Lectura pública; escritura sólo del script de mantenimiento.

**Los radios no se inventan:** el radio con que se buscan los `lugares` cercanos sale de
`src/lib/radioSugerido.ts` (tanda 10), que ya calibra por especie y por días transcurridos. Un radio
nuevo escrito a mano acá sería una segunda fuente de verdad para lo mismo, que es exactamente el
Critical #4 de la tanda 10.

### Nadie recibe nada sin pedirlo

**No se manda ningún aviso automático a un lugar de la semilla.** Una veterinaria que nunca se
registró no recibe correo, push ni nada: la lista es una ayuda para que **la persona** avise. Es
decisión explícita de Pablo y evita el problema de spam y de la Ley 21.719. El aviso automático
sigue existiendo sólo para instituciones registradas que lo aceptaron.

### La semilla de lugares

Se guarda **una foto de los datos de OSM en nuestra base** (`lugares`), no se consulta Overpass en
vivo: Overpass es lento, tiene límites de uso y no está pensado para tráfico de app.

- Volumen esperado: ~330 en la RM, del orden de 800 en el país. Es una tabla chica.
- Se pobla con un script de mantenimiento (`scripts/`), no en una migración: los datos cambian y la
  migración quedaría congelada.
- **Licencia ODbL: obliga a atribuir.** El crédito "© colaboradores de OpenStreetMap" va **visible
  en la pantalla** que muestra los lugares, no escondido en un about.
- La pantalla dice de frente lo que la medición encontró: que muchos no tienen teléfono publicado y
  que los refugios están casi ausentes de OSM. Prometer menos de lo que se cumple.

### Deuda vieja que se cierra acá porque sale casi gratis

- **El afiche se vuelve alcanzable desde `CuadrillaScreen`.** Hoy `AficheGenerator` está gateado por
  `esMio` en `PetDetailScreen`, así que un vecino que toma la tarea "pegar 10 carteles en las
  esquinas" **no tiene ninguna forma de obtener el PNG** desde la pantalla donde la tomó. Los dos
  módulos comparten intención y hoy no comparten ni un import.
- **Los pasos de difusión del plan enlazan al tablero en vez de duplicarlo.** Es la mitad barata de
  la deuda "dos checklists paralelas" (`ESTADO.md`): 5 de las 6 tareas sugeridas de la cuadrilla
  tienen gemelo textual en `PASOS_PLAN`. La unificación completa (dar identidad compartida a las
  tareas) **queda fuera**: pide tocar `cuadrilla_tareas` y no es lo que esta tanda vino a hacer.

---

## Área B — Coincidencia por foto

### Dónde corre

`create extension vector` (disponible en el proyecto: 0.8.2, sin instalar). Una Edge Function nueva
—`foto-vector`— calcula el embedding con `transformers.js` (`image-feature-extraction` sobre
`Xenova/clip-vit-base-patch32`, salida `Float32Array` de **512** dimensiones) y escribe la fila.

Se la llama desde el cliente **después** de subir la foto, best-effort: si falla o tarda, publicar
el reporte no se entera. Nunca en el camino crítico.

**Riesgo declarado, a medir antes de construir encima:** el arranque en frío baja el modelo y las
Edge Functions tienen techo de memoria. El plan tiene que empezar por medirlo con una función de
prueba. Si no entra, la salida es calcular en el navegador y aceptar que en nativo no exista — pero
esa es la opción que Pablo ya descartó, así que el fallback se decide con el número en la mano, no
antes.

### Dónde se guarda

Tabla propia `pet_fotos_vector(pet_id, foto_url, embedding vector(512), creado_en)`, una fila por
foto (un reporte tiene varias). **No** es una columna de `pets`, por la restricción global.

Sólo se vectorizan **fotos de reportes**, que ya son públicas. Las fotos de avisos anónimos viven en
el bucket privado `avisos-anonimos` de la 0062 y **no se tocan**.

### Cómo entra al motor

`buscar_coincidencias` (definición vigente en `0058:468-582`) suma un término de foto:

- La similitud coseno entre el **mejor par de fotos** (la mejor combinación entre las fotos de un
  reporte y las del otro, no la primera de cada uno) **suma puntos**: hasta **60**, escalados desde
  la similitud. El número no es arbitrario — la escala de `senas_puntaje` hoy suma **menos de 100
  sin chip** (colores 40, tamaño 25, sexo 15, esterilizado 10, cercanía hasta 20) contra **1000** del
  chip. Con 60, la foto pesa más que cualquier seña suelta y sigue sin poder acercarse al chip, que
  tiene que seguir mandando.
- **La foto nunca descarta.** Misma regla que `senas_contradicen`: dos fotos que no se parecen no
  eliminan la coincidencia, porque un animal sucio, mojado o de noche no se parece a su propia foto.
- Un reporte sin vector puntúa como hoy. Nada retrocede.

### Lo que ya estaba pago y no se usaba

`Coincidencia.puntaje` lo calcula `senas_puntaje`, lo devuelve la RPC, está tipado en
`src/services/busqueda.ts` y **ninguna pantalla lo lee**: el orden de las coincidencias es hoy
inexplicable para el usuario. Esta área lo muestra y agrega **el desglose de por qué coincide**
(color, tamaño, cercanía, foto), que hoy tampoco se devuelve.

---

## Área C — Un mapa de verdad en la web

### Qué se reemplaza

`src/components/PlatformMap.web.tsx` deja de ser un placeholder y pasa a ser un mapa real con
**Leaflet + teselas de OpenStreetMap**: sin llave, sin factura y sin cuenta, a diferencia de Google
Maps en web. Se conserva **la misma interfaz** `MapView` / `Marker` que ya consumen las cinco
pantallas (`PetDetailScreen`, `PublishScreen`, `PublicarAdopcionScreen`, `AddSightingScreen`,
`PublicPetScreen`, más `ReportesMapa` en Explorar), así que ninguna de ellas cambia por esto.

Atribución de OSM obligatoria, igual que en el área A.

### El rastro, con orden

Hoy los avistamientos se dibujan como pines idénticos del mismo color, sin secuencia: la dimensión
"hacia dónde se está moviendo" está en los datos (`sortByRecency` existe) y no se dibuja. El rastro
pasa a mostrar el orden temporal, con el pin del reporte distinguible del resto.

### El vecino que llega por el QR ve el rastro

Decisión de Pablo. Hoy la RLS de `sightings` es `to authenticated`, así que quien escanea el afiche
—**el caso de uso central de toda la app**— ve el pin del reporte y ninguna pista. Se abre la
lectura a `anon` **para reportes activos y no ocultos**.

Es defendible porque **las ubicaciones ya salen difuminadas ~250 m al escribirse**
(`difuminarUbicacion.ts`, desplazamiento aleatorio y no redondeo, justamente porque el redondeo es
reversible): abrirlas no revela una dirección. La migración tiene que replicar los filtros de
`activo` y `oculto`, porque una policy nueva no hereda los de la ficha.

### Lo que NO se puede hacer, dicho de frente

**El aviso anónimo no puede aparecer en el mapa.** No es que no lo dibujemos: no tiene coordenadas.
El pedido de GPS se sacó a propósito en la tanda 11 (`usarUbicacion` quedó como código muerto) y
`avistar_sin_cuenta` guarda `lat`/`lng` en null en el 100 % de los avisos reales. Ponerlo en el mapa
significa volver a pedir ubicación, que es una decisión de producto aparte y **queda fuera de esta
tanda**.

---

## Área D — Pulido y deuda

- Los ~16 minors triados al cierre de la tanda 13 (ledger `.superpowers/sdd/progress.md`): título
  in-app vs push de la denuncia, el `catch` de `useDenunciasPendientes` que no resetea el contador,
  los fallbacks de `CollarTag`/`TarjetaCompartir`, el test duplicado en `profile.test.ts`, el umbral
  `>= 4`, el comentario de lápidas, y los demás.
- **Accesibilidad:** nueve pantallas (`AdopcionFeedScreen`, `AlertZoneScreen`, `EncontreScreen`,
  `EditAdoptionScreen`, `PublicarAdopcionScreen`, `ProfileScreen`, `HomeScreen`, `SelectorAmbito`,
  `PlanBusqueda`) tienen grupos de "elegí uno" que se anuncian como casillas: falta `rol="opcion"` y
  el `radiogroup`. Es mecánico y hay dos ejemplos ya hechos.
- **Paginado de `storage.list`** en `deletePet` y en `delete-account`: hoy con más de 100 archivos
  quedan huérfanos.
- **Cron de limpieza** de `seguimientos_anonimos` vencidos. Anotado en la 0061: el vencimiento del
  reporte es perezoso (se calcula al leer, nada escribe `activo = false`), así que la rama de borrado
  del trigger nunca corre por esa vía.

---

## Manejo de errores

Cada área degrada sin romper lo que ya funciona:

- **Migración sin aplicar:** el patrón del repo es `esMigracionSinAplicar` (PGRST205/202) y un estado
  `'no-disponible'` en el servicio, como hace `src/services/cuadrilla.ts`. Se repite igual para el
  tablero y los vectores.
- **Escrituras que la RLS rechaza en silencio:** toda escritura pide `.select(...)` y mira
  `data.length === 0`. Es la **quinta** aparición de este silencio de PostgREST en el proyecto; los
  tests que lo cubren no deben mockear `42501`, porque ésa es justo la respuesta que la RLS **no**
  da.
- **Vector que no se calcula:** la coincidencia puntúa sin él. No hay estado de error visible al
  usuario ni reintento en el camino crítico.
- **Semilla vacía o comuna sin lugares:** la pantalla lo dice y ofrece agregar destinos a mano, en
  vez de mostrar una lista vacía que se lee como "no hay ninguna veterinaria cerca".
- **Teselas del mapa que no cargan:** el mapa degrada a los pines sobre fondo liso; nunca a un error
  que tape la pantalla.

## Pruebas

- **Módulos puros con jest**, que es donde vive la lógica decidible: armado del tablero, el
  desglose del "por qué coincide", el orden del rastro, la normalización de la semilla de OSM.
- **Guardianes (tripwires)**, siguiendo el patrón del repo: que la lista de campos del tablero salga
  de ejecutar la función y no esté escrita a mano en el test (lección del Critical #1 de la tanda
  12); que el espejo de la Edge Function sea idéntico al de `src/`; que el `create extension` y el
  número de la última migración estén donde se los espera.
- **SQL ejecutado de verdad**, no leído: cada migración ensayada dentro de `begin … rollback` contra
  la base real y atacada después de aplicar, con **control** en cada ataque — un cero sin control se
  lee como "seguro" cuando puede ser una tabla vacía (pasó en esta misma sesión al verificar la
  0061). Para la policy nueva de `sightings`: que `anon` vea el rastro de un reporte activo, que
  **no** lo vea de uno oculto ni cerrado, y el control de que la fila existía.
- **Medición temprana del riesgo de B**: la Edge Function de embeddings se mide (arranque en frío y
  memoria) antes de construir el motor encima.

## Lo que esta tanda NO hace

- No toca el nombre, el dominio, los correos ni las páginas legales: bloqueado por decisión de Pablo.
- No unifica del todo el plan de búsqueda con las tareas de la cuadrilla (sólo enlaza la difusión).
- No pone el aviso anónimo en el mapa: no tiene coordenadas que poner.
- No manda avisos automáticos a lugares que no se registraron.
- No agrega mapa de calor: primero tiene que existir un mapa.

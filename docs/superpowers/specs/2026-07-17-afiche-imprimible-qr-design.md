# Diseño — Afiche imprimible con QR (v1)

Fecha: 2026-07-17 · Proyecto: Encuentra tu Mascota · Rama: `feat/mvp-encuentra-mascota`

## Objetivo

Permitir que el **dueño de un reporte** genere una **imagen PNG** de un afiche
listo para imprimir (proporción hoja carta) y compartir por WhatsApp. El afiche
incluye la foto, los datos de la mascota, el WhatsApp del dueño y un **código QR**
que abre el reporte público (para ver todo y chatear dentro de la app).

Meta de la función: llevar la app a la calle. Un afiche pegado en un poste con
un número visible y un QR es una de las herramientas más efectivas para
recuperar una mascota.

## Alcance (v1)

**Incluye:**
- Botón "Crear afiche" en el detalle del reporte, visible **solo si el reporte
  es del usuario** (`esMio`).
- Guardia: si el perfil no tiene WhatsApp cargado, el botón lleva primero a
  completar el teléfono (aviso amable), en vez de generar un afiche sin contacto.
- Componente visual `AfichePoster` (proporción carta vertical).
- Generación de la imagen PNG mediante rasterizado del componente.
- Código QR al link público del reporte, generado localmente (sin internet).
- Entrega multiplataforma: descarga en web, hoja de compartir/guardar en nativo.
- Lógica pura testeada para armar el contenido del afiche.

**No incluye (fuera de alcance v1):**
- Generar afiches de reportes ajenos (requeriría permisos RLS para leer el
  teléfono de otros usuarios — se evaluará en otra iteración).
- Exportar a PDF nativo (`expo-print`) — se eligió PNG.
- Plantillas/estilos alternativos del afiche. Un solo diseño en v1.
- Selección de cuál de las varias fotos usar: se usa la primera (`fotos[0]`).

## Experiencia de usuario

1. El dueño entra a su reporte → ve el botón **"Crear afiche"**.
2. Si **no** tiene WhatsApp en su perfil → toca el botón → aviso "Agregá tu
   WhatsApp para que puedan contactarte" → va a editar perfil. (No se genera
   afiche.)
3. Si **sí** tiene WhatsApp → toca el botón → se arma y rasteriza el afiche →
   - **Web:** se descarga el PNG automáticamente; si el navegador soporta Web
     Share con archivos, además se ofrece "Compartir".
   - **Nativo:** se abre la hoja de compartir del sistema con el PNG (permite
     mandarlo por WhatsApp o guardarlo en la galería).
4. Mientras se genera, el botón muestra estado de carga; si algo falla, aviso
   de error y opción de reintentar.

## Contenido del afiche

Proporción **hoja carta vertical** (relación ~8.5:11).

- **Titular** grande según estado:
  - `perdida` → **"SE BUSCA"**
  - `encontrada` → **"¿CONOCÉS A ESTA MASCOTA?"**
- **Foto principal** (`fotos[0]`) grande. Si no hay foto, placeholder con 🐾.
- **Nombre** (si existe) · **especie** · **raza** (si existe).
- **Señas**: la descripción del reporte.
- **Recompensa**: bloque destacado, solo si `pet.recompensa` tiene valor.
- **Zona aproximada**: texto genérico (p. ej. "Cerca de tu zona"), **no** la
  dirección/coordenada exacta, por privacidad. (v1: texto fijo; la geocodificación
  inversa a nombre de barrio queda fuera de alcance.)
- **QR** grande → link público del reporte (`petUrl(pet.id)`).
- **WhatsApp** en grande, con ícono, tomado de `profile.telefono`.
- **Pie**: "Publicado en Encuentra tu Mascota 🐾".

## Diseño técnico

### Componentes y archivos

- `src/lib/afiche.ts` — **lógica pura, testeable**. Dado un `Pet` y el
  `Profile` del dueño (o los campos relevantes), devuelve un objeto
  `AficheContent` con todo lo que el afiche debe mostrar:
  - `titular` (según estado),
  - `subtitulo` (especie · raza),
  - `nombre`, `senas`, `recompensa | null`, `zonaTexto`,
  - `whatsapp` (normalizado a dígitos para el link `wa.me`),
  - `url` (link público, puede ser `null` si no hay base URL).
  - Además una función `puedeCrearAfiche(profile)` / `faltaWhatsapp(profile)`
    que decide si mostrar la guardia de "cargá tu WhatsApp".
  - El nombre de archivo sugerido del PNG: `armarNombreArchivo(pet)` →
    p. ej. `afiche-<nombre-o-especie>.png`.
- `src/components/AfichePoster.tsx` — componente visual (`View`) que recibe
  `AficheContent` + la foto ya resuelta (data URI o uri) y el elemento QR.
  Solo presentación; sin lógica de datos ni de captura. Se renderiza para
  capturarlo (fuera de pantalla o en un contenedor temporal).
- `src/components/QrCode.tsx` — genera la matriz del QR con `qrcode-generator`
  y la dibuja con `react-native-svg` (`<Rect>` por módulo). Props: `value`,
  `size`. Sin dependencias de red.
- `src/lib/aficheImage.ts` (o hook `useAfiche`) — orquesta el proceso:
  1. resolver la foto principal a data URI en web (para evitar canvas "tainted");
     en nativo usar la uri remota directa,
  2. rasterizar el `AfichePoster` con `react-native-view-shot` (`captureRef`),
  3. entregar el PNG (descarga web / compartir nativo).
- Integración en `src/screens/PetDetailScreen.tsx`: botón "Crear afiche" (solo
  `esMio`), estado de carga/error, y llamada al orquestador. Es el único archivo
  existente que se modifica.

### Rasterizado a PNG

- **`react-native-view-shot`** (`captureRef`) rasteriza el `AfichePoster`
  renderizado. Funciona en web y nativo.
  - **Web:** `captureRef(ref, { result: 'data-uri', format: 'png' })` → se usa
    para descargar (anchor con `download`) y/o Web Share.
  - **Nativo:** `captureRef(ref, { result: 'tmpfile', format: 'png' })` → se
    pasa la uri del archivo a `expo-sharing`.

### Código QR

- **`qrcode-generator`** (puro JS) para obtener la matriz de módulos
  (`qr.isDark(row, col)`); se dibuja con `react-native-svg`. Sin red, sin API keys.
- Codifica `petUrl(pet.id)`.

### Riesgo conocido: foto remota y canvas "tainted" (solo web)

Al capturar en web, una imagen remota de otro origen puede "ensuciar" el canvas
y hacer fallar la exportación. **Mitigación:** en web, antes de renderizar el
afiche, se descarga `fotos[0]` (`fetch` → `blob` → `FileReader` a data URI) y se
usa ese data URI en la imagen del afiche. Supabase Storage sirve los objetos
públicos con CORS, así que el `fetch` funciona. Si la descarga falla, se
continúa con la uri remota y, si la captura falla, se muestra error claro.

### Límite conocido: QR en desarrollo

El QR apunta a `petUrl(pet.id)`, que en web usa `window.location.origin`. En
producción (web desplegada) el QR es correcto y escaneable. En desarrollo
(`localhost`) el QR apunta a `localhost` y no sirve para escanear desde otro
dispositivo — es esperable y se resuelve al desplegar la web. Se documenta; no
se bloquea la generación.

### Dependencias nuevas

- `react-native-view-shot` — rasterizar la vista a PNG (web + nativo).
- `qrcode-generator` — matriz del QR, puro JS.
- `expo-sharing` — hoja de compartir del archivo en nativo (inofensivo en web,
  donde se usa descarga/Web Share).

## Manejo de errores

- Falta WhatsApp → no es error: se deriva a completar perfil con aviso amable.
- Sin base URL para el QR → se genera igual (QR a `localhost` en dev); no bloquea.
- Falla la descarga de la foto en web → se intenta con uri remota; si la captura
  falla, aviso "No se pudo crear el afiche, intentá de nuevo".
- Falla `captureRef` o el compartir → aviso de error con reintento.

## Pruebas

- **`src/lib/afiche.test.ts`** (lógica pura, estilo `matches.test.ts`):
  - titular correcto según `estado` (`perdida` / `encontrada`).
  - subtítulo arma especie + raza; sin raza no agrega el separador.
  - recompensa se incluye solo si tiene valor.
  - `faltaWhatsapp` / `puedeCrearAfiche` según `telefono` presente/ausente/vacío.
  - normalización del WhatsApp a dígitos para `wa.me`.
  - `url` es `null` cuando no hay base URL.
  - `armarNombreArchivo` usa nombre o especie y termina en `.png`.
- La parte visual y la captura a PNG se prueban **a mano en la web** (abrir el
  reporte propio, generar el afiche, verificar la descarga y el escaneo del QR
  contra la web desplegada).

## Criterios de aceptación

1. En el detalle de un reporte propio con WhatsApp cargado, "Crear afiche"
   genera un PNG con foto, datos, recompensa (si hay), WhatsApp y QR.
2. En web el PNG se descarga; en nativo se abre la hoja de compartir.
3. Sin WhatsApp en el perfil, el botón deriva a completar el teléfono y no
   genera afiche.
4. El QR, escaneado contra la web desplegada, abre el reporte público correcto.
5. `npm test` en verde (incluye los nuevos tests de `afiche.ts`).
6. `npx tsc --noEmit` sin errores.

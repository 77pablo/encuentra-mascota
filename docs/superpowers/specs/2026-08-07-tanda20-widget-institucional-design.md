# Tanda 20 — Widget institucional embebible (v1)

**Fecha:** 7-ago-2026 · **Aprobación:** Pablo pidió seguir con el panel institucional. **Sin costo:**
HTML estático servido desde nuestro dominio + una pantalla; sin backend nuevo.

## Análisis de brecha (antes de diseñar)
El "panel institucional" del doc de competencia son DOS piezas: (1) publicar en lote y (2) widget
embebible. **La carga en lote YA EXISTE** (`src/lib/loteInstitucional.ts`, cableada en Publish/
Profile) y la **insignia institucional también** (mig 0058, `lib/institucion.ts`,
`InsigniaInstitucion.tsx`). Lo genuinamente nuevo y estratégico es el **widget embebible** — cómo
Petco Love Lost escaló y la única defensa realista contra SOSAFE: que una veterinaria o municipio
muestre "mascotas perdidas de la comuna" en SU propio sitio, alimentado por nosotros.

## Qué construye
Un `<iframe>` que un tercero pega en su sitio y muestra las mascotas perdidas/encontradas activas de
una comuna, con foto, que enlazan a la ficha pública. Cada visitante de la vet es tráfico de vuelta
a la app, en el barrio correcto (nuestro problema de arranque en frío).

## Componentes
- **`public/widget/index.html`** (NUEVO, self-contained): HTML+CSS+JS sin dependencias. Lee
  `?comuna=X` (y `?limite=N`, default 12) de la URL, consulta PostgREST anon
  (`pets?...&comuna` o `comunas_alcance`, `activo=true&oculto=false`, orden por fecha), y renderiza
  tarjetas compactas (foto, nombre/especie, estado, "hace X"). Cada tarjeta enlaza a `/mascota/:id`
  con `target="_top"` (sale del iframe al sitio nuestro). Footer "Datos de Encuentra tu Mascota" con
  link a la app. Usa la MISMA URL + publishable key públicas que ya están hardcodeadas en
  `_worker.js` (la anon key es pública por diseño, va en cada cliente). Estados: cargando, vacío
  ("no hay reportes activos en {comuna}"), error (mensaje corto). Responsive, tema claro fijo (se
  embebe en sitios ajenos). Escapa todo texto de usuario (XSS: es HTML inyectado con datos de
  terceros, misma regla que el popup del mapa).
- **`public/_worker.js`** (MODIFICAR): sumar `/widget` a `ESTATICOS_SIN_EXTENSION` para que el
  worker sirva el archivo estático y NO lo trague el catch-all del SPA (misma mecánica que
  `/borrar-cuenta`). Con test que además comprueba que una ruta que apenas empieza igual
  (`/widgets-x`) NO se escapa del SPA.
- **`src/lib/widgetInstitucion.ts`** (NUEVO, puro): `armarCodigoEmbed(origin, comuna, limite?)` →
  el string `<iframe src="{origin}/widget/?comuna=...">`; `urlWidget(origin, comuna, limite?)` → la
  URL de preview. Testeable, escapa la comuna en la query.
- **`src/screens/WidgetInstitucionScreen.tsx`** (NUEVO): "Poné las mascotas de tu comuna en tu
  sitio". Elegir comuna (reusa el selector/lista de comunas existente), muestra el código `<iframe>`
  con botón Copiar y un "Ver cómo se ve" (`Linking` al preview). Sin login ni rol: cualquiera
  —una vet sin cuenta— puede tomar el código (mejor para adopción). Reachable desde Perfil y desde
  `AyudaScreen`.
- **`src/navigation/RootNavigator.tsx`** (MODIFICAR): registrar `WidgetInstitucion` en el stack raíz
  con header.

## Reglas transversales (heredadas)
Escapar todo texto de usuario en el widget (XSS almacenado, como `popupHtml` del mapa); navegación
anidada absoluta; `.select()` con columnas explícitas; degradación ante fallo de red (widget con
estado de error, nunca en blanco); guardas de forma contra mutación; verificar el worker en el
runtime REAL (`wrangler@3 pages dev dist`) porque `_headers`/rutas no se ven en jest; verificación
final contra el dist compilado.

## Sin costo, sin migración, sin backend
El widget lee lo que la RLS pública ya permite (reportes activos no ocultos). No hay tabla nueva ni
Edge Function. La publishable key es pública por diseño.

## Fuera de v1
Filtros en el widget (especie), personalización de colores por institución, panel con métricas de la
institución, verificación de que quien embebe es una institución real (no hace falta: el widget solo
muestra datos ya públicos).

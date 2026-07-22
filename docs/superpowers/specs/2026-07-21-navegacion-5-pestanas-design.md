# Navegación de 5 pestañas + Mensajes arriba — diseño

**Fecha:** 2026-07-21
**Estado:** aprobado, listo para plan

## Problema

El tab bar tiene **8 pestañas** (Inicio · Mapa · Lista · Comunidad · Adopción · Publicar ·
Mensajes · Perfil) y queda apretado en teléfonos chicos. La regla sana para una barra
inferior es ~5 destinos + el botón central de publicar. Hay solapamientos que permiten
consolidar sin perder nada: **Mapa y Lista son la misma búsqueda de reportes**
(`buscar_reportes`) en dos vistas, y **Comunidad** es esa misma lista filtrada por comuna
más un botón de "seguir comuna".

## Objetivo (aprobado)

Barra de **5 pestañas**: `Inicio · Explorar · Publicar(+) · Adopción · Perfil`.
- **Explorar** = Mapa + Lista + Comunidad, con un **toggle Lista/Mapa** y filtros compartidos.
- **Mensajes** deja de ser pestaña y pasa a un **ícono arriba** (con badge de no leídos) en
  las pantallas principales.

Decisiones confirmadas: toggle (no sub-pestañas); ícono de Mensajes en Inicio, Explorar y
Adopción (no en Perfil ni Publicar); Explorar abre en **Lista** por defecto.

## Arquitectura

### 1. Pantalla `ExplorarScreen` (nueva) — reemplaza Lista/Mapa/Comunidad

Dueña de **todo el estado de filtros** que hoy vive en `ListScreen` (estado, especie,
`cercaDeMi`, `radioKm`, búsqueda + diferida, `conRecompensa`, `rango`, `comunaFiltro`) más un
nuevo `vista: 'lista' | 'mapa'` (default `'lista'`). Construye un solo objeto
`FiltrosBusqueda` (idéntico al de `ListScreen:91-105`) que alimenta ambas vistas.

Layout (de arriba a abajo):
- Encabezado: `Title` "Explorar" + a la derecha el **ícono de Mensajes** (ver §3).
- La tarjeta **"¿Encontraste una mascota?"** (se mueve tal cual desde `ListScreen`, navega a
  `Encontre`).
- El **Input de búsqueda** + los **chips de filtro** (los mismos de `ListScreen`: estado,
  especie, rango, con-recompensa, cerca-de-mí, comuna, y radios cuando `cercaDeMi`).
- Un **toggle segmentado `Lista | Mapa`** (dos `Chip`/segmented; alterna `vista`).
- **Cuando `comunaFiltro` está puesto:** el botón **"Avisarme de [comuna]" / "Siguiendo
  [comuna]"** (la función de seguir comuna que hoy vive en `ComunidadScreen.toggleSeguir`,
  extraída a un componente reutilizable `<SeguirComunaButton comuna={...}/>`). Guest → portero
  ("Creá una cuenta para seguir comunas").
- **Cuerpo:** `vista === 'lista'` → `<ReportesLista filtros navigation/>`; `vista === 'mapa'`
  → `<ReportesMapa filtros navigation/>`.

**Param de entrada:** `ExplorarScreen` acepta `route.params.comuna` (opcional) para
pre-cargar `comunaFiltro` — así "En tu comuna" de Inicio abre Explorar ya filtrado por esa
comuna. Se aplica con un `useEffect` sobre `route.params` (patrón ya usado en `PublishScreen`
tras el fix de la tanda de adopción).

### 2. Componentes extraídos (para no hacer un archivo gigante)

- **`src/components/ReportesLista.tsx`** — el cuerpo de lista de `ListScreen` (el `FlatList`
  de `PetCard` + empty/loading/error + scroll infinito), recibe `filtros: FiltrosBusqueda` y
  `navigation`; usa `useBusquedaReportes(filtros)`. Navega a `PetDetail`.
- **`src/components/ReportesMapa.tsx`** — el cuerpo de mapa de `MapScreen` (MapView +
  Markers + leyenda + banner de carga/error), recibe `filtros` y `navigation`. **Cambio
  respecto de hoy:** en vez de `buscarReportes({}, null, 100)` usa
  `buscarReportes(filtros, null, 100)` (respeta los filtros de Explorar; sigue con tope 100
  pines, sin cursor). Recarga al cambiar `filtros` y en `useFocusEffect`.
- **`src/components/SeguirComunaButton.tsx`** — extrae `toggleSeguir` de `ComunidadScreen`
  (usa `services/comunasSeguidas`): botón "Avisarme de/Siguiendo [comuna]", con su estado
  `sigue` y el portero para invitados.

**Se retiran** `ListScreen.tsx`, `MapScreen.tsx` y `ComunidadScreen.tsx` (su lógica queda en
`ExplorarScreen` + los 3 componentes). No quedan referencias sueltas (ver §5).

### 3. Mensajes → ícono arriba

- **`src/components/MensajesButton.tsx`** — ícono `chatbubble-ellipses-outline` con el badge
  de no leídos (`useUnread().count`), en la esquina superior derecha. `onPress`: si NO hay
  sesión → `notify(mensajeDe('contactar'))` + `navigation.navigate('Register')` (mismo
  portero que hoy tiene la pestaña); si hay sesión → `navigation.navigate('Mensajes')`.
- Se coloca en el encabezado de **`HomeScreen`, `ExplorarScreen` y `AdopcionFeedScreen`**
  (fila superior, a la derecha del título/saludo). En `HomeScreen` convive con el avatar de
  perfil que ya está arriba.

### 4. Navegación

**`TabNavigator.tsx`:**
- Tabs finales (5): `Inicio` (InicioStack), `Explorar` (ExplorarStack nuevo), `Publicar`
  (PublishScreen, con su portero actual), `Adopcion` (AdopcionStack), `Perfil` (ProfileStack).
- **Se eliminan** las tabs `Mapa`, `Lista`, `Comunidad` y `Mensajes` (y sus stacks
  MapStack/ListStack/ComunidadStack/MsgStack como *tabs*).
- **`ExplorarStack`** (nuevo, native stack): `Explorar` (ExplorarScreen) + `Encontre` +
  `PetDetail` + `AddSighting` + `Chat` + `PublicProfile` (las sub-pantallas que tenían
  ListStack/MapStack/ComunidadStack unificadas; `Encontre` venía de ListStack).
- `TAB_ICONS`: `Inicio: home`, `Explorar: search` (o `compass`), `Publicar: add-circle`,
  `Adopcion: paw`, `Perfil: person`. Se quitan las entradas de Mapa/Lista/Comunidad/Mensajes.
- Se elimina el `listeners={porteroDeTab('contactar')}` de Mensajes (ya no es tab); el
  portero de Publicar se mantiene.

**`RootNavigator.tsx`:**
- Se registra **`Mensajes`** como pantalla del **stack raíz** apuntando a `MsgStack` (el mismo
  stack de Conversaciones + Chat + PublicProfile que hoy existe). El `MensajesButton` llega
  con `navigate('Mensajes')` por burbujeo hacia el raíz (mismo mecanismo que `GuiaPerdida`).
  Sin linking (no es una URL pública).

### 5. Destinos de navegación a reapuntar (donde algo se rompería si no se toca)

| Archivo | Hoy | Nuevo |
|---|---|---|
| `PublishScreen.tsx:209` | `navigate('Mapa')` (tras publicar) | `navigate('Explorar')` |
| `HomeScreen.tsx:232,244,292` | `navigate('Lista')` | `navigate('Explorar')` |
| `HomeScreen.tsx:205` | `navigate('Comunidad')` (sección "En tu comuna") | `navigate('Explorar', { comuna })` con la comuna de esa sección |
| `src/data/guiaPerdida.ts` | acción a ruta `'Comunidad'` (y `RUTAS_GUIA`) | `'Explorar'` |

Buscar además cualquier otro `navigate('Mapa'|'Lista'|'Comunidad'|'Mensajes')` que aparezca
(grep en `src/`) y reapuntarlo. El chat sigue en `'Chat'` (sin cambios).

## Casos borde / decisiones

- **Filtros compartidos entre vistas:** al alternar Lista↔Mapa, los filtros y la búsqueda se
  conservan (viven en `ExplorarScreen`, no en los cuerpos). Es la ganancia principal de UX.
- **Modo invitado:** Explorar y su toggle son públicos (como Lista/Mapa hoy). Seguir comuna y
  Mensajes disparan el portero. Publicar sigue con su portero de tab.
- **`initialRouteName`** del Tab sigue `Inicio`.
- **Perfil → Guardados/MyPets/etc.** no cambian.
- **El mapa ahora respeta filtros:** es una mejora, no una regresión (antes mostraba todo).
  Ojo: con `cercaDeMi` + radio, el mapa mostrará solo los de ese radio (coherente con la
  lista). Con muchos filtros y pocos resultados, el mapa puede quedar con pocos pines: es lo
  correcto.
- **No hay migración ni cambios de datos.** Es puramente cliente/navegación.

## Testing

- Extraer `desdeDeRango`/filtros ya está testeado (`petFilters`); no se duplica.
- `SeguirComunaButton`: si hay una función pura extraíble, testearla; si no, el repo no tiene
  render-tests de pantallas, así que no se inventan.
- `tsc --noEmit` limpio + `jest` verde (no debe romperse ningún test existente).
- **Verificación visual con Playwright** (dev server): (1) la barra muestra 5 pestañas sin
  apretarse; (2) Explorar abre en Lista, el toggle cambia a Mapa conservando filtros; (3)
  filtrar por comuna muestra "Avisarme de [comuna]"; (4) el ícono de Mensajes abre la bandeja
  y muestra el badge; (5) publicar un reporte vuelve a Explorar; (6) "En tu comuna" de Inicio
  abre Explorar filtrado.

## Archivos

- Create: `src/screens/ExplorarScreen.tsx`, `src/components/ReportesLista.tsx`,
  `src/components/ReportesMapa.tsx`, `src/components/SeguirComunaButton.tsx`,
  `src/components/MensajesButton.tsx`.
- Modify: `src/navigation/TabNavigator.tsx` (5 tabs + ExplorarStack, quita 4 tabs + Mensajes),
  `src/navigation/RootNavigator.tsx` (registra `Mensajes`), `src/screens/HomeScreen.tsx`
  (destinos + MensajesButton), `src/screens/AdopcionFeedScreen.tsx` (MensajesButton),
  `src/screens/PublishScreen.tsx` (destino), `src/data/guiaPerdida.ts` (destino).
- Delete: `src/screens/ListScreen.tsx`, `src/screens/MapScreen.tsx`,
  `src/screens/ComunidadScreen.tsx` (lógica migrada).

## Fuera de alcance (YAGNI)

- Rediseño visual de las tarjetas o del mapa. Recordar la última vista (Lista/Mapa) entre
  sesiones. Un buscador dentro del mapa. Animaciones del toggle. Mover "seguir comuna" a
  Perfil (queda contextual en Explorar; ya está también en Avisos).

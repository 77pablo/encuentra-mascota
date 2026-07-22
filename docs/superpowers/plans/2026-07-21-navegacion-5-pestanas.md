# Navegación de 5 pestañas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development donde
> aplique. Steps con checkbox (`- [ ]`). ORDEN IMPORTA: tareas 1–5 crean piezas nuevas sin
> romper nada (las pantallas viejas siguen andando); la tarea 6 hace el switchover atómico de
> navegación y recién ahí se borran las viejas. Cada tarea deja `tsc` limpio + `jest` verde.

**Goal:** Pasar el tab bar de 8 a 5 pestañas: `Inicio · Explorar · Publicar(+) · Adopción ·
Perfil`, con Explorar = Mapa+Lista+Comunidad (toggle + filtros compartidos) y Mensajes como
ícono arriba.

**Architecture:** `ExplorarScreen` dueña de los filtros + toggle Lista/Mapa, componiendo
`ReportesLista`/`ReportesMapa` (cuerpos extraídos, ahora ambos leen los mismos filtros) +
`SeguirComunaButton`. `MensajesButton` (ícono + badge) abre la bandeja registrada en el stack
raíz. Sin migración: puro cliente/navegación.

**Tech Stack:** Expo (RN+TS, web), React Navigation (bottom-tabs + native-stack), jest.

## Global Constraints

- **Spec = fuente de verdad:** `docs/superpowers/specs/2026-07-21-navegacion-5-pestanas-design.md`
  (tiene el layout de Explorar, la tabla de destinos a reapuntar y los archivos verbatim).
- **Ícono de Explorar: `search`** (lupa). Publicar sigue `add-circle` grande y en color `lost`.
- **Explorar abre en `vista='lista'`.** El toggle conserva los filtros (viven en ExplorarScreen).
- **El mapa AHORA respeta los filtros** (`buscarReportes(filtros, null, 100)`), no `{}`.
- **Modo invitado:** Explorar/toggle públicos; Seguir-comuna y Mensajes disparan el portero
  (`notify(mensajeDe('contactar'|...))` + `navigate('Register')`); Publicar mantiene su portero.
- Antes de cada commit: `npx tsc --noEmit` limpio + `npx jest` verde.
- Reusar `src/ui`/`src/theme` (nada de paleta nueva). Copy cálido, español chileno.
- Commits chicos; terminar cada uno con
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Componente `ReportesLista`

**Files:** Create `src/components/ReportesLista.tsx`

**Interfaces (Produces):** `<ReportesLista filtros={FiltrosBusqueda} navigation={any} />` — el
cuerpo de lista (FlatList de `PetCard` + empty/loading/error + scroll infinito), usando
`useBusquedaReportes(filtros)`. Navega a `PetDetail` con `{ id }`.

- [ ] Extraer de `src/screens/ListScreen.tsx` el bloque del `FlatList` (líneas ~107–247: el
  `useBusquedaReportes`, `hayFiltrosPuestos`, loading/error y el FlatList con sus empty
  states) a un componente que reciba `filtros` y `navigation`. NO incluye el input ni los
  chips (esos quedan en ExplorarScreen).
- [ ] `ListScreen.tsx` sigue existiendo y compilando (todavía es la pestaña Lista hasta la
  tarea 6). Podés hacer que `ListScreen` use `<ReportesLista>` internamente para no duplicar,
  o dejarlo intacto — lo importante es que `ReportesLista` quede autónomo. `tsc` + `jest`. Commit.

## Task 2: Componente `ReportesMapa` (respeta filtros)

**Files:** Create `src/components/ReportesMapa.tsx`

**Interfaces (Produces):** `<ReportesMapa filtros={FiltrosBusqueda} navigation={any} />` — el
MapView + Markers + leyenda + banner de carga/error de `MapScreen`, pero cargando con
`buscarReportes(filtros, null, 100)` (tope 100 pines, sin cursor). Recarga cuando cambia
`filtros` y en `useFocusEffect`. Navega a `PetDetail`.

- [ ] Extraer de `src/screens/MapScreen.tsx` el render del mapa a un componente con la firma
  de arriba. **Cambio clave vs. hoy:** `buscarReportes({}, ...)` → `buscarReportes(filtros, ...)`,
  y agregar `filtros` a las dependencias del `useCallback`/`useEffect` de carga.
- [ ] `tsc` + `jest`. Commit.

## Task 3: Componente `SeguirComunaButton`

**Files:** Create `src/components/SeguirComunaButton.tsx`

**Interfaces (Produces):** `<SeguirComunaButton comuna={string} />` — botón "Avisarme de
[comuna]" / "Siguiendo [comuna]" con su estado `sigue`, usando `services/comunasSeguidas`
(`getComunasSeguidas`/`seguirComuna`/`dejarDeSeguirComuna`) y el portero para invitados.

- [ ] Extraer de `src/screens/ComunidadScreen.tsx` la lógica de `toggleSeguir` + el estado
  `sigue` + el botón (ver `ComunidadScreen:77-135`) a este componente parametrizado por
  `comuna`. Guest → `notify('Creá una cuenta', 'Necesitás una cuenta para seguir comunas…')`.
- [ ] `tsc` + `jest`. Commit.

## Task 4: Componente `MensajesButton`

**Files:** Create `src/components/MensajesButton.tsx`

**Interfaces (Produces):** `<MensajesButton />` — ícono `chatbubble-ellipses-outline` con
badge de no leídos (`useUnread().count`). `onPress`: sin sesión → `notify(mensajeDe('contactar'))`
+ `navigation.navigate('Register')`; con sesión → `navigation.navigate('Mensajes')`.

- [ ] Implementar el componente (usa `useUnread`, `useAuth`, `useNavigation`,
  `lib/requireAuth.mensajeDe`). El badge se muestra solo si `count > 0`, estilo del badge
  actual (`colors.lost`/`colors.white`, ver `TabNavigator:237-239`).
- [ ] `tsc` + `jest`. Commit.

## Task 5: Pantalla `ExplorarScreen`

**Files:** Create `src/screens/ExplorarScreen.tsx`

**Consumes:** `ReportesLista`, `ReportesMapa`, `SeguirComunaButton`, `MensajesButton`.

- [ ] Trasladar TODO el estado de filtros de `ListScreen` (estado, especie, cercaDeMi,
  radioKm, busqueda+diferida, conRecompensa, rango, comunaFiltro) + `vista:'lista'|'mapa'`
  (default `'lista'`). Construir el `FiltrosBusqueda` idéntico a `ListScreen:91-105`.
- [ ] Layout (spec §1): encabezado `Title "Explorar"` + `<MensajesButton/>` a la derecha; la
  tarjeta "¿Encontraste una mascota?" (→ `Encontre`); el Input de búsqueda; los chips de
  filtro (los mismos de ListScreen, incluido comuna y radios); un **toggle segmentado
  Lista|Mapa**; y si `comunaFiltro` → `<SeguirComunaButton comuna={comunaFiltro}/>`.
- [ ] Cuerpo: `vista==='lista'` → `<ReportesLista filtros navigation/>`; si `'mapa'` →
  `<ReportesMapa filtros navigation/>`.
- [ ] Aceptar `route.params.comuna` para pre-cargar `comunaFiltro` (useEffect sobre
  `route.params`, patrón de `PublishScreen`).
- [ ] `tsc` + `jest`. Commit.

## Task 6: Switchover de navegación (atómico) + borrar pantallas viejas

**Files:** Modify `src/navigation/TabNavigator.tsx`, `src/navigation/RootNavigator.tsx`,
`src/screens/PublishScreen.tsx`, `src/data/guiaPerdida.ts`. Delete `src/screens/ListScreen.tsx`,
`src/screens/MapScreen.tsx`, `src/screens/ComunidadScreen.tsx`.

- [ ] **`TabNavigator`**: crear `ExplorarStack` (native stack) con `Explorar` (ExplorarScreen)
  + `Encontre` + `PetDetail` + `AddSighting` + `Chat` + `PublicProfile`. Dejar 5 `Tab.Screen`:
  `Inicio, Explorar, Publicar, Adopcion, Perfil`. Eliminar los tabs `Mapa/Lista/Comunidad/
  Mensajes` y sus stacks. `TAB_ICONS` = `{Inicio:'home', Explorar:'search', Publicar:
  'add-circle', Adopcion:'paw', Perfil:'person'}`. Quitar el `porteroDeTab('contactar')` de
  Mensajes (el de Publicar queda). Mantener `MsgStack` definido (lo usa RootNavigator).
- [ ] **`RootNavigator`**: registrar `<Stack.Screen name="Mensajes" component={MsgStack}>`
  (importar `MsgStack` — moverlo/exportarlo desde TabNavigator o redefinirlo donde convenga;
  decisión de implementación, dejarlo compilando).
- [ ] **Reapuntar destinos** (spec §5): `PublishScreen:209` `'Mapa'`→`'Explorar'`;
  `guiaPerdida.ts` ruta `'Comunidad'`→`'Explorar'` (y `RUTAS_GUIA`). `grep -rn
  "navigate('Mapa'|'Lista'|'Comunidad')" src/` y reapuntar lo que quede (HomeScreen se toca
  en la tarea 7).
- [ ] **Borrar** `ListScreen.tsx`, `MapScreen.tsx`, `ComunidadScreen.tsx`. Confirmar con grep
  que no queda ningún import a esos archivos.
- [ ] `tsc` limpio + `jest` verde. Commit.

## Task 7: `HomeScreen` — destinos + `MensajesButton`, y `MensajesButton` en Adopción

**Files:** Modify `src/screens/HomeScreen.tsx`, `src/screens/AdopcionFeedScreen.tsx`

- [ ] `HomeScreen`: reapuntar `navigate('Lista')` (×3: líneas ~232, 244, 292) → `'Explorar'`;
  `navigate('Comunidad')` (~205, sección "En tu comuna") → `navigate('Explorar', { comuna })`
  con la comuna que esa sección ya conoce (si no la tiene a mano, `navigate('Explorar')` sin
  param). Agregar `<MensajesButton/>` en la fila superior del saludo (junto al avatar).
- [ ] `AdopcionFeedScreen`: agregar `<MensajesButton/>` en el encabezado (a la derecha del
  título "En adopción").
- [ ] `tsc` limpio + `jest` verde. Commit.

## Verificación final (tras las 7 tareas)

- `npx tsc --noEmit` limpio + `npx jest` verde.
- **Playwright (dev server), spec §Testing:** (1) barra con 5 pestañas sin apretarse; (2)
  Explorar abre en Lista → toggle a Mapa conserva filtros; (3) filtrar por comuna muestra
  "Avisarme de [comuna]"; (4) el ícono de Mensajes (con badge) abre la bandeja; (5) publicar
  vuelve a Explorar; (6) "En tu comuna" de Inicio abre Explorar filtrado.
- Revisión de rama buscando destinos de navegación rotos que hayan quedado (`navigate('Mapa'|
  'Lista'|'Comunidad'|'Mensajes')` residual) y que ninguna pantalla borrada siga importada.

## Self-review del plan (hecho)
- **Cobertura del spec:** cada sección tiene tarea (componentes 1–4; Explorar 5; switchover +
  borrado 6; Home/Adopción + Mensajes 7; verificación al final).
- **Orden seguro:** las piezas nuevas (1–5) no rompen nada; el switchover (6) es atómico y
  recién ahí se borran las viejas; Home (7) al final.
- **Sin placeholders.** **Tipos consistentes:** `FiltrosBusqueda`, `vista`, `comuna` param,
  `MensajesButton`/`Mensajes` route usados igual en plan y spec.

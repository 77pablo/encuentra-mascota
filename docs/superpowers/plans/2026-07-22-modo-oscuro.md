# Modo oscuro — Plan de implementación

> **For agentic workers:** conversión mecánica repetitiva. Cada tarea deja `tsc` limpio +
> `jest` verde. ORDEN: infra (1) primero; luego navegación/selector (3,4) y las conversiones
> (2,5,6,7) que dependen de que exista `ThemeProvider`; al final el gate de completitud (8) y
> el ajuste visual (9). Durante 1–7 se mantiene un alias `colors` para no romper el build.

**Goal:** Modo oscuro real (cambio en vivo, sigue el sistema, selector Automático/Claro/
Oscuro en Perfil), paleta oscura cálida.

**Architecture:** `ThemeProvider` + `useColors()` reemplazan al `colors` estático. Cada
componente con `StyleSheet.create` que use color pasa al patrón dinámico `crearEstilos(colors)`
+ `useMemo`. La navegación y la StatusBar siguen el esquema.

**Tech Stack:** Expo (RN+TS, web), React Navigation, jest.

## Global Constraints

- **Spec = fuente de verdad:** `docs/superpowers/specs/2026-07-22-modo-oscuro-design.md`
  (paleta, patrón de conversión verbatim, casos especiales).
- **Patrón de conversión** (verbatim del spec §3): dentro del componente
  `const colors = useColors(); const styles = useMemo(() => crearEstilos(colors), [colors]);`
  y `const crearEstilos = (colors: Colors) => StyleSheet.create({...})`. `spacing`/`radius`/
  `font`/`shadow` siguen estáticos. Usos inline de `colors.X` usan el valor del hook.
- **Red de seguridad:** el `colors` estático se **quita** en la Tarea 8; hasta entonces existe
  como alias `= lightColors` para no romper el build. `tsc` marca los archivos sin convertir.
- Antes de cada commit: `npx tsc --noEmit` limpio + `npx jest` verde.
- Copy/estética cálida; no inventar colores fuera de las dos paletas.
- Commits chicos; cerrar cada uno con
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Infraestructura de tema

**Files:** Modify `src/theme/index.ts`; Create `src/lib/temaPref.ts` (+ `__tests__/lib/temaPref.test.ts`),
`src/theme/ThemeProvider.tsx`; Modify `App.tsx`.

- [ ] `src/theme/index.ts`: definir `lightColors` (la paleta actual), `darkColors` (valores
  del spec §1), `export type Colors = typeof lightColors`, y **temporalmente**
  `export const colors = lightColors` (alias, se quita en Tarea 8). Mantener `radius`,
  `spacing`, `font`, `shadow`.
- [ ] `src/lib/temaPref.ts` (espeja `lastVisit.ts`, never-throws): `getTemaPref(): Promise<'auto'|'claro'|'oscuro'>`
  (default `'auto'`), `setTemaPref(v)`. Test: default `'auto'`, round-trip, no lanza.
- [ ] `src/theme/ThemeProvider.tsx`: contexto con `{ colors, modo, setModo, esquema }`. Carga
  `modo` async de `temaPref`; `useColorScheme()` para el sistema; resolución
  `esquema = modo==='auto' ? (sistema ?? 'light') : (modo==='claro' ? 'light' : 'dark')`;
  `colors = esquema==='dark' ? darkColors : lightColors`. Exporta `useColors()` y `useTheme()`.
  Extraer la resolución a una función pura `resolverEsquema(modo, sistema)` y testearla.
- [ ] `App.tsx`: montar `<ThemeProvider>` por encima de `SafeAreaProvider`, y `<StatusBar
  style={esquema==='dark'?'light':'dark'} />` (leer `esquema` con `useTheme` dentro de un
  subcomponente, ya que App está por fuera del provider — o exponer un `<AppStatusBar/>`).
- [ ] `tsc` + `jest`. Commit.

## Task 2: Convertir `src/ui` (13 componentes base)

**Files:** los 13 de `src/ui/`: `AppText, AvisoEstafa, Badge, Button, Card, Chip, Confetti,
EmptyState, ErrorState, Input, Loading, Screen, Squiggle`.

- [ ] Convertir cada uno al patrón dinámico (spec §3). Estos son la máxima palanca: al
  tematizar `Screen`/`Card`/`Button`/`AppText`/etc., gran parte de la app queda temática.
- [ ] `tsc` + `jest`. Commit.

## Task 3: Tema de navegación

**Files:** Modify `src/navigation/RootNavigator.tsx`, `src/navigation/TabNavigator.tsx`.

- [ ] `RootNavigator`: `useColors()`; `Stack.Navigator` con `screenOptions={{ headerStyle:
  { backgroundColor: colors.card }, headerTintColor: colors.ink, contentStyle: { backgroundColor:
  colors.bg } }}`. `NavigationContainer theme` derivado del `esquema` (DarkTheme/DefaultTheme
  con `colors.bg/card/ink/brand`).
- [ ] `TabNavigator`: `useColors()` para el `tabBarStyle`/tints (ya usa `colors`, pasa a
  dinámico). El `porteroDeTab`/badges siguen igual.
- [ ] `tsc` + `jest`. Commit.

## Task 4: Selector de apariencia en Perfil

**Files:** Modify `src/screens/ProfileScreen.tsx`.

- [ ] Fila "Apariencia" con 3 chips segmentados **Automático / Claro / Oscuro** (usa
  `useTheme().modo`/`setModo`). Cambio inmediato y en vivo. Ubicar cerca de los otros ajustes.
- [ ] `tsc` + `jest`. Commit.

## Task 5: Convertir `src/components` (10)

**Files:** `AfichePoster, CollarTag, ComunaPickerModal, MensajesButton, NudgeVigencia,
PetCard, ReportesLista, ReportesMapa, SeguirComunaButton, ZoneAlertBanner`.

- [ ] Convertir al patrón dinámico. **`CollarTag` y `AfichePoster` son assets IMPRIMIBLES**
  (se renderizan a PNG): deben quedar SIEMPRE en paleta clara, no seguir el tema. Usar
  `lightColors` fijo ahí (importado directo), documentado. Los demás siguen el tema.
- [ ] `tsc` + `jest`. Commit.

## Task 6: Convertir pantallas — lote 1 (15)

**Files:** `HomeScreen, ExplorarScreen, AdopcionFeedScreen, AdopcionDetailScreen, PetDetailScreen,
ChatScreen, ConversationsScreen, ProfileScreen, PublishScreen, PublicarAdopcionScreen,
EditPetScreen, EncontreScreen, MyPetsScreen, GuardadosScreen, PublicProfileScreen`.

- [ ] Convertir al patrón dinámico. Auditar `colors.white` como `backgroundColor`:
  `AdopcionDetailScreen`/`AdopcionFeedScreen` → `colors.card`.
- [ ] `tsc` + `jest`. Commit.

## Task 7: Convertir pantallas — lote 2 (15)

**Files:** `AddSightingScreen, AlertZoneScreen, AyudaScreen, CollarScreen, DeleteAccountScreen,
GuiaPerdidaScreen, LegalScreen, NotificationPrefsScreen, OnboardingScreen, PublicPetScreen,
VolvieronACasaScreen, auth/LoginScreen, auth/RegisterScreen, auth/ForgotPasswordScreen,
auth/ResetPasswordScreen`.

- [ ] Convertir al patrón dinámico.
- [ ] `tsc` + `jest`. Commit.

## Task 8: Gate de completitud (quitar el alias)

**Files:** Modify `src/theme/index.ts` + los stragglers que marque `tsc`.

- [ ] Quitar `export const colors = lightColors` de `src/theme/index.ts`.
- [ ] `npx tsc --noEmit`: cada error es un archivo/uso sin convertir → convertirlo. Repetir
  hasta `tsc` limpio (garantiza que NINGUNA pantalla quedó en claro por olvido).
- [ ] `grep -rn "colors.white" src/` y confirmar que no quede `colors.white` como superficie
  (salvo texto-sobre-color). `jest` verde. Commit.

## Task 9: Ajuste visual de la paleta oscura

- [ ] Levantar el dev server (background), Playwright con `emulateMedia(colorScheme='dark')`
  (modo Automático) — capturar Inicio, Explorar, Adopción, detalle, chat, Perfil, onboarding
  en **oscuro**; y las mismas en **claro**. Revisar contraste/legibilidad.
- [ ] Ajustar los valores de `darkColors` donde haga falta (contraste de `brand`/`found`/`lost`
  sobre `bg`/`card`, texto `ink`/`muted`, bordes `line`). Re-capturar. Commit.
- [ ] Verificar el selector: Automático/Claro/Oscuro cambian en vivo.

## Self-review del plan (hecho)
- **Cobertura:** infra (1), ui (2), navegación (3), selector (4), components (5), pantallas
  (6,7), gate de completitud (8), ajuste visual (9). Los 53 archivos con tema están en 2/5/6/7.
- **Orden seguro:** el alias `colors` mantiene el build hasta la Tarea 8, que es el gate.
- **Casos especiales:** CollarTag/AfichePoster imprimibles quedan claros (Tarea 5); auditoría
  `colors.white` (Tareas 6 y 8).
- **Tipos:** `Colors`, `useColors`, `useTheme`, `resolverEsquema`, `modo` usados igual en plan
  y spec.

# Modo oscuro — diseño

**Fecha:** 2026-07-22
**Estado:** aprobado, listo para plan

## Objetivo

Modo oscuro **de verdad**: cambia en vivo, sigue el sistema por defecto, y un selector
**Automático / Claro / Oscuro** en Perfil (persistido). Paleta oscura cálida (no negro puro),
coherente con la identidad de la app (pino + arena).

## La trampa técnica (por qué es un refactor transversal)

Hoy `src/theme/index.ts` exporta `colors` como objeto estático, y **~51 archivos** lo usan
dentro de `StyleSheet.create` **a nivel de módulo**: el color se "hornea" una vez al importar
el módulo y no cambia nunca. Para que el tema cambie en runtime, esos estilos deben
**recalcularse en render** con el color actual. No hay atajo: es conversión archivo por
archivo (mecánica). Todos los importadores son componentes (ninguno en `src/lib`), así que el
hook `useColors()` se puede usar en todos.

**Red de seguridad:** al **renombrar** el `colors` estático (a `lightColors`/`darkColors`) y
NO reexportar `colors`, TypeScript marca cada archivo sin convertir. La conversión es, entonces,
"dejar `tsc` en verde otra vez" — determinística, no se escapa ninguna pantalla.

## Arquitectura

### 1. Paleta (`src/theme/colors.ts` o en `index.ts`)

`radius`, `spacing`, `font`, `shadow` **no cambian** con el tema (se siguen exportando
estáticos). Solo cambian los colores. Se definen dos paletas con las **mismas claves**:

```ts
export const lightColors = { /* la actual, sin cambios */ };
export const darkColors = {
  brand: '#2FA07A', brandDark: '#25795D', sun: '#F0B84A',
  lost: '#EE7350', found: '#3FB98C',
  ink: '#F2EEE3',  muted: '#A29C8C', line: '#332F26',
  bg: '#16150F',   card: '#242119',  sky: '#1E2A24', white: '#FFFFFF',
};
export type Colors = typeof lightColors;
```
(Los valores oscuros son un punto de partida; se afinan con capturas.)

### 2. Estado y persistencia del tema

- `src/lib/temaPref.ts` (espeja `lastVisit.ts`, never-throws): `getTemaPref()` →
  `'auto' | 'claro' | 'oscuro'` (default `'auto'`), `setTemaPref(v)`.
- `src/theme/ThemeProvider.tsx`:
  - Estado `modo` (cargado async de `temaPref`), `useColorScheme()` para el sistema.
  - `esquema: 'light' | 'dark'` = `modo === 'auto' ? (sistema ?? 'light') : (modo === 'claro' ? 'light' : 'dark')`.
  - `colors = esquema === 'dark' ? darkColors : lightColors`.
  - Provee por contexto `{ colors, modo, setModo, esquema }`. `setModo` persiste + actualiza.
- Hooks: `useColors(): Colors` y `useTheme(): { colors, modo, setModo, esquema }`.
- Se monta en `App.tsx` **por encima** de todo (y del `SafeAreaProvider`).

### 3. Patrón de conversión (mecánico, por archivo)

Antes (estático):
```tsx
import { colors, spacing } from '../theme';
export default function X() { return <View style={styles.box} />; }
const styles = StyleSheet.create({ box: { backgroundColor: colors.card } });
```
Después (dinámico):
```tsx
import { spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import type { Colors } from '../theme';
export default function X() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return <View style={styles.box} />;
}
const crearEstilos = (colors: Colors) =>
  StyleSheet.create({ box: { backgroundColor: colors.card } });
```
Reglas:
- Los usos **inline** de `colors.X` (p. ej. `<Ionicons color={colors.brand}>`) ya usan el
  valor del hook, sin cambios adicionales.
- `spacing`/`radius`/`font`/`shadow` siguen importándose estáticos.
- Un archivo que use `colors` **solo** inline (sin StyleSheet con color) solo suma el hook.

### 4. Los componentes de `src/ui` primero (máxima palanca)

Los 13 componentes base (`Screen`, `Card`, `Button`, `AppText`, `Title`, `Chip`, `Input`,
`EmptyState`, `ErrorState`, `Loading`, `Badge`, `Mascota`, `AvisoEstafa`…) se convierten
primero: como todas las pantallas los usan, gran parte de la app queda temática de una. Luego
las 40 pantallas/components restantes (sus StyleSheets locales).

### 5. Navegación y StatusBar

- **`RootNavigator`** (componente): `useColors()`; el `Stack.Navigator` toma
  `screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.ink,
  contentStyle: { backgroundColor: colors.bg } }}` (los headers nativos y el fondo entre
  pantallas siguen el tema). `NavigationContainer` recibe un `theme` derivado de `esquema`
  (DarkTheme/DefaultTheme con `colors.bg`/`card`/`ink`/`brand`).
- **`TabNavigator`**: ya usa `colors` para tint/tabBarStyle; con `useColors` queda dinámico.
- **StatusBar** (expo): `<StatusBar style={esquema === 'dark' ? 'light' : 'dark'} />` en App.

### 6. Selector en Perfil

En `ProfileScreen`, una fila "Apariencia" con 3 chips segmentados **Automático / Claro /
Oscuro** que llaman `setModo`. Se guarda local; el cambio es inmediato y en vivo.

## Casos especiales / auditoría

- **`colors.white` como `backgroundColor`** (3 archivos): en oscuro, un fondo blanco es un
  bug. Auditar cada uno:
  - `AdopcionDetailScreen:471`, `AdopcionFeedScreen:431` → pasar a `colors.card`.
  - `CollarTag.tsx:123` → **NO tocar / mantener claro**: es un asset **imprimible** (la placa
    del collar se renderiza a PNG para imprimir); debe verse claro sí o sí, independiente del
    tema de la app. Si al convertir el archivo queda temático, forzar la paleta clara ahí (o
    usar valores fijos, no el hook) — dejarlo documentado.
- **`shadow`**: su `shadowColor` es fijo; en oscuro casi no se ve, es aceptable (no se agrega
  variante oscura en v1).
- **Fotos/ilustraciones**: no cambian; se ven sobre el fondo oscuro sin problema.

## Testing

- `temaPref.ts`: get/set (mock storage), default `'auto'`, never-throws.
- `ThemeProvider`: la resolución `modo`+sistema → `esquema` correcta (auto sigue el sistema;
  claro/oscuro fuerzan). Test de la función pura de resolución si se extrae.
- `tsc --noEmit` limpio (la red de seguridad: 0 usos del `colors` viejo) + `jest` verde.
- **Verificación visual (Playwright)** con capturas en **claro y oscuro** de las pantallas
  principales (Inicio, Explorar, Adopción, detalle, chat, Perfil, onboarding), para afinar la
  paleta oscura. `emulateMedia(colorScheme='dark')` para el modo Automático, y el selector
  para el manual.

## Archivos

- Create: `src/theme/ThemeProvider.tsx`, `src/lib/temaPref.ts` (+ tests).
- Modify: `src/theme/index.ts` (paletas + tipo, quita el `colors` estático), `App.tsx`
  (ThemeProvider + StatusBar), `src/navigation/RootNavigator.tsx` + `TabNavigator.tsx`
  (tema de navegación), `ProfileScreen.tsx` (selector), y **los ~51 archivos con StyleSheet**
  (conversión al patrón dinámico) — guiado por `tsc`.

## Fuera de alcance (YAGNI)

- Temas por pantalla o múltiples paletas. Variante oscura del `shadow`. Animación de
  transición al cambiar de tema. Programar el modo por horario.

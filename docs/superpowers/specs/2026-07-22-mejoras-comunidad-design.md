# Mejoras de comunidad (3) — diseño

**Fecha:** 2026-07-22
**Estado:** aprobado, listo para implementar (inline)

Tres funciones independientes, client-side, sin credenciales nuevas. El **modo oscuro** se
hace aparte después (refactor transversal del tema). Se implementan **inline** porque
comparten `RootNavigator`/`HomeScreen` (evita choques de merge).

## 1. 🏥 Ayuda rápida (veterinarias y refugios)

Pantalla `AyudaScreen` (ruta `Ayuda`, header nativo con botón de volver). Contenido cálido:

- **Acciones que abren el mapa del teléfono** con la búsqueda ya hecha (siempre actualizado,
  cero mantenimiento). Helper `src/lib/mapas.ts` → `abrirBusquedaMapa(query)` usa
  `Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query))`
  (abre la app de mapas en móvil y el navegador en web). Botones:
  - "Veterinarias cerca" → `veterinaria`
  - "Veterinaria de urgencia (24h)" → `veterinaria urgencia 24 horas`
  - "Refugios y rescatistas" → `refugio de animales`
- **Recursos nacionales (Chile):** enlace al **Registro Nacional de Mascotas** (Ley 21.020
  "Cholito", `https://registratumascota.cl`) y una nota de contactar la **municipalidad**
  (tenencia responsable). Enlaces con `Linking.openURL`.
- **Qué preguntar / qué llevar:** checklist breve (señas, foto, número de chip si tiene).

**Entradas:** (a) un paso/acción en la guía "recién se me perdió" (`guiaPerdida.ts`: el paso
"Llama a veterinarias y refugios" pasa a tener `accion` a `Ayuda`, sumando `'Ayuda'` a
`RUTAS_GUIA`); (b) una entrada "Ayuda y recursos" en Perfil. Registrar `Ayuda` en el stack
raíz (`headerShown: true, title: 'Ayuda'`), alcanzable por burbujeo desde la guía y Perfil.

## 2. 👋 Onboarding de bienvenida

Se muestra **solo en el primer arranque**. `src/lib/onboarding.ts` (espeja `lastVisit.ts`:
localStorage web / SecureStore móvil, never-throws) con `getOnboardingVisto()` /
`setOnboardingVisto()`.

`OnboardingScreen`: pager horizontal de **4 slides** (con puntos), cada una con ilustración
(reusar `Mascota`/Ionicons + tokens, nada nuevo) y texto:
1. Bienvenida — "Encuentra tu Mascota. El barrio ayuda a que vuelva a casa."
2. Publicá y explorá — reportá una perdida/encontrada y mirá lo que pasa cerca.
3. Adopción — mascotas buscando hogar, estilo feed.
4. Avisos — te avisamos cuando aparece algo que calza cerca tuyo.

Botones: **"Saltar"** (arriba, siempre) y **"Siguiente"** / en la última **"Empezar"**. Ambos
marcan `setOnboardingVisto()` y cierran.

**Enganche (gate en `RootNavigator`):** además del `loading` de auth, cargar
`onboardingVisto` async. Mientras carga, spinner. Si `!onboardingVisto && !recovering`,
renderizar `OnboardingScreen` (a pantalla completa) con un callback `onListo` que setea el
flag + `setState` para desmontarlo y seguir a la app. No toca la navegación normal.

## 3. 🏡 Sección "Volvieron a casa"

Pantalla `VolvieronACasaScreen` (ruta `VolvieronACasa`, header nativo con volver): galería de
reencuentros. Usa `listFinalesFelices(50)` (ya existe, `limit` param). Cada tarjeta: foto
(`final_foto || fotos[0]`), nombre (o especie), `reunionLabel(p)`, y la historia
`final_feliz` si la hay. Empty state cálido si no hay ninguno. Scroll simple (o FlatList).

**Entrada:** en `HomeScreen`, en el encabezado de la tira "Finales felices" (`finalesHeader`),
sumar un "Ver todas" → `navigation.navigate('VolvieronACasa')`. Registrar `VolvieronACasa` en
el stack raíz (`headerShown: true, title: 'Volvieron a casa'`).

## Navegación (compartido — se hace de una, inline)

`RootNavigator` registra 3 pantallas nuevas en el stack raíz, todas con header nativo
(botón de volver): `Ayuda`, `VolvieronACasa`. (Onboarding es un gate, no una ruta.) Todas
alcanzables por burbujeo desde donde se llaman (guía, Perfil, Home), patrón de `GuiaPerdida`.

## Testing

- `mapas.ts`: arma bien la URL (encode del query).
- `onboarding.ts`: get/set (mock storage), never-throws.
- No hay render-tests de pantallas en el repo (no inventar).
- `tsc --noEmit` limpio + `jest` verde.
- Verificación visual (Playwright): onboarding aparece en primer arranque y no vuelve;
  Ayuda abre desde la guía/Perfil y los botones disparan `Linking`; "Volvieron a casa" abre
  desde Inicio y muestra la galería (o su empty state).

## Archivos

- Create: `src/screens/AyudaScreen.tsx`, `src/screens/OnboardingScreen.tsx`,
  `src/screens/VolvieronACasaScreen.tsx`, `src/lib/mapas.ts`, `src/lib/onboarding.ts`
  (+ tests de los dos lib).
- Modify: `src/navigation/RootNavigator.tsx` (registrar 2 rutas + gate de onboarding),
  `src/screens/HomeScreen.tsx` ("Ver todas" en la tira), `src/data/guiaPerdida.ts` (paso de
  vets con acción a `Ayuda` + `RUTAS_GUIA`), `src/screens/ProfileScreen.tsx` (entrada "Ayuda
  y recursos").

## Fuera de alcance (YAGNI)

- Lista curada de vets por comuna (se descartó a favor del mapa en vivo). Onboarding que
  reaparece o con video. Compartir una historia de reencuentro a redes. Editar la historia
  del reencuentro desde la galería.

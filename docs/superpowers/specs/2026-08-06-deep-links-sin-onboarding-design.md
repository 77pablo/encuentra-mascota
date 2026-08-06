# Deep links saltean el onboarding (sin marcarlo visto)

**Fecha:** 6-ago-2026 · **Aprobado por:** Pablo (en el chat) · **Tamaño:** chico, inline

## Problema

El QR del collar (y todo deep link público: `/mascota/:id`, `/collar/:token`,
`/adopcion/:id`, `/cuadrilla/:token`) aterriza en el onboarding de 4 pantallas
cuando el dispositivo nunca lo vio. El deep link SE RESPETA al tocar «Saltar»
(verificado el 5-ago), pero el vecino que encuentra una mascota ve un tutorial
antes que al animal — el peor momento para un tutorial. Anotado en ESTADO.md
como pendiente de la tanda 15 («bug 3, UX»).

Mecanismo: cuando `!onboardingVisto`, `RootNavigator` devuelve
`<OnboardingScreen>` en lugar del árbol y el `NavigationContainer` — que es
quien lee la URL inicial vía `linking` — ni se monta.

## Decisión de producto (Pablo, 6-ago)

Llegar por link muestra el contenido directo **sin marcar el onboarding como
visto**: la bienvenida queda pendiente y aparece por única vez en la próxima
visita normal (portada). Se descartó darlo por visto (pierde la bienvenida
quien se queda) y dejarlo como está.

## Diseño

- **`src/lib/deepLinks.ts`** (nuevo, puro): `rutasDeLinkPublico(config)`
  deriva los prefijos de ruta (`mascota/`, `collar/`, …) de los `screens` del
  MISMO `linking.config` que usa el `NavigationContainer` — sin lista paralela
  que se pueda desincronizar; una ruta pública nueva queda cubierta sola.
  `esRutaDeLinkPublico(pathname, rutas)` matchea por segmento completo
  (`/mascota/abc` sí; `/mascotas-x` no; `/` no).
- **`RootNavigator`**: estado `llegoPorLink` determinado al montar — en web
  con `window.location.pathname` (síncrono); en nativo con
  `Linking.getInitialURL()` (async; mientras no se sepa vale el spinner que ya
  existe). El gate del onboarding suma la condición:
  `!onboardingVisto && !recovering && !llegoPorLink`.
- **El flag NO se escribe** en ese camino. `recovering` (recuperar contraseña)
  ya tenía prioridad y no cambia.
- **Errores:** si leer la URL falla, `llegoPorLink = false` → comportamiento
  de hoy (onboarding). Nunca rompe.

## Tests

- Unitarios de `deepLinks.ts` **importando el `linking.config` real** (no una
  copia): deriva los 4 prefijos actuales; matchea `/mascota/abc`,
  `/collar/xyz`; rechaza `/`, `/mascotas-x`, `/App/Inicio`.
- E2E contra el `dist` compilado con localStorage virgen:
  `/mascota/<id-inexistente>` muestra el mensaje de reporte inexistente (no el
  onboarding) y la portada `/` sigue mostrando el onboarding.

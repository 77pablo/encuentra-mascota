# Tanda 9 — Retención y agujeros (diseño)

**Fecha:** 1-ago-2026 · **Rama base:** `feat/mvp-encuentra-mascota` (`721e93d`)
**Línea de base medida antes de empezar:** 1139 tests / 98 suites en verde, `tsc` 0 errores.

⚠️ **Este spec se escribió y se ejecutó sin las aprobaciones intermedias de Pablo**, a pedido suyo
(se fue a dormir mientras se trabajaba). Cada decisión de producto que tomé sola está marcada con
**[decisión mía]** y justificada, para que pueda revisarlas y revertir lo que no le guste. Está todo
en git.

---

## 1. El encuadre que fijó Pablo

| | |
|---|---|
| **Objetivo** | Retención **+** cerrar agujeros |
| **A quién retener** | Los tres: el vecino que no perdió nada · el que está buscando ahora · el que ya la encontró |
| **Avisos** | Solo cuando pasa **un hecho real**, más un resumen periódico apagable. **Nada de "hace rato que no entrás"** |
| **Tamaño** | Grande. Recortado a **3 implementadores** por presupuesto de cuota semanal (71% consumido al empezar) |

**Regla de avisos, sostenida en todo el diseño:** ningún aviso de esta tanda es de reenganche. Cada
uno reporta algo que efectivamente pasó (tu reporte está por vencer, alguien te agradeció). Si no hay
hecho, no hay aviso.

## 2. El hallazgo que ordena la tanda

La auditoría del código encontró que **los agujeros y la retención son el mismo problema**. Los tres
casos más caros:

- **El que recupera su mascota desde el Perfil no queda registrado como reencuentro** (A2). No suma
  al contador de Inicio, ni a la tarjeta de impacto, ni a la galería "Volvieron a casa". Con la base
  casi vacía, cada reencuentro perdido es prueba social que no tenemos.
- **Inicio le miente al usuario nuevo** (A8): la sección se llama "Cerca de ti" pero pide reportes
  sin ubicación, así que muestra todo Chile; y los cuatro chips no filtran nada.
- **Una comuna vacía recibe "soltá algún filtro"** (A9) en vez de una acción. Es lo que ve el 100% de
  los usuarios nuevos en una app que todavía no tiene datos.

Ninguno de los tres es una función faltante: son promesas incumplidas. Arreglarlos da retención más
barata que cualquier función nueva.

## 3. Alcance: 3 tareas, agrupadas por archivo

Agrupadas **por archivo tocado, no por tema**, para que los tres worktrees no colisionen en la
fusión. `ProfileScreen` entero queda en la tarea A; `PetDetailScreen` entero en la B; `HomeScreen` y
los vacíos en la C.

### Tarea A — El que ya la encontró (y el Perfil)

| Id | Qué | Migración |
|---|---|---|
| **A2** | `closePet` registra el reencuentro, no solo `activo=false`. Hoy el camino bueno (`markReunited`) solo existe en `PetDetailScreen`. Además el Perfil etiqueta **"REUNIDA"** a cualquier reporte inactivo: es una etiqueta falsa | no |
| **B5** | Cerrar el círculo tras el reencuentro: agradecer a quien dejó la pista o el avistamiento, y **mostrarle al usuario sus propias insignias** (`insignias.ts` hoy solo se renderiza en el perfil ajeno: nunca ves las tuyas) | no |
| **A7** | En el Perfil, "no tenés nada" y "no pudimos leerlo" se ven igual. **Cuarta aparición** del mismo patrón; el propio comentario del código lo admite y no hace nada | no |
| **A10** | Pantalla "Mis comunas": seguís comunas, te llegan avisos, y no hay dónde verlas ni sacarlas. Hoy el botón vive escondido en un panel de filtros colapsado | no |
| **A13** | Borrás la cuenta y te quedás parado en la misma pantalla, con el botón rojo rehabilitado; un segundo toque choca contra un 401 | no |

### Tarea B — El que está buscando ahora

| Id | Qué | Migración |
|---|---|---|
| **A1** 🔴 | **Va primero.** El botón "Contactar" de la página pública de una mascota está **muerto**: navega al tab `'Mapa'`, que dejó de existir en julio. Es el destino de **todo push de reporte y todo link compartido** — o sea, el flujo del QR del afiche. Verificado a mano | no |
| **A5** | Nadie avisa que un reporte se vence. A los 45 días sale de las búsquedas **y del motor de coincidencias**, en silencio. El nudge actual solo se pinta si el dueño abre su propia ficha | según camino |
| **A11** | Una pista falsa no se puede borrar (`deleteSighting` existe y no lo llama nadie) y una coincidencia equivocada vuelve para siempre | no (borrar) |
| **A14** | Un corte de red al escanear el QR del collar le dice al vecino que la placa no existe, **sin ningún botón de reintento**. Es el momento de máxima urgencia del producto | no |
| **A15** | En "Encontré una mascota", un error deja la pantalla **en blanco e irreintentable** (nunca se pone `buscado`, y el efecto no re-dispara con la misma especie) | no |
| **A17** | Una denuncia que sí se registró se informa como fallida (el `bloquear` va dentro del `try` de `denunciar`), y la rama feliz no avisa nada. Duplicado en dos archivos | no |

### Tarea C — El vecino que no perdió nada (y el vacío inicial)

| Id | Qué | Migración |
|---|---|---|
| **A8** | Inicio miente dos veces: "Cerca de ti" sin pasar ubicación, y cuatro chips que navegan sin parámetros con el activo fijo en el primero | no |
| **A9** | El vacío inicial no ofrece salida: `EmptyState` no admite acción, y una comuna sin datos recibe el mensaje de "buscaste mal". **[decisión mía]** el vacío pasa a ofrecer *seguir esta comuna* / *publicar el primero* | no |
| **A16** | "Mis búsquedas" con error de red dice que no guardaste ninguna (mismo patrón que A7) | no |
| **A19** | El interruptor de "reportes en mi zona" no apaga los avisos si seguís una comuna. Es deliberado, pero no está dicho en ninguna parte y no hay dónde ver las comunas → se explica en la pantalla de A10 | no |

## 4. Decisiones que tomé sola

- **[decisión mía] Ninguna migración en esta tanda, salvo que A5 la necesite.** Con la web sin subir y
  el bundle de producción atrasado, sumar migraciones agranda el orden de despliegue y el riesgo de
  que algo quede a mitad si se corta la cuota. Todo lo elegido es de cliente.
- **[decisión mía] B3 (bandeja de avisos in-app) queda FUERA**, aunque era top 4 y es la función de
  retención más fuerte. Es medio-grande, lleva migración y RPC nueva, y no entra en el presupuesto de
  cuota sin poner en riesgo el cierre de los agujeros. Queda documentada como la primera candidata de
  la próxima tanda. Gana peso porque hoy nada en la app lee `notification_events`.
- **[decisión mía] B1 (señas estructuradas: color, tamaño, chip)** queda fuera por lo mismo:
  migración + RPC de coincidencias + tres pantallas. Es la que más subiría la **calidad** del
  matching, así que va segunda en la lista de la próxima.
- **[decisión mía] Biometría de hocico: descartada, con evidencia.** El "99% de precisión" que repite
  toda la industria sale de un único paper de 2021 cuyo coautor es el CTO del proveedor y cuyos datos
  aportó el proveedor. El único benchmark independiente que existe (CVPR 2022) dejó a un equipo
  especialista en **86,67% AUC**. Las reseñas reales muestran que lo que falla es **la captura de la
  foto**, no el reconocimiento. Y no tiene validez legal para registro en ningún país, ni siquiera en
  Corea, que "lo está pilotando" desde 2022. No se vuelve a evaluar salvo que cambie algo de esto.

## 5. Lo que NO entra (y por qué)

| Qué | Por qué |
|---|---|
| A3, A4, B7, B8 (adopción) | Adopción necesita una tanda propia: le falta ciclo de vida, avisos, "mis publicaciones" y perfil público. Meterle parches sueltos ahora la deja igual de coja |
| A12 (callejón de la suspensión) | Depende del correo de contacto → dominio → nombre. Bloqueado por afuera |
| A18 (`enviados` se descarta) | **Verifiqué que el agente exageró**: con un 403 de Brevo la función *lanza*, y el evento sí queda en `error` con su detalle. Lo que queda es menor (`enviado` significa "no explotó") y se arregla junto con B3 |
| A6 (`send-push` no lee las prefs) | Toca una Edge Function → obliga a redesplegar. Va con B3, que también las toca |
| B2, B4, B6 | Funciones nuevas; esta tanda es de agujeros |

## 6. Verificación

- `tsc` 0 errores y la suite completa en verde, comparada contra la línea de base **1139 / 98**.
- **Cada arreglo con su test**, y los tests comprobados **contra mutación**: si se revierte el
  arreglo, el test tiene que ponerse rojo. Ya nos pasó dos veces escribir tests tautológicos que
  bendecían el bug.
- **A1 lleva además el arreglo del guardián**: el test de navegación existente
  (`__tests__/navigation/navegacionDesdeElRaiz.test.ts`) solo detecta navegaciones *peladas*, y por
  eso dejó pasar la forma anidada `navigate('App', { screen: 'Mapa' })` con un tab inexistente. El
  test tiene que **validar los nombres contra los navigators reales**, no contra una lista escrita a
  mano en el mismo archivo.
- **Revisión final adversarial de rama** al fusionar: es la que históricamente encuentra lo que se
  cae *entre* las tareas, y en esta tanda hay tres pantallas tocadas por más de un frente.
- Verificación visual con Playwright contra `localhost:8091` de los caminos que cambian de forma
  visible (Inicio, vacío de comuna, Perfil, collar).

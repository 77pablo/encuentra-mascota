# Guía "recién se me perdió" — diseño

**Fecha:** 2026-07-21
**Estado:** aprobado, listo para plan
**Parte de:** tanda de 4 funciones en paralelo (ver `2026-07-21-tanda-4funciones-coordinacion.md`)

## Problema

Cuando a alguien se le pierde la mascota está angustiado y no sabe qué hacer primero. La app
lo ayuda a publicar, pero no lo **acompaña**. Una guía calmada de la primera hora —qué hacer,
en qué orden, a quién avisar— es mucho valor humano con poco código.

## Decisión de producto (aprobada)

- **Dónde vive:** entrada desde **Inicio**, y **se ofrece sola** apenas publicás una
  *perdida* (el momento de más angustia).
- Contenido accionable, tono calmado. **Sin migración, puro cliente.**

## Arquitectura

### Contenido (`src/data/guiaPerdida.ts`)

Lista de pasos, como datos (no hardcodeados en la UI), para poder testear y reordenar. Cada
paso: `id`, `titulo`, `detalle`, y opcionalmente una `accion` que engancha con algo que la
app ya hace. Borrador de pasos (a pulir en implementación, tono cálido chileno sin caer en
lo infantil):

1. **Respirá y buscá cerca primero** — la mayoría aparece a pocas cuadras; revisá
   escondites, llamá con su tono de siempre.
2. **Publicá el reporte** — acción → abre Publicar (si aún no lo hizo).
3. **Difundí con el afiche** — acción → "Crear afiche" (ya existe) para pegar e imprimir.
4. **Avisá a tu barrio** — acción → seguir tu comuna / compartir el reporte (ya existen).
5. **Llamá a veterinarias y refugios cercanos** — qué preguntar; recordá el número de chip
   si lo tenés (enlaza con "Mi mascota" si está la func. 2).
6. **Revisá avistamientos y coincidencias** — acción → tu reporte; recordá que te avisamos
   si aparece algo que calza (enlaza con func. 1).
7. **No te rindas los primeros días** — muchas vuelven; mantené el reporte al día
   (enlaza con el ciclo de vida de la func. 3).

Los pasos que "enlazan" con otras funciones de la tanda deben degradar bien si esa función
todavía no está mergeada: son solo texto + navegación a pantallas que ya existen (Publicar,
afiche, comuna). No dependen del código nuevo de las otras funciones.

### Pantalla `GuiaPerdidaScreen`

- Renderiza los pasos como checklist. **Estado local** (marcado/desmarcado) en AsyncStorage
  con una clave por usuario (o global si es más simple; es solo una ayuda visual, no dato
  sensible). Reusa los componentes de UI existentes (`src/ui`).
- Cabecera cálida y breve. Cada paso con su acción como botón/enlace cuando corresponde.
- Accesible en **modo invitado** (alguien puede estar mirando sin cuenta); las acciones que
  requieren cuenta ya pasan por `useRequireAuth`.

### Enganches

- **Inicio (`HomeScreen`):** una entrada discreta pero visible, del tipo *"¿Se te perdió tu
  mascota? Guía paso a paso"* → `GuiaPerdidaScreen`. ⚠️ **Colisión con func. 3** (que también
  toca Inicio con su nudge) — se resuelve en el merge (secciones distintas de la pantalla).
- **Después de publicar una perdida (`PublishScreen.onSubmit`):** al completar con
  `estado='perdida'`, en vez de solo volver, ofrecer la guía (un `notify`/navegación suave:
  *"Listo. ¿Querés una guía de qué hacer ahora?"* → sí abre `GuiaPerdidaScreen`, no vuelve al
  detalle). No interrumpir si es *encontrada*. ⚠️ **Colisión con func. 2** (que también toca
  `PublishScreen`, para pre-cargar desde la ficha) — merge.

## Casos borde / decisiones

- **Sin acoplar a las otras funciones:** la guía funciona sola. Los pasos que mencionan
  coincidencias/mi-mascota/ciclo son texto + navegación a pantallas ya existentes; si esas
  funciones no estuvieran, el paso sigue teniendo sentido (o se omite el enlace). Esto la
  hace la función más segura para paralelizar.
- **Persistencia del checklist:** puramente cosmética; si falla AsyncStorage, la guía se ve
  igual, todo desmarcado. No bloquear el render por el estado.
- **No es contenido legal/médico:** son consejos prácticos, sin promesas. Evitar afirmar
  cosas veterinarias categóricas.

## Testing

- `guiaPerdida.ts`: la estructura de datos es válida (ids únicos, campos requeridos).
- Render de `GuiaPerdidaScreen` (smoke) con los componentes de UI.
- Manual: publicar una perdida → aparece el ofrecimiento; publicar una encontrada → no
  aparece; entrada desde Inicio funciona; marcar pasos persiste al volver.

## Archivos

- `src/data/guiaPerdida.ts` + `.test.ts` (nuevos)
- `src/screens/GuiaPerdidaScreen.tsx` (nuevo)
- `src/screens/HomeScreen.tsx` (entrada — archivo conflictivo, merge con func. 3)
- `src/screens/PublishScreen.tsx` (ofrecer tras publicar perdida — conflictivo, merge con func. 2)
- Navegación: registrar `GuiaPerdida`.

## Fuera de alcance (YAGNI)

- Contenido dinámico desde el servidor. Guía para "encontré una mascota" (esta es solo para
  el que perdió). Traducciones. Analítica de qué pasos se completan.

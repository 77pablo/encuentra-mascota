# Tanda 17 — Tipo "robada"

**Fecha:** 6-ago-2026 · **Aprobación:** Pablo eligió "robada" entre los 3 ítems de T17 y aprobó el
enfoque de MARCA (no estado nuevo) + luz verde al diseño en el chat. **Sin costo:** Supabase free +
código; el robo de mascotas está al alza en Chile (memo legal: publicar dirección + robo al alza).

## Decisión de diseño: MARCA booleana, no un tercer estado
`pets.estado` es un enum `pet_estado` con dos valores y **~25 usos con lógica binaria**
(`estado === 'perdida' ? lost : found`, `estado !== 'perdida'` como guardas). Un tercer estado
rompería todos esos ternarios en silencio (una robada se pintaría "Encontrada"). Por eso: una
mascota robada **sigue siendo `estado='perdida'`** para buscador, matching, plan y colores; se
agrega `pets.robada boolean`. Solo cambian la ETIQUETA y la GUÍA.

## Función 1 — Migración (aditiva, ensayada)
- `alter table public.pets add column if not exists robada boolean not null default false;`
  Aditiva y degrada: reportes viejos = `false`.
- **Recrear `buscar_reportes`** para que el feed pueda pintar el badge. ⚠️ Recrear desde el
  **CUERPO VIVO de la base** (traído por `pg_get_functiondef` el 6-ago), NO desde la 0028: la versión
  viva tiene 16 parámetros con `p_color`/`p_tamano` (señas, 0054/0055) que la 0028 no tiene —
  recrear desde la 0028 revertiría el filtro de señas en silencio. El cambio es MECÁNICO: `drop
  function` con la firma de 16 params, `create` con el mismo cuerpo verbatim + `robada boolean` en el
  `RETURNS TABLE`, `p.robada` en el `select` de `calc` y en el `select` final. **Cero cambios en el
  WHERE/cursor/order** (ahí vivían los bugs históricos). La firma de parámetros NO cambia (robada no
  es filtro, es columna devuelta).
- Ensayo en `begin…rollback` con asserts (columna existe; la RPC devuelve `robada`; un reporte
  marcado sale con `robada=true`; controles: paginación por cursor sigue devolviendo filas, filtro de
  señas sigue funcionando) + verificación después de aplicar.

## Función 2 — Publicar / Editar
En `PublishScreen` (y el camino de edición), cuando el estado seleccionado es **Perdida**, aparece
una casilla **"Me la robaron"** (`robada`, default false). No es un estado: el reporte se guarda con
`estado='perdida'` + `robada=true`. Al marcarla, se ofrece la guía (abrir `GuiaRobada`). Para
`encontrada` la casilla no aparece.

## Función 3 — Dónde se ve la marca (todo lee la fila completa vía select('*') o la RPC recreada)
- **Ficha** (`PetDetailScreen`): badge "ROBADA" junto al de estado.
- **Tarjetas del feed** (`PetCard`/`ReportesLista`): badge "ROBADA" (dato ya disponible tras recrear
  la RPC + mapearlo en `services/busqueda.ts`).
- **Afiche** (`lib/afiche.ts`): el titular "SE BUSCA" suma "· ROBADA" cuando `robada`.
- **Texto de compartir/difusión** (`lib/share.ts` `buildShareText`, `lib/difusionRedes.ts`): el
  encabezado dice "ROBADA" en vez de "PERDIDA"/"Se perdió". Nunca el monto (regla existente).
- El mapa (`ReportesMapa`) mantiene el color de perdida; el popup suma "(robada)" al título.

## Función 4 — Guía propia `GuiaRobada` (espejo de `GuiaPerdida`, que ya existe)
Pantalla en el stack raíz (como `GuiaPerdida`/`GuiaEncontrada`), con header y botón de volver.
Contenido (rescatista + memo legal, sin prometer nada que no hagamos):
1. Denunciá el robo a Carabineros / PDI y guardá el número de parte.
2. **No pagues ni negocies por adelantado**: pedir dinero por devolverla es la estafa más común
   (refuerza el `AvisoEstafa` existente). No muestres el monto de recompensa.
3. Reuní pruebas de propiedad: número de chip, fotos con fecha, carné de vacunas, testigos.
4. Difundí con la marca "ROBADA" (enlaza a "Difundir en redes", T15) y pegá afiches.
5. Registro Nacional de Mascotas y grupos del barrio.
Enlazada desde la ficha robada y ofrecida al marcar la casilla en Publicar.

## Reglas transversales (heredadas, obligatorias)
Tono sin afirmar identidad ni culpar; navegación anidada absoluta desde el stack raíz (la 6ª+
aparición del bug: `GuiaRobada` se navega como `PublicPetScreen`, no por nombre pelado); `.select()`
con columnas explícitas; migración ensayada en `begin…rollback` con ataques y CONTROLES (que lo
legítimo siga funcionando); guardas de forma contra mutación; recrear una función Postgres SIEMPRE
desde su cuerpo vivo, nunca desde una migración vieja; verificación final contra el dist compilado.

## Sin cambios en
Matching (`buscar_coincidencias`), plan de búsqueda, colores, RLS, Edge Functions, la cola de avisos.

# Tanda B — cierre (PENDIENTE, para otra sesión)

Estado al **27-jul-2026**. La Tanda B ("tiendas": bloqueo + denuncia) quedó **~80% hecha**
porque la Tanda 8 (moderación) cubrió el grueso. Este archivo guarda el análisis de brecha
ya hecho (con un agente Explore) y la decisión de alcance, para retomar sin reinvestigar.

**Decisión de Pablo:** cerrar **TODO**, incluidas las páginas web (aunque hereden el
nombre/dominio que aún no existen → usar marcadores provisionales bien visibles y fáciles de
reemplazar). No necesita el nombre de la app ni el dominio para el resto.

Specs de referencia: `docs/superpowers/specs/2026-07-19-tanda-b-tiendas-design.md` (7 piezas)
y la posterior `2026-07-21-bloqueos-tienda-design.md` (redefine piezas 3-7). Última migración
en el repo: **0040** → la nueva sería **0041**. HEAD legal: `d81c4b7`.

## 🔴 Dos hoyos de seguridad/privacidad REALES (prioridad, no necesitan datos de Pablo)

1. **`anonimizar_mi_cuenta()` NO borra las filas de `bloqueos`.** Última versión de la función
   en `supabase/migrations/0037_web_push.sql:56-103`; no toca `bloqueos`. Como `profiles`
   sobrevive como lápida (no hay DELETE de la fila), el `on delete cascade` del FK **no
   dispara** → quedan datos privados de a quién bloqueaste tras borrar la cuenta. La spec lo
   marcó como el detalle crítico "que se cayó entre tandas". Arreglo: en la nueva migración
   0041, recrear `anonimizar_mi_cuenta()` agregando `delete from public.bloqueos where
   bloqueador = auth.uid() or bloqueado = auth.uid();`. Función sin parámetros, security
   definer, `set search_path = public, pg_temp` (patrón ya usado).

2. **Los avisos (push/correo) NO filtran bloqueados.** `src/lib/notifyTargets.ts`,
   `supabase/functions/send-push/index.ts` y `send-notifications/index.ts` no consultan
   bloqueo. Un bloqueado te sigue haciendo sonar el teléfono (la spec lo llamó "peor que un
   mensaje"). Arreglo: excluir destinatarios donde exista bloqueo en cualquier dirección con
   quien origina el aviso.

## 🟡 Funcionalidad incompleta (no necesita datos de Pablo)

3. **Denunciar un mensaje puntual (pulsación larga).** `denunciarMensaje` ya existe en
   `src/services/moderation.ts:122` pero **no está cableada**: falta `onLongPress` en la
   burbuja de `src/screens/ChatScreen.tsx`. El chat es donde mira el revisor.
4. **Filtro cliente de conversaciones y novedades.** Pistas (`src/services/tips.ts:62-64`) y
   avistamientos (`src/services/sightings.ts:75-78`) sí filtran bloqueados; **falta** que el
   hilo de un bloqueado desaparezca de Conversaciones (`src/services/messages.ts`) y filtrar
   novedades (pet_updates).
5. **Pantalla "Personas bloqueadas" en Perfil.** No existe; hoy solo desbloqueás entrando al
   perfil/chat de la persona (`PublicProfileScreen.tsx:104-107`). Los datos ya están en
   `src/services/bloqueos.ts`. Falta la pantalla + entrada en `ProfileScreen` + navegación.
6. **Endurecimiento de servidor barato (todo en la migración 0041):**
   - CHECK de largo en `denuncias`: `motivo` (1-60) y `detalle` (≤500). `0025_denuncias_
     extendida.sql` no los añadió → un `detalle` de 5000 chars entra por API (23514 no salta).
   - Guard en el trigger de auto-ocultado: `if new.tipo <> 'reporte' then return new;` — hoy
     funciona "por accidente" (`0025:49-53`), la spec lo quería correcto por diseño.
   - Columna `profiles.terminos_aceptados_en timestamptz` + que `RegisterScreen`/el trigger
     `handle_new_user` la persista al aceptar (hoy la casilla existe pero no se guarda cuándo).
   - Acción `'bloquear'` en `src/lib/requireAuth.ts` (hoy se replica inline en cada pantalla).
   - Mensaje neutro específico para `42501` en `src/lib/dbErrors.ts` ("No se pudo enviar el
     mensaje a esta persona", nunca "te bloqueó"). Hoy cae en el genérico "No tenés permiso".

## ⛔ Bloqueado en datos de Pablo (Pablo eligió hacerlo igual con marcadores)

7. **Correo de soporte / "Ayuda y contacto".** `LegalScreen.tsx` tiene `CORREO_CONTACTO=null`.
   Ambas tiendas exigen contacto del desarrollador → sigue bloqueando publicación real.
8. **Páginas web `public/privacidad/index.html` y `public/terminos/index.html`.** Derivarlas de
   `docs/legal/*.md` (que tienen 28 `[[PENDIENTE]]`). Play exige URL de política de privacidad.
   Usar marcadores provisionales para nombre/dominio/correo, señalados para reemplazo.

## Deuda de mantenimiento detectada (no bloquea, anotar y limpiar de paso)

- `src/services/moderacion.ts` (panel admin, español) vs `src/services/moderation.ts`
  (denuncias del usuario, inglés): NO son duplicados, hacen cosas distintas, pero los nombres
  casi idénticos son una trampa. Renombrar el admin a `moderacionAdmin.ts`.
- `0040_moderacion_rpc.sql` tiene encabezado interno `0036b_...` (línea 1): desalineado.
- `src/lib/dbErrors.ts:41` referencia `denuncias_pet_id_reporter_user_key`, que
  `0025_denuncias_extendida.sql:35` dropeó → entrada muerta inocua.
- `PublicProfileScreen` lista actividad/reportes/red social; la spec pedía perfil "mínimo"
  para no sumar superficie de acoso. Decisión de producto pendiente (no bloquea).

## Cómo retomar

Empezar por 🔴 #1 y #2 (riesgo real). #1 + todo el 🟡 #6 van juntos en la migración **0041**
(SQL-only, NO aplicar a Supabase durante la codificación: eso es un paso aparte supervisado
con el token, que Pablo debe volver a proveer y luego revocar). Verificar tsc + jest tras cada
pieza (repo hoy: 807/808, la única roja es `TarjetaCompartir`, flaky ajeno que pasa aislado).

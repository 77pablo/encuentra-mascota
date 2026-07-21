# Ficha "Mi mascota" + collar con QR — diseño

**Fecha:** 2026-07-21
**Estado:** aprobado, listo para plan
**Parte de:** tanda de 4 funciones en paralelo (ver `2026-07-21-tanda-4funciones-coordinacion.md`)

## Problema

Hoy cada reporte se publica desde cero, y no hay nada de **prevención**: la app solo actúa
cuando la mascota ya se perdió. Dos huecos:

1. No existe una ficha permanente de "mi mascota" con foto y datos listos, así que publicar
   un perdido en el peor momento (angustia) obliga a cargar todo de nuevo.
2. No hay forma de que un vecino que encuentra a la mascota contacte a la familia si no hay
   reporte activo (una placa de collar con QR resuelve justo eso).

## Decisiones de producto (aprobadas)

- **QR del collar cuando la mascota NO está reportada perdida:** página **sobria** que dice
  *"Esta mascota tiene familia"* y permite **avisar al dueño** (que la vieron); el contacto
  (WhatsApp, etc.) **solo** aparece si hay un reporte perdido activo. Nunca se expone el
  contacto ni la identidad del dueño en la página sobria.
- Ficha con los campos suficientes para pre-cargar Publicar + identificar (chip).
- Etiqueta de collar imprimible con QR incluida.

## Arquitectura

### Migración `0027_mi_mascota.sql`

**Tabla `my_pets`** (mascotas registradas, permanentes; distinta de `pets`, que son
reportes):

```
id            uuid pk default gen_random_uuid()
user_id       uuid not null references profiles(id) on delete cascade
nombre        text not null
especie       pet_especie not null           -- reusa el enum de 0001
raza          text
foto          text                            -- una sola; ruta en el bucket pet-photos
senas         text                            -- señas particulares / notas
chip          text                            -- número de microchip, opcional
collar_token  text not null unique default (usar id aleatorio de 128 bits)
creado_en     timestamptz not null default now()
```

- El `collar_token` es aleatorio de 128 bits (no adivinable, mismo criterio que las rutas
  de foto de la Tanda A). Se genera **en el servidor** con un default (`encode(gen_random_bytes(16),'hex')`)
  para que el cliente no pueda fijarlo.
- **RLS:** `select/insert/update/delete` solo `auth.uid() = user_id`. La tabla NO es pública
  (la lectura pública va exclusivamente por la RPC de abajo, que filtra columnas).
- **CHECK** de longitudes (mismos límites que el resto del contenido de usuario, ver 0016):
  nombre, raza, senas, chip acotados.

**RPC pública `mascota_por_collar(p_token text)`** (`security definer`, `stable`,
`search_path=public`; `grant execute to anon, authenticated`):
- Busca la `my_pets` por `collar_token`.
- Devuelve **solo**: `nombre`, `especie`, `foto`, y `reporte_perdida_id` = el `id` del
  reporte `pets` **perdido, activo y no oculto** de esa mascota, si existe, si no `null`.
  **Nunca** devuelve `user_id`, contacto, chip ni señas.
- ¿Cómo se vincula una `my_pet` con su reporte `pets`? Por el `pet_id` del reporte creado
  desde la ficha: **añadimos `origen_my_pet uuid null references my_pets(id) on delete set null`
  a `pets`** (columna nueva en esta misma migración). Cuando se reporta perdida desde la
  ficha, el reporte guarda `origen_my_pet = <my_pet.id>`. La RPC hace el join por esa
  columna. Un reporte publicado a mano (sin ficha) simplemente no se vincula.
- Token inexistente → 0 filas (no se distingue de "no existe", a propósito).

**RPC `avisar_escaneo_collar(p_token text, p_nota text, p_lat double precision,
p_lng double precision)`** (`security definer`; `grant execute to anon, authenticated`):
- Resuelve la `my_pet` por token; si no existe, retorna sin error (no filtra existencia).
- Encola un aviso al dueño en `notification_events` (ver cambios a la cola abajo):
  `tipo='escaneo_collar'`, `pet_id = null`, `target_user_id = <dueño de la my_pet>`,
  `actor_id = null` (el que escanea puede ser anónimo), `datos = { nombre_mascota,
  nota: left(p_nota,200), lat, lng }`.
- Anti-abuso: la RPC es `security definer` y solo **inserta en la cola** (no lee nada
  sensible). Rate-limit simple: no encolar si ya hay un evento `escaneo_collar` para esa
  `my_pet` en los últimos 5 min (evita que alguien martille el botón). El escaneo no crea
  filas visibles para nadie salvo el dueño (vía el aviso).

**Cambios a la cola `notification_events`** (compartidos con la función 1; reconciliar en el
merge — ver nota de coordinación):
- `alter column pet_id drop not null` (un escaneo sin reporte activo no tiene `pet_id`).
- `add column target_user_id uuid references profiles(id) on delete cascade` (destinatario
  directo para avisos dirigidos a una persona, no a un reporte).
- Ampliar el CHECK de `tipo` para incluir `'escaneo_collar'` (lista unión con la 0026).

### `notifyTargets.ts` (+ espejo) y Edge Function

⚠️ **Espejo:** cambiar las dos copias de `notifyTargets.ts`.

- `TipoEvento` suma `'escaneo_collar'`.
- `EventoAviso` suma `targetUserId?: string | null` y `datos` suma
  `nombre_mascota?: string; nota?: string`.
- `resolverDestinatarios`: `'escaneo_collar'` → destinatario único = `evento.targetUserId`
  (no `duenoPetId`, porque puede no haber reporte). Se filtra por canales; **no** hay
  interruptor de tipo dedicado en `notification_prefs` para escaneo → usar el canal siempre
  (un escaneo de collar es de alta prioridad; el dueño puso la placa justamente para esto).
- `componerAviso`: caso `'escaneo_collar'`. Título *"Alguien escaneó la placa de {nombre}"*,
  cuerpo con la nota escapada si viene + *"Entrá para ver dónde"*. `ruta` = una vista del
  dueño (p. ej. `/mis-mascotas` o el detalle de la ficha); si el push no puede deep-linkear
  a nativo, el web sí. Basta con `/mis-mascotas`.
- **Edge Function `armarContexto`:** branch nuevo para `'escaneo_collar'`: el destinatario
  sale de `ev.target_user_id` (no de `pets`), y `nombrePet` de `ev.datos.nombre_mascota`.
  **Este branch hay que agregarlo** (hoy `armarContexto` siempre consulta `pets` por
  `pet_id`; con `pet_id=null` eso devolvería null y se perdería el aviso). El branch debe
  ir antes del `select` a `pets`.
- La `EventoRow` de la Edge Function suma `target_user_id`, y el `select` de la cola en
  `Deno.serve` suma esa columna.

### Cliente

**Pantalla "Mis mascotas"** (`MyPetsScreen`) en Perfil:
- Lista de fichas (`services/myPets.ts`: `listMyPets`, `createMyPet`, `updateMyPet`,
  `deleteMyPet`, `getMyPetByToken` no hace falta en cliente). Empty state cálido.
- Alta/edición: formulario (nombre, especie, raza, señas, chip, foto vía `pickImage` +
  `storage.subirFoto`). Validación con zod (nuevo `schemas/myPet.ts`).
- Cada ficha: botón **"Reportar como perdida"** → navega a `PublishScreen` con params
  pre-cargados (`estado='perdida'`, `especie`, `raza`, `nombre`, descripción semilla a
  partir de `senas`, y `origenMyPet=<id>` para que `createPet` guarde `origen_my_pet`) y la
  foto de la ficha ya seleccionada. **PublishScreen acepta estos params opcionales**
  (colisión con función 4, ver coordinación).
- Botón **"Etiqueta de collar"** → genera un PNG imprimible.

**Etiqueta de collar** (`src/lib/collarTag.ts` + componente `CollarTag.tsx`, reusando
`qr.ts`/`QrCode.tsx` y el patrón de `aficheImage.ts`): PNG chico (proporción de placa /
tarjeta) con el nombre de la mascota, un mensaje corto (*"Si me encontraste, escaneá"*) y el
**QR a `EXPO_PUBLIC_WEB_URL + /collar/<token>`**. En web descarga el PNG; en nativo abre la
hoja de compartir (mismo mecanismo que el afiche).

**Pantalla pública `CollarScreen`** (ruta `/collar/:token`, accesible en **modo invitado**,
registrada en el/los stacks y en el linking):
- Llama a `mascota_por_collar(token)`.
- Si `reporte_perdida_id` no es null → tarjeta prominente *"¡{nombre} está perdida! Su
  familia la está buscando"* con botón grande al reporte (`/mascota/<id>`), que ya tiene el
  flujo de contacto/afiche.
- Si es null → página **sobria**: foto + *"Esta mascota tiene familia."* + formulario
  opcional (nota corta + "usar mi ubicación") + botón **"Avisar que la vi"** →
  `avisar_escaneo_collar(...)` → confirmación *"Listo, avisamos a la familia."*. **No**
  muestra contacto ni dueño.
- Token inválido → estado vacío amable (*"No encontramos esta placa"*), sin filtrar nada.

## Casos borde / decisiones

- **Privacidad:** la única vía de lectura pública es la RPC, que filtra columnas y nunca
  entrega `user_id`/contacto/chip. La tabla en sí está cerrada por RLS. El token de 128 bits
  no es enumerable.
- **Foto en el bucket:** reusa `pet-photos` con ruta aleatoria (`idAleatorio`), prefijo
  `userId/`, para heredar el borrado de cuenta y el limpiado de EXIF (`storage.ts`).
- **Borrado de cuenta:** `my_pets` cuelga de `profiles` con `on delete cascade`, así que se
  va con la cuenta. Sus fotos: **hay que sumarlas** al set que borra `delete-account`
  (mismo patrón `^<uid>/...`). Anotar como follow-up si no entra en esta tanda; en el peor
  caso queda una foto huérfana (nombre aleatorio, no enumerable) — consistente con el estado
  actual, no un regreso.
- **Reportar como perdida dos veces:** no se impide; cada uno es un reporte `pets` normal.
  La RPC del collar toma el primer perdido activo vinculado.
- **Escaneo sin reporte:** el aviso llega igual (por eso `pet_id` nullable + `target_user_id`).

## Testing

- `schemas/myPet.ts`: validación (nombre requerido, longitudes, especie válida).
- `myPets.ts`: CRUD (con mocks de supabase).
- `collarTag.ts`: arma el contenido/URL correctos (token → URL absoluta).
- `notifyTargets.test.ts` + espejo: caso `'escaneo_collar'` (destinatario = targetUserId;
  canales; título con nombre; nota escapada).
- Manual post-deploy: RPC `mascota_por_collar` no filtra contacto (pedir el token y
  confirmar que la respuesta no trae `user_id`/contacto); escaneo encola aviso al dueño;
  RLS de `my_pets` (otro usuario no lee mi ficha → `42501`/0 filas).

## Archivos

- `supabase/migrations/0027_mi_mascota.sql` (nuevo)
- `src/services/myPets.ts`, `src/schemas/myPet.ts` (nuevos)
- `src/screens/MyPetsScreen.tsx`, `src/screens/CollarScreen.tsx` (nuevos)
- `src/lib/collarTag.ts`, `src/components/CollarTag.tsx` (nuevos; reusan `qr.ts`)
- `src/lib/notifyTargets.ts` + `.test.ts`, `supabase/functions/send-notifications/notifyTargets.ts`,
  `supabase/functions/send-notifications/index.ts` (editar — COMPARTIDO con func. 1)
- `src/screens/PublishScreen.tsx` (aceptar params de pre-carga — COMPARTIDO con func. 4)
- Navegación/linking: registrar `MyPets` y `Collar` (`/collar/:token`).

## Fuera de alcance (YAGNI)

- Múltiples fotos por ficha. Historial médico/vacunas. Compartir la ficha entre miembros de
  la familia. Interruptor de tipo dedicado para escaneo en `notification_prefs` (siempre se
  envía). Recorte de imagen para la placa.

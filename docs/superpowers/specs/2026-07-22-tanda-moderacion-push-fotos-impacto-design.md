# Tanda: panel de moderación + push web + fotos en chat + impacto de la comunidad

**Fecha:** 2026-07-22
**Rama base:** `feat/mvp-encuentra-mascota` (HEAD `234f787`)
**Migraciones nuevas:** `0036`–`0039` (independientes entre sí)

## Contexto

La app "Encuentra tu Mascota" ya está en producción (`https://encuentras-mascota.pages.dev`)
con adopción, 5 pestañas, modo oscuro, PWA instalable y vista previa de links. Esta tanda cierra
cuatro huecos reales detectados al revisar el estado actual:

1. **Las denuncias van a un buzón muerto.** El botón "Denunciar" escribe en `denuncias`, pero la
   RLS solo deja leer las propias (`0003_moderacion.sql:14-21`) y **no existe ningún concepto de
   admin**. Nadie revisa nada. Además de ser un agujero de producto, es un requisito de las
   tiendas y la base de la defensa legal en Chile (diligencia demostrable: retiros con timestamp).
2. **Los avisos no llegan a nadie en web.** Todo el push es Expo/nativo; en web es un no-op
   (`src/lib/pushSetup.ts:11`, `public/sw.js:15`). Como todavía no hay app en tiendas, el pipeline
   de avisos (cola + cron + dispatcher, ya sólido) no se traduce en ninguna notificación real.
3. **El chat es solo texto.** No se puede mandar una foto ("¿es esta tu mascota?" → foto), que es
   de lo más pedido en apps de este tipo.
4. **No hay prueba social.** No existen números agregados que muestren a un vecino nuevo que la
   app funciona.

Todo se construye **subagent-driven** (implementadores en paralelo + revisión por rama + revisión
final adversarial), el flujo ya rodado en tandas anteriores.

---

## Función 1 — Panel de moderación

### Objetivo
Una pantalla in-app, visible **solo para el admin**, para revisar denuncias pendientes, ver el
contenido denunciado (aunque esté oculto o sea un chat privado), y actuar: retirar el contenido,
descartar la denuncia, suspender al usuario, y ver cuántas denuncias acumula.

### Estado actual relevante
- `denuncias` (creada `0003`, ampliada `0025`/`0030`/`0032`): columnas `id, pet_id (nullable),
  reporter_user, motivo, creado_en, tipo, objeto_id, usuario_denunciado, detalle`. **No tiene
  columna de estado.** `tipo ∈ ('reporte','usuario','mensaje','pista','avistamiento','adopcion','pregunta_adopcion')`.
- RLS: solo INSERT propio + SELECT de `reporter_user = auth.uid()`. Sin UPDATE/DELETE.
- **No existe** `es_admin`, rol, ni id de dueño hardcodeado. Todo lo privilegiado corre server-side
  con `service_role` en Edge Functions.
- Retiro de contenido hoy = solo el dueño: `deletePet` (`pets.ts:163`), `deleteAdoption`
  (`adoptions.ts:152`), `borrarTip` (`tips.ts:114`), `deleteSighting` (`sightings.ts:82`),
  `deleteQuestion` (`adoptionQuestions.ts:136`). `pets.oculto`/`adoptions.oculto` existen pero solo
  los escribe el trigger de auto-ocultado (`0003:24-40`).
- Patrón de privilegio ya probado en el repo: funciones `security definer` de un parámetro que
  chequean permiso por dentro (`mi_perfil()`, `hay_bloqueo_con()`, `anonimizar_mi_cuenta()`).

### Diseño

**Migración `0036_moderacion_admin.sql`:**
- `alter table profiles add column es_admin boolean not null default false;`
- `alter table profiles add column suspendido_en timestamptz;`
- `denuncias`: `add column estado text not null default 'pendiente' check (estado in
  ('pendiente','resuelta','descartada'))`, `resuelto_en timestamptz`, `resuelto_por uuid
  references profiles(id)`, `accion text` (qué se hizo).
- Función `es_admin()` `security definer stable` → `exists(select 1 from profiles where
  id = auth.uid() and es_admin)`. Grant a `authenticated`. **NO** se abre RLS ancha de admin sobre
  `denuncias` ni sobre las tablas de contenido; todo pasa por las RPC de abajo.
- Función `estoy_suspendido()` `security definer stable` → `exists(select 1 from profiles where
  id = auth.uid() and suspendido_en is not null)`. Grant a `authenticated`.
- **Enforcement de suspensión:** amendar las policies de INSERT de `pets`, `adoptions`, `pet_tips`,
  `sightings`, `adoption_questions`, `messages` para sumar `and not public.estoy_suspendido()`.
  Cada `drop policy` + `create policy` conservando VERBATIM el resto de la condición vigente (ojo:
  la de `messages` ya trae `eliminado_en` + `hay_bloqueo_con`, ver `0022:105-115`). El login y la
  lectura NO se tocan: el suspendido entra y ve, no publica ni escribe.

**RPCs de moderación** (todas `security definer`, primera línea `if not es_admin() then raise
exception 'no autorizado' end if;`):
- `moderacion_bandeja()` → `setof` de filas enriquecidas de denuncias `pendiente`, ordenadas por
  `creado_en asc` (lo más viejo primero). Cada fila: datos de la denuncia + `reporter_nombre` +
  `denunciado_nombre`/`denunciado_id` + `contenido jsonb` (snapshot del objeto denunciado según
  `tipo`: texto de mensaje/pista/pregunta, título/foto del reporte/adopción, nombre del usuario) +
  `denuncias_contra_denunciado int` (historial = cuántas denuncias pendientes/totales acumula ese
  usuario). Lee saltándose RLS por ser definer. La resolución del `contenido` va con un `case tipo`.
- `moderar_retirar(p_denuncia_id uuid)`:
  - Busca la denuncia; según `tipo`: `reporte`/`adopcion` → `update ... set oculto=true`;
    `pista`/`avistamiento`/`pregunta_adopcion`/`mensaje` → borra la fila.
  - `update denuncias set estado='resuelta', resuelto_en=now(), resuelto_por=auth.uid(),
    accion='retirado' where id = p_denuncia_id`.
  - Cierra las **otras** denuncias pendientes del mismo objeto (mismo `tipo` + mismo
    `objeto_id`/`pet_id`) como `resuelta`/`accion='retirado (en lote)'`.
- `moderar_descartar(p_denuncia_id uuid)` → `estado='descartada', resuelto_en, resuelto_por,
  accion='descartada'`. Contenido intacto.
- `moderar_suspender(p_usuario_id uuid)` → `update profiles set suspendido_en=now() where
  id=p_usuario_id`. (Reversible a mano por SQL; no exponemos "reactivar" en la UI de esta tanda.)

Grants de las 4 RPC a `authenticated` (el gate real es `es_admin()` adentro, no el grant).

**Exponer `es_admin` a la app:** agregar `es_admin` al retorno de `mi_perfil()` (`0018`). El
cliente lo lee al cargar el perfil.

### UI
- `src/screens/ModeracionScreen.tsx`, registrada en `ProfileStack` (`TabNavigator.tsx:120-159`)
  como `Moderacion` con header nativo (`title: 'Moderación'`).
- Entrada desde `ProfileScreen`: fila "Moderación" **visible solo si el perfil trae
  `es_admin === true`**.
- Bandeja = `FlatList` de tarjetas. Cada tarjeta: tipo + motivo + detalle, quién denuncia, a quién,
  preview del `contenido` (texto o foto), y "N denuncias contra esta persona". Botones: **Retirar**
  / **Descartar** / **Suspender** (los dos últimos con `confirmAction`). Tras la acción, refresca la
  bandeja (el ítem sale).
- Servicio nuevo `src/services/moderacion.ts`: `bandeja()`, `retirar(id)`, `descartar(id)`,
  `suspender(usuarioId)` — envuelven las RPC.

### No incluido (YAGNI)
- Reactivar suspendidos desde la UI (se hace por SQL).
- Historial de denuncias ya resueltas (la bandeja muestra solo pendientes).

---

## Función 2 — Push web real (VAPID)

### Objetivo
Que los avisos (coincidencias, zona, pista, avistamiento, búsqueda guardada, escaneo de collar,
chat) lleguen como **notificación del sistema** en la PWA aunque la pestaña esté cerrada.

### Estado actual relevante
- **Cero Web Push hoy.** Todo es Expo Push contra `exp.host`, con tokens en `push_tokens`
  (`0001:86-96`). El SW (`public/sw.js`, VERSION `'v2'`) no tiene handler `push`/`notificationclick`.
- Pipeline: cola `notification_events` (6 tipos), dispatcher `send-notifications` (pg_cron cada
  5 min, service_role), y `send-push` (push puntual de chat, llamado por el navegador con CORS+JWT).
- Preferencias de canal: solo `canal_email` y `canal_push` en `notification_prefs` (`0011:3-17`).
- Targeting compartido **duplicado a mano**: `src/lib/notifyTargets.ts` y su espejo
  `supabase/functions/send-notifications/notifyTargets.ts` (cambiar en LOS DOS). `Destinatario.canales`
  es `('email'|'push')[]`.
- Project ref real: `ywlrcfaybnikaurxsgtj`. Deploy de funciones: `supabase functions deploy`.

### Diseño

**Migración `0037_web_push.sql`:**
- `create table web_push_subscriptions (id uuid pk default gen_random_uuid(), user_id uuid not null
  references profiles(id) on delete cascade, endpoint text not null unique, p256dh text not null,
  auth text not null, creado_en timestamptz not null default now())`.
- RLS "gestionar mis suscripciones" (`auth.uid() = user_id`) para select/insert/delete. Índice por
  `user_id`.
- Limpieza en borrado de cuenta: agregar `delete from web_push_subscriptions where user_id = ...`
  dentro de `anonimizar_mi_cuenta()` (`0017`) — recrear la función con `create or replace`.

**Canal de preferencia:** se **reusa `canal_push`** (un solo interruptor cubre nativo + web). No se
agrega columna nueva. `notifyTargets` no cambia su lógica de canales.

**Cliente web** (`src/lib/webPush.ts`, solo web):
- `activarWebPush(userId)`: guard `Platform.OS === 'web'` + `'serviceWorker' in navigator` +
  `'PushManager' in window`; `Notification.requestPermission()`; si `granted`,
  `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey:
  urlBase64ToUint8Array(EXPO_PUBLIC_VAPID_PUBLIC_KEY) })`; upsert de endpoint/p256dh/auth en la
  tabla. Devuelve estado (`activada`/`denegada`/`no_soportado`).
- `desactivarWebPush()`: `subscription.unsubscribe()` + delete de la fila.
- `estadoWebPush()`: lee `Notification.permission` + si hay suscripción, para pintar el botón.
- Helper puro `urlBase64ToUint8Array` (testeable en jest).

**UI:** en `NotificationPrefsScreen.tsx` (Perfil → Avisos), bloque **solo-web** "Notificaciones en
este dispositivo" con botón Activar/Desactivar y estados: activada, denegada (con instrucciones de
cómo reactivar desde el navegador), no soportado. Los switches de tipo/canal existentes no cambian.

**Service worker** (`public/sw.js`, subir a VERSION `'v3'`):
- `self.addEventListener('push', ...)`: `event.data.json()` → `{ title, body, ruta }`;
  `showNotification(title, { body, icon, badge, data: { ruta } })`.
- `self.addEventListener('notificationclick', ...)`: `clients.matchAll` → enfoca una pestaña abierta
  y navega, o `clients.openWindow(ruta)`. Reusa la semántica de `rutaANavegacion.ts`.
- Registro de SW ya existe (`public/registrar-sw.js`, inyectado por `_worker.js`).

**Servidor** (Deno):
- Módulo compartido `supabase/functions/_shared/webpush.ts`: `enviarWebPush(sub, payload,
  vapidKeys)` usando una librería web-push compatible con Deno (esm.sh). Encripta el payload
  (aes128gcm) y firma el JWT VAPID. Borra la suscripción si el endpoint responde `404/410`.
- `send-notifications/index.ts` → `enviarPush` (o un `enviarWebPush` paralelo): además de Expo,
  consulta `web_push_subscriptions` del destinatario y manda a cada endpoint. Best-effort: un fallo
  de una suscripción no tumba el evento.
- `send-push/index.ts` (chat): misma extensión web push al destinatario.
- Secretos: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:...`). En el cliente,
  `EXPO_PUBLIC_VAPID_PUBLIC_KEY` en `.env`.

### ⚠️ Riesgo técnico (verificar primero)
Enviar Web Push con cifrado VAPID desde Deno es lo único no trivial de la tanda. **Antes** de
cablear la UI, hay que probar en `wrangler`/Deno que una librería web-push de esm.sh cifra y entrega
a un endpoint real (o a un mock que valide el formato aes128gcm + JWT). Si la lib elegida no corre
en el runtime de Supabase Edge, evaluar alternativa (`jose` para el JWT + cifrado manual) antes de
seguir.

---

## Función 3 — Fotos en el chat

### Objetivo
Mandar **una** foto en la conversación, sola o con un texto corto.

### Estado actual relevante
- `messages` (`0001:65-83`, tocada por `0016/0017/0022/0030`): `texto` con CHECK
  `length(btrim(texto)) between 1 and 2000` (`0016:69-71`) → texto obligatorio. Insert solo de
  `texto` en `sendMessage` (`messages.ts:132-145`).
- Storage: `uploadPetPhoto(uri, userId)` (`storage.ts`) ya resize a 1080 + recomprime JPEG (borra
  EXIF/GPS), ruta `userId/idAleatorio().jpg` en el bucket público `pet-photos`. `pickFromLibrary`/
  `takePhoto` en `pickImage.ts`.
- `mis_fotos_a_borrar()` (`0017`) barre `profiles.foto_perfil`, `pets.fotos`, `pets.final_foto` —
  **NO** las fotos de chat.
- ChatScreen render de burbuja pinta solo `item.texto` (`ChatScreen.tsx:328-344`); input+envío en
  `:357-376`; `onSend` en `:139-170`. Realtime hace `select *` (transporta columnas nuevas).

### Diseño

**Migración `0038_chat_fotos.sql`:**
- `alter table messages add column imagen_url text;`
- Relajar el texto: `drop constraint messages_texto_largo;` `alter column texto drop not null;`
  nuevo CHECK: `(texto is null or length(btrim(texto)) between 1 and 2000) and (texto is not null or
  imagen_url is not null)` (al menos uno de los dos).
- Extender `mis_fotos_a_borrar()` (`create or replace`) para incluir
  `select ruta_storage(imagen_url) from messages where from_user = <uid> and imagen_url is not null`.

**Cliente:**
- `messages.ts` `sendMessage(ctx, from, to, texto, imagenUrl?)`: acepta texto vacío si hay imagen;
  inserta `imagen_url`. Ajustar el tipo `Message` con `imagen_url: string | null`.
- `ChatScreen.tsx`: botón adjuntar (📎/📷) junto al input → `pickFromLibrary(1)`/`takePhoto()` →
  `uploadPetPhoto(uri, me)` → preview + estado "enviando" → `sendMessage` con `imagen_url` + caption
  opcional del input. Burbuja: si `imagen_url`, `<Image>` (tocar = abrir grande, reuse del visor si
  existe o modal simple) con el texto debajo si lo hay. `puedeEnviar` = hay texto **o** hay imagen
  adjunta.
- Push del chat: cuerpo "📷 Foto" cuando no hay texto (`onSend` arma el body).

### No incluido
- Varias fotos por mensaje (carrusel) — descartado por alcance.
- Compresión distinta a la de reportes (se reusa tal cual).

---

## Función 4 — Impacto de la comunidad (público)

### Objetivo
Números agregados de la comunidad, **visibles para cualquiera** (incluso invitados), en Inicio.

### Estado actual relevante
- No hay RPC de agregados globales. Existen conteos sueltos: `countReunidas()` (`pets.ts:211`,
  cuenta `activo=false` a secas — más laxo), `contarReportesEnComuna` (`busqueda.ts:91`).
- Estados finales: `pets.reunida_en not null and oculto=false` = reencuentro real;
  `pets.activo=true and oculto=false` = buscando; `adoptions.adoptada_en not null` = adopción
  concretada; aportes = `sightings` + `pet_tips`.
- HomeScreen ya muestra tiras de stats (`countReunidas`, `listFinalesFelices`) — hay lugar y patrón.

### Diseño

**Migración `0039_impacto_comunidad.sql`:**
- RPC `impacto_comunidad()` `security definer stable`, grant `anon` + `authenticated`, retorna una
  fila: `reencuentros` (`pets` con `reunida_en not null and oculto=false`), `buscando` (`pets` con
  `activo=true and oculto=false`), `adopciones` (`adoptions` con `adoptada_en not null`), `aportes`
  (`sightings` + `pet_tips`). Una sola consulta. (Nada de datos personales; solo conteos.)

**Cliente:**
- `src/services/impacto.ts` `getImpacto()` (normaliza bigint→Number, degrada a `null` si falla).
- Tarjeta en `HomeScreen.tsx` "Lo que logramos juntos" con los 4 números y copy cálido (sin tono
  corporativo ni infantil, regla de diseño de Pablo). Se carga en el `Promise.all` existente y
  degrada silenciosa si la RPC no está. Visible para invitado y autenticado.

### No incluido
- Tablero privado con detalle (se eligió público simple).
- Gráficos/series temporales.

---

## Transversal

### Migraciones y orden de despliegue
- Cuatro migraciones nuevas independientes: `0036`–`0039`.
- **Orden de despliegue en prod:** (1) generar claves VAPID + setear secretos; (2) redesplegar Edge
  Functions `send-notifications` y `send-push` (traen web push); (3) aplicar migraciones
  `0036`→`0039`; (4) subir la web (`dist`). La suspensión (`0036`) toca policies de insert: aplicar
  la migración **antes** de que la web nueva dependa de ella no es crítico (la web vieja no llama a
  nada nuevo), pero el orden natural es migración antes que web.
- Aplicación de migraciones: API admin de Supabase con PAT (`POST /v1/projects/<ref>/database/query`,
  con `User-Agent` de navegador por el Cloudflare de la Management API). Deploy de funciones:
  `SUPABASE_ACCESS_TOKEN` env var + `npx supabase functions deploy <n> --project-ref ywlrcfaybnikaurxsgtj`.

### Pruebas
- **Unit:** helpers puros (`urlBase64ToUint8Array`, resolución de `contenido` de la bandeja si se
  extrae a lib, armado del payload de push). Mantener verde el test-espejo de `notifyTargets`.
- **Migraciones/seguridad (contra la base real con PAT):** que un no-admin reciba `no autorizado`
  al llamar cualquier RPC de moderación; que el suspendido no pueda insertar reporte/mensaje
  (`42501`) pero sí leer; que `web_push_subscriptions` no sea legible por otro usuario; que
  `impacto_comunidad()` responda a `anon`; que el CHECK de `messages` acepte solo-foto y rechace
  vacío-vacío.
- **E2E visual (Playwright headless a localhost:8091):** admin ve la fila Moderación y un no-admin
  no; retirar oculta el reporte; foto en el chat se manda y se ve; tarjeta de impacto con números;
  botón de Avisos activa el permiso (el permiso real del navegador se mockea/omite en headless, se
  verifica el flujo hasta `requestPermission`). Trucos de Playwright RN-web ya documentados en
  ESTADO.md (botones por glyph/ancho, saltar onboarding, esperar `innerText`).

### Riesgos
1. **Web Push VAPID en Deno** (ver Función 2) — el único no trivial; verificar temprano.
2. **Suspensión toca 6 policies de insert** — recrear cada una conservando VERBATIM su condición
   vigente (sobre todo `messages`, que ya trae 3 condiciones). Un error aquí rompe publicar/chatear
   para todos. Test de que lo legítimo sigue pasando.
3. **`moderacion_bandeja` lee saltándose RLS** (definer) — cuidar que solo la use un admin y que no
   filtre datos de más (teléfono nunca; el snapshot de `contenido` es solo lo necesario para
   decidir).

### Pendientes de Pablo (no bloquean la construcción)
- Generar el par VAPID (`npx web-push generate-vapid-keys`): pública al `.env`
  (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`), privada + subject como secretos de la función.
- Cuando tenga su cuenta de dueño: `update profiles set es_admin=true where id='<su uuid>'`.

# Spike — Web Push (VAPID) en el runtime Deno de Supabase Edge Functions

**Resultado: FUNCIONA.** No hace falta plan B (jose + aes128gcm manual).

## Qué se probó

Se instaló Deno 2.9.3 localmente (`irm https://deno.land/install.ps1 | iex`, no
había binario en esta máquina) y se corrió `deno run` directo contra un script
que:

1. Importa `web-push@3.6.7` (el paquete npm de referencia para Web Push).
2. Genera un par de llaves VAPID reales (`generateVAPIDKeys()` — ejercita
   ECDH/`crypto`, que en Node usa el módulo nativo `crypto`).
3. Llama `setVapidDetails(subject, publicKey, privateKey)`.
4. Llama `sendNotification(sub, payload)` contra un endpoint con FORMA de
   endpoint real de FCM pero inexistente
   (`https://fcm.googleapis.com/fcm/send/spike-test-endpoint-inexistente`).

El envío corrió el pipeline completo — cifrado `aes128gcm` del payload +
firma del JWT VAPID (ECDSA) + el POST HTTP — y volvió un error HTTP real con
`statusCode` (410, porque el endpoint tiene forma válida de FCM pero no
existe). Es decir: la parte que más arriesgaba (crypto de Node dentro de
Deno) corre sin polyfills nuestros.

No se pudo probar contra una suscripción real de navegador (no había forma
de generar una desde este entorno sin UI), pero el criterio del spike —
"¿carga y corre la lib en Deno, incluida la parte de crypto?" — quedó
verificado: el 410 solo puede volver DESPUÉS de que el payload se cifró y el
JWT se firmó correctamente (si algo de eso fallara, tiraría una excepción de
la propia librería antes del fetch, no un statusCode HTTP).

## Dos formas de importar — por qué se eligió `npm:` y no `esm.sh`

Se probaron las dos:

- `import webpush from 'https://esm.sh/web-push@3.6.7'` — **carga y corre
  igual** en `deno run`, pero `deno check` falla con `TS1192`: el `.d.ts`
  que sirve esm.sh para este paquete declara `export =` (estilo CommonJS),
  que no calza con un `import default` de ESM. En tiempo de ejecución esm.sh
  hace el interop de todos modos (el `deno run` de arriba con esm.sh
  funcionó perfecto), pero el chequeo estático se queja.
- `import webpush from 'npm:web-push@3.6.7'` — carga y corre igual, Y
  `deno check` pasa limpio. Deno resuelve el paquete completo (con todas sus
  dependencias transitivas: `asn1.js`, `jws`, `http_ece`, etc.) contra el
  registro de npm directamente, sin pasar por esm.sh.

Se usa `npm:` en el módulo final (`webpush.ts`). Es el mismo tipo de
especificador que soporta el runtime de Supabase Edge Functions (documentado
oficialmente), así que no debería haber sorpresas al desplegar.

## Gotchas

- **Nadie tenía Deno instalado en esta máquina.** Se instaló con el script
  oficial de PowerShell; queda en `C:\Users\pdani\.deno\bin\deno.exe`, no en
  PATH por defecto en esta sesión (se invocó con ruta completa). Si otra
  persona necesita repetir el spike, ese es el primer paso.
- No se probó con Docker/`npx supabase functions serve` (no había Docker
  disponible en esta máquina) — se fue directo a `deno run`/`deno check`
  contra el archivo real, que es lo que de verdad ejercita el runtime Deno
  (que es lo que corre `supabase functions serve` por debajo, vía un
  contenedor).
- `sendNotification` **lanza** (no devuelve un código) cuando el servidor
  responde con error — de ahí el `try/catch` en `enviarWebPush` y por qué se
  lee `e.statusCode` (a veces `e.status` según la versión/camino de error de
  la librería): confirmado en la prueba real, el error trae
  `statusCode: 410`.
- El `subject` de VAPID debe ser un `mailto:` o una URL `https://` — no se
  probaron formatos inválidos, pero es el formato estándar del protocolo, no
  algo específico de esta librería.
- Faltó probar con una suscripción real de un navegador (Chrome/Firefox)
  contra una VAPID key real: eso queda para la verificación manual en
  producción (o un test manual con la propia PWA) una vez desplegada la
  Task 11. El spike cubre el riesgo técnico ("¿corre la lib en Deno?"), no
  el end-to-end contra un push service real.

## Conclusión para el diseño del módulo

`_shared/webpush.ts` usa `web-push` vía `npm:web-push@3.6.7` tal cual el
bosquejo del brief, sin necesidad de reimplementar cifrado/JWT a mano. La
función `enviarWebPush` nunca lanza: atrapa cualquier error y lo traduce a
`{ ok: false, gone: <404|410> }`, para que el llamador (Task 11) pueda
iterar varias suscripciones sin que una caída tumbe el resto del despacho.

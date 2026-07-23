// Envío de Web Push (VAPID) desde una Edge Function (runtime Deno).
//
// SPIKE (jul-2026, ver `webpush.spike.md`): la librería `web-push` (npm) SÍ
// carga y corre en Deno, incluida la parte que más arriesgaba (cifrado
// aes128gcm + firma del JWT VAPID, que en Node se apoyan en `crypto`/
// `Buffer`): el compat de Node de Deno resuelve esas dependencias solo.
//
// Se usa el especificador `npm:` (soportado nativamente por Deno y por el
// runtime de Supabase Edge Functions) en vez de `https://esm.sh/...`: se
// probaron los dos y cargan y funcionan igual en tiempo de ejecución, pero
// SOLO `npm:` pasa `deno check` limpio — con esm.sh, `deno check` tira
// TS1192 (el `.d.ts` que sirve esm.sh para este paquete declara `export =`
// de CommonJS, que no calza con un `import default` de ESM; en tiempo de
// ejecución esm.sh hace el interop igual, pero el chequeo estático no).
import webpush from 'npm:web-push@3.6.7';

export interface WebPushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  ruta: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Manda una notificación Web Push a UNA suscripción.
 *
 * `ok`: se entregó (o al menos el navegador/servicio la aceptó).
 * `gone`: el endpoint ya no existe (404/410) — el llamador debe borrar la
 * fila de `web_push_subscriptions`, la suscripción quedó obsoleta (el
 * usuario desinstaló, limpió datos del sitio, etc.).
 *
 * A propósito NUNCA lanza: un envío individual que falla (red, 4xx/5xx que
 * no sea "gone", credenciales VAPID mal puestas) no debe tumbar el resto del
 * despacho — el llamador itera varias suscripciones/usuarios y este es un
 * best-effort por diseño.
 */
export async function enviarWebPush(
  sub: WebPushSub,
  payload: WebPushPayload,
  vapid: VapidKeys,
): Promise<{ ok: boolean; gone: boolean }> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return { ok: true, gone: false };
  } catch (e: unknown) {
    const err = e as { statusCode?: number; status?: number };
    const code = err?.statusCode ?? err?.status;
    return { ok: false, gone: code === 404 || code === 410 };
  }
}

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { env } from './env';

// Cliente de Web Push (VAPID): activar/desactivar la suscripción del
// navegador y guardarla/borrarla en `web_push_subscriptions` (migración
// 0037). El envío server-side vive en `supabase/functions/_shared/webpush.ts`.
//
// Es un canal ADEMÁS del push por Expo (que ya existe y solo sirve dentro de
// la app instalada, nunca en la web): esto es lo que permite que alguien que
// usa "Encuentra tu Mascota" desde el navegador (PWA o pestaña suelta) siga
// recibiendo avisos con la pestaña cerrada.

export type EstadoWebPush = 'activada' | 'denegada' | 'no_soportado' | 'inactiva';

/**
 * base64url -> Uint8Array. Hace falta porque `PushManager.subscribe()` pide
 * la `applicationServerKey` (la llave pública VAPID) como `Uint8Array`, y
 * `EXPO_PUBLIC_VAPID_PUBLIC_KEY` llega en formato base64url (el que genera
 * `web-push.generateVAPIDKeys()`), no base64 estándar.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Web Push solo existe en un navegador con Service Worker + Push API. Nunca
// en la app nativa (ahí el push va por Expo/APNs/FCM, ver `pushTokens.ts`), y
// tampoco en navegadores viejos o Safari sin PWA instalada. Sin llave VAPID
// pública configurada tampoco hay nada que activar: se degrada a
// `no_soportado` en vez de intentar `subscribe()` y fallar más abajo.
function soportado(): boolean {
  return (
    Platform.OS === 'web' &&
    env.vapidPublicKey !== '' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

/** Estado actual, sin pedir permiso ni tocar nada: para pintar el botón correcto. */
export async function estadoWebPush(): Promise<EstadoWebPush> {
  if (!soportado()) return 'no_soportado';
  if (Notification.permission === 'denied') return 'denegada';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'activada' : 'inactiva';
}

/**
 * Pide permiso, suscribe al navegador y guarda la suscripción en la base
 * (asociada a `userId`) para que el dispatcher le pueda mandar avisos.
 */
export async function activarWebPush(userId: string): Promise<EstadoWebPush> {
  if (!soportado()) return 'no_soportado';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denegada';

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // El cast hace falta por un desajuste de tipos del lib.dom.ts instalado:
    // `Uint8Array<ArrayBufferLike>` no encaja con `BufferSource` porque ese
    // tipo exige específicamente `ArrayBuffer` (no `SharedArrayBuffer`, que
    // nunca es el caso acá). El valor en runtime es exactamente lo que pide
    // la Push API.
    applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey) as BufferSource,
  });
  const json = sub.toJSON();

  // onConflict: 'endpoint' hace que reactivar en el mismo navegador
  // actualice la fila existente en vez de duplicarla (el endpoint es único
  // por navegador+dispositivo+sitio, ver migración 0037). Cubre también el
  // caso de que la cuenta cambie: el mismo navegador ahora apunta a otro
  // user_id.
  const { error } = await supabase.from('web_push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
    { onConflict: 'endpoint' },
  );
  if (error) {
    // Si no se pudo guardar en la base, deshacemos la suscripción del
    // navegador: mejor "no activada" y consistente que una suscripción
    // fantasma que el dispatcher nunca encuentra.
    await sub.unsubscribe().catch((e) => {
      // Si ni siquiera se pudo deshacer, queda una suscripción del navegador
      // que la base no conoce: el dispatcher nunca le va a mandar nada y la
      // persona creerá que activó los avisos. No se puede hacer más desde acá
      // (el `throw error` de abajo ya le avisa que no se activó), pero esto
      // NO puede desaparecer sin dejar rastro.
      console.error('Quedó una suscripción de push huérfana en el navegador:', e?.message ?? e);
    });
    throw error;
  }

  return 'activada';
}

/**
 * Desactiva: borra la fila en la base y cancela la suscripción del navegador.
 *
 * Desuscribe el navegador incluso si el borrado en la base falla: mejor que
 * el navegador deje de recibir pushes ya (lo que el usuario pidió) aunque la
 * fila pueda quedar huérfana en `web_push_subscriptions`. Pero ese fallo del
 * borrado SÍ se propaga (no se traga en silencio): quien llama necesita
 * saber que la fila pudo no borrarse, para avisar o reintentar en vez de
 * reportar éxito engañoso.
 */
export async function desactivarWebPush(): Promise<void> {
  if (!soportado()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
  if (error) throw error;
}

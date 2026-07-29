import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Registra el token de push NATIVO (Expo). Lo llama `useAuth` en cuanto hay
// sesión, así que todo lo que pase acá le pasa a la persona apenas entra.
//
// EL ORDEN DE ESTAS TRES GUARDAS NO ES COSMÉTICO. El permiso de notificaciones
// se pide UNA sola vez: si alguien contesta "bloquear", el navegador (y el
// sistema, en móvil) no vuelve a preguntar nunca más, y `webPush.ts` lo da por
// perdido (`if (Notification.permission === 'denied') return 'denegada'`).
// Es una decisión irreversible del usuario, así que no se le puede pedir de
// arranque ni para nada.
export async function registerPushToken(userId: string): Promise<void> {
  // 1. En web esto no va. El push del navegador es Web Push (VAPID) y se activa
  //    desde un botón explícito en la pantalla Avisos, que fue una decisión de
  //    diseño. Con este registro corriendo al iniciar sesión, el cartel del
  //    navegador aparecía SOLO, sin que nadie lo pidiera —verificado en
  //    producción: 0 pedidos antes de entrar, 1 justo después— y quien
  //    contestaba "bloquear" por reflejo dejaba el botón de Avisos muerto para
  //    siempre. Pedirlo sin que la persona lo busque también hace que Chrome
  //    degrade el cartel a su versión silenciosa.
  if (Platform.OS === 'web') return;

  // 2. El projectId ANTES del permiso. Al revés (que es como estaba) se le
  //    pedía el permiso a la persona y se abandonaba dos líneas después por no
  //    tener projectId: se gastaba su única respuesta a cambio de nada. Hoy
  //    EAS_PROJECT_ID no está configurado, así que ese era SIEMPRE el camino.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Sin projectId de EAS: el push no se registrará hasta correr `eas init`.');
    return;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return; // dijo que no: es su decisión, no es un error

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

  // 3. El error del upsert NO se puede ignorar. supabase-js no lanza cuando la
  //    base rechaza: devuelve `{ error }`. Un `await` sin mirarlo (que es como
  //    estaba) descarta un rechazo de RLS y deja a la persona sin push, sin un
  //    solo rastro. Es el mismo modo de fallo que tuvo `send-push`, que estuvo
  //    semanas sin desplegar tapado por un `.catch(() => {})`.
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token: tokenData.data }, { onConflict: 'token' });
  if (error) {
    console.error('No se pudo guardar el token de push:', error.message);
    throw error;
  }
}

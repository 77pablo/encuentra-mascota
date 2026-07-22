import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { rutaANavegacion } from './rutaANavegacion';
import { navigationRef } from './navigationRef';

// Configura cómo se muestran las notificaciones cuando la app está ABIERTA
// (primer plano). Sin esto, un push que llega con la app abierta no se ve.
// Se llama una sola vez, al arrancar la app (ver App.tsx).
export function setupPushNotifications(): void {
  // En web no hay push nativo de Expo: no-op para no romper el bundle web.
  if (Platform.OS === 'web') return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  // Android exige un "canal" para poder mostrar notificaciones.
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {
      // Nunca dejar que la config de push tumbe la app.
    });
  }

  // Pulido (tanda 6): al TOCAR una notificación (app en segundo plano o
  // cerrada), navegamos a `data.ruta` si la reconocemos (ver
  // src/lib/rutaANavegacion.ts, función pura ya testeada). Si la app no
  // reconoce la ruta, o el navigationRef todavía no está listo (llegó antes
  // de que NavigationContainer montara), no hacemos nada: nunca lanza.
  // NO verificable end-to-end sin un build nativo (Expo Go/simulador no
  // entrega push reales de forma confiable); queda anotado como pendiente de
  // verificación en el primer build EAS (ver spec de la tanda, Pulido punto 3).
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { ruta?: unknown } | undefined;
    const destino = rutaANavegacion(data?.ruta);
    if (!destino) return;
    if (!navigationRef.isReady()) return;
    // `navigationRef` no tiene un RootParamList tipado (la app no lo declara);
    // el `any` acá es el mismo escape que usan las pantallas con `navigation: any`.
    (navigationRef as any).navigate(destino.name, destino.params);
  });
}

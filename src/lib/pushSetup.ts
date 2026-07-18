import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

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
}

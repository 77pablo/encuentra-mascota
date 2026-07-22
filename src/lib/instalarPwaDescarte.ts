import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Marca LOCAL (solo en este dispositivo) de si el usuario ya descartó la
// tarjeta de "instalá la app" en Inicio con la ✕, para no volver a
// mostrársela. Mismo enfoque never-throws que src/lib/onboarding.ts: si el
// almacenamiento falla, en el peor caso la tarjeta reaparece; nunca rompe.
const KEY = 'instalar_pwa_descartada';

export async function getInstalarPwaDescartada(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
    }
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setInstalarPwaDescartada(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, '1');
      return;
    }
    await SecureStore.setItemAsync(KEY, '1');
  } catch {
    // sin almacenamiento: se vuelve a mostrar la próxima vez, no pasa nada grave
  }
}

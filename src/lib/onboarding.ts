import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Marca LOCAL (solo en este dispositivo) de si el usuario ya vio el onboarding
// de bienvenida, para no volver a mostrarlo. Mismo enfoque never-throws que
// src/lib/lastVisit.ts: localStorage en web, SecureStore en móvil. Si el
// almacenamiento falla, en el peor caso el onboarding reaparece; nunca rompe.
const KEY = 'onboarding_visto';

export async function getOnboardingVisto(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
    }
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingVisto(): Promise<void> {
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

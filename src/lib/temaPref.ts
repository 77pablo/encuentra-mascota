import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Preferencia de tema, guardada LOCAL (solo este dispositivo). Never-throws,
// mismo enfoque que lastVisit.ts (localStorage web / SecureStore móvil). Si el
// almacenamiento falla, degrada a 'auto' (seguir el sistema).
export type ModoTema = 'auto' | 'claro' | 'oscuro';

const KEY = 'tema_pref';

function esModo(v: string | null): v is ModoTema {
  return v === 'auto' || v === 'claro' || v === 'oscuro';
}

export async function getTemaPref(): Promise<ModoTema> {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof localStorage !== 'undefined'
          ? localStorage.getItem(KEY)
          : null
        : await SecureStore.getItemAsync(KEY);
    return esModo(raw) ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

export async function setTemaPref(modo: ModoTema): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, modo);
      return;
    }
    await SecureStore.setItemAsync(KEY, modo);
  } catch {
    // sin almacenamiento: la próxima vez vuelve a 'auto', no rompe nada
  }
}

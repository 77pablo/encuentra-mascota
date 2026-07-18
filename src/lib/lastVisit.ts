import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Guarda LOCALMENTE (solo en este dispositivo) la última vez que el usuario
// revisó su zona de alerta, para poder calcular "reportes nuevos desde tu
// última visita". No es dato sensible ni compartido, así que vive en el
// almacenamiento local: localStorage en web, SecureStore en móvil (mismo
// enfoque que usa src/lib/supabase.ts para la sesión).
//
// Nunca lanza: si el almacenamiento no está disponible, degrada a null / no-op
// para que la función jamás rompa la app.
const KEY = 'zona_alerta_ultima_visita';

async function readRaw(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    }
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function writeRaw(value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, value);
      return;
    }
    await SecureStore.setItemAsync(KEY, value);
  } catch {
    // Sin almacenamiento no pasa nada grave: simplemente no recordamos la visita.
  }
}

// Devuelve el ISO de la última visita, o null si nunca se ha guardado.
export async function getLastVisit(): Promise<string | null> {
  return readRaw();
}

// Marca "ahora" como la última visita (reinicia el conteo de nuevos).
export async function markVisitedNow(now: number = Date.now()): Promise<string> {
  const iso = new Date(now).toISOString();
  await writeRaw(iso);
  return iso;
}

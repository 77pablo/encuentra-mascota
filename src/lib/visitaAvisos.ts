import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// LA "ÚLTIMA VISITA" A LA BANDEJA DE AVISOS, GUARDADA SOLO EN ESTE DISPOSITIVO.
//
// Es lo que hace que el badge de "avisos nuevos" no necesite ninguna migración
// extra: marcar leído del lado del servidor pediría una columna en
// `notification_events` (la tabla sin RLS pública) y encima otra RPC para
// poder escribirla. Para un contador, no vale la pena.
//
// Contrapartida honesta: si la persona entra desde el teléfono, el badge del
// navegador sigue mostrando los mismos avisos como nuevos. Es aceptable —
// equivocarse hacia "hay algo para mirar" es el lado seguro.
//
// Mismo enfoque never-throws que src/lib/lastVisit.ts y src/lib/onboarding.ts:
// localStorage en web, SecureStore en móvil, y si el almacenamiento no está
// disponible degrada a null / no-op. Un badge no puede tumbar el Perfil.
const KEY = 'avisos_ultima_visita';

// El ISO de la última vez que se abrió la bandeja, o null si nunca se abrió
// (en cuyo caso todos los avisos cuentan como nuevos).
export async function ultimaVisitaAvisos(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    }
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

// Marca hasta dónde se leyó. Recibe el corte por parámetro (nada de `new Date()`
// adentro, convención del repo): la pantalla pasa la fecha del aviso más nuevo
// que efectivamente mostró, no "ahora" — así un aviso que llegó mientras la
// pantalla estaba abierta no queda marcado como visto sin haberse visto.
export async function marcarAvisosLeidos(hasta: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, hasta);
      return;
    }
    await SecureStore.setItemAsync(KEY, hasta);
  } catch {
    // Sin almacenamiento: el badge vuelve a contar todo la próxima vez. Molesta,
    // no rompe.
  }
}

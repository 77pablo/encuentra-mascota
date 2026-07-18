// URL pública de un reporte para compartir. En web usa el origen actual; en
// móvil usa EXPO_PUBLIC_WEB_URL (configurado tras desplegar la web).
import { Platform } from 'react-native';

export function petUrl(petId: string): string | null {
  const base =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.EXPO_PUBLIC_WEB_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/mascota/${petId}`;
}

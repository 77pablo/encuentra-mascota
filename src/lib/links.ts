// URL pública de un reporte/publicación para compartir. En web usa el origen
// actual; en móvil usa EXPO_PUBLIC_WEB_URL (configurado tras desplegar la web).
import { Platform } from 'react-native';

function baseUrl(): string {
  return Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.EXPO_PUBLIC_WEB_URL || '').replace(/\/$/, '');
}

export function petUrl(petId: string): string | null {
  const base = baseUrl();
  if (!base) return null;
  return `${base}/mascota/${petId}`;
}

// Espejo de `petUrl` para las publicaciones de adopción (F3).
export function adopcionUrl(adoptionId: string): string | null {
  const base = baseUrl();
  if (!base) return null;
  return `${base}/adopcion/${adoptionId}`;
}

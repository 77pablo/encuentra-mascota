// Etiqueta de collar con QR: contenido y URL de la placa imprimible.
//
// La página pública del collar vive en `<WEB_URL>/collar/<token>`. En web usa el
// origen actual; en móvil usa EXPO_PUBLIC_WEB_URL (mismo criterio que links.ts).
import { Platform } from 'react-native';

export interface EtiquetaCollar {
  nombre: string;
  mensaje: string;
  url: string | null;
}

function baseWeb(): string {
  return Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.EXPO_PUBLIC_WEB_URL || '').replace(/\/$/, '');
}

// URL pública de la placa. `null` si no hay base configurada (móvil sin
// EXPO_PUBLIC_WEB_URL): sin base el QR no llevaría a ningún lado.
export function collarUrl(token: string): string | null {
  const base = baseWeb();
  if (!base) return null;
  return `${base}/collar/${token}`;
}

const MENSAJE = 'Si me encontraste, escaneá este código: mi familia me está buscando.';

export function armarEtiquetaCollar(pet: {
  nombre: string;
  especie: 'perro' | 'gato' | 'otro';
  collar_token: string;
}): EtiquetaCollar {
  return {
    nombre: pet.nombre,
    mensaje: MENSAJE,
    url: collarUrl(pet.collar_token),
  };
}

// Nombre de archivo del PNG, en slug. Mismo criterio que armarNombreArchivo del
// afiche (sin tildes, minúsculas, guiones), con prefijo `collar-`.
export function armarNombreArchivoCollar(pet: { nombre: string }): string {
  const slug =
    pet.nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mascota';
  return `collar-${slug}.png`;
}

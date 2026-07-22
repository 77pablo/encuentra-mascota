import { Linking } from 'react-native';

// Abre el mapa del dispositivo (o el navegador en web) con una búsqueda ya
// hecha —"veterinarias cerca", "refugios", etc.—. Usamos la URL universal de
// Google Maps: en móvil abre la app de mapas, en web abre el navegador. Es
// SIEMPRE actualizado y no hay que mantener ninguna lista de datos.

export function urlBusquedaMapa(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Abre la búsqueda. Nunca lanza: si el dispositivo no puede abrir la URL (sin
// navegador/mapas), degrada en silencio en vez de romper la pantalla.
export async function abrirBusquedaMapa(query: string): Promise<void> {
  try {
    await Linking.openURL(urlBusquedaMapa(query));
  } catch {
    // sin app de mapas / navegador: no hacemos nada
  }
}

// Abre una URL suelta (recursos nacionales), con la misma tolerancia a fallos.
export async function abrirEnlace(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // no rompemos la pantalla si no se puede abrir
  }
}

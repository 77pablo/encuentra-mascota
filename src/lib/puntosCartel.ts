import { distanceKm, LatLng } from './geo';

// PUNTOS PARA CARTELES (Tanda 18) — lógica pura, sin red.
//
// Proxy de "esquina de tráfico donde pegar un cartel": los SEMÁFOROS
// (traffic_signals de OpenStreetMap). Un auto que para en un semáforo alcanza a
// leer un cartel; la guía ya nombra "semáforos, paraderos". Devolver los nodos
// de OSM directo evita calcular intersecciones de calles (caro y frágil).

export interface PuntoCartel {
  lat: number;
  lng: number;
  distanciaM: number;
}

// Consulta Overpass: semáforos dentro de `radioM` metros del punto. `out;`
// devuelve los nodos con sus coordenadas. Timeout server-side de 25 s (Overpass
// es lento; el cliente además aborta por su cuenta).
export function armarQueryOverpass(lat: number, lng: number, radioM: number): string {
  return (
    `[out:json][timeout:25];` +
    `node(around:${radioM},${lat},${lng})["highway"="traffic_signals"];` +
    `out;`
  );
}

// Parsea la respuesta de Overpass a una lista ordenada por cercanía. Nunca
// lanza: ante cualquier basura devuelve []. Ignora nodos sin coordenadas.
export function parsearSemaforos(
  json: unknown,
  centro: LatLng,
  tope = 6,
): PuntoCartel[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  return elements
    .filter(
      (e): e is { lat: number; lon: number } =>
        !!e && typeof (e as any).lat === 'number' && typeof (e as any).lon === 'number',
    )
    .map((e) => ({
      lat: e.lat,
      lng: e.lon,
      distanciaM: Math.round(distanceKm(centro, { lat: e.lat, lng: e.lon }) * 1000),
    }))
    .sort((a, b) => a.distanciaM - b.distanciaM)
    .slice(0, tope);
}

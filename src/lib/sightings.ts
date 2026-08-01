import { Sighting } from '../services/sightings';
import { LatLng, distanceKm, distanceLabel } from './geo';
import { timeAgo } from './time';

// Ordena avistamientos del más reciente al más antiguo. Lógica pura (sin red)
// para poder testearla y reutilizarla desde cualquier pantalla. No muta el
// arreglo original.
export function sortByRecency(sightings: Sighting[]): Sighting[] {
  return [...sightings].sort(
    (a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime(),
  );
}

// El avistamiento más reciente, o null si no hay ninguno.
export function latestSighting(sightings: Sighting[]): Sighting | null {
  return sortByRecency(sightings)[0] ?? null;
}

// Quién puede BORRAR un avistamiento: el que lo dejó o el dueño del reporte.
// Mismo criterio que la RLS de la migración 0007 ("borrar mi avistamiento o el
// dueño del reporte"), que existía desde el principio pero no la llamaba nadie:
// hasta ahora, lo único que el dueño podía hacer con una pista falsa en SU
// reporte era denunciarla y esperar a que una persona la mirara a mano.
// El invitado (userId nulo) nunca puede.
export function puedeBorrarAvistamiento(
  s: Pick<Sighting, 'user_id'>,
  userId: string | null,
  duenoDelReporte: string,
): boolean {
  if (!userId) return false;
  return userId === s.user_id || userId === duenoDelReporte;
}

// Distancia en km desde el punto del reporte hasta un avistamiento.
export function sightingDistanceKm(origin: LatLng, s: Pick<Sighting, 'lat' | 'lng'>): number {
  return distanceKm(origin, { lat: s.lat, lng: s.lng });
}

// Resumen corto para la cabecera de la sección, p. ej.:
// "Último avistamiento a 1,2 km · hace 3 h". `origin` es el punto del reporte.
// Devuelve null cuando todavía no hay avistamientos.
export function summaryLabel(
  origin: LatLng,
  sightings: Sighting[],
  now: number = Date.now(),
): string | null {
  const last = latestSighting(sightings);
  if (!last) return null;
  const dist = distanceLabel(sightingDistanceKm(origin, last));
  return `Último avistamiento ${dist} · ${timeAgo(last.creado_en, now)}`;
}

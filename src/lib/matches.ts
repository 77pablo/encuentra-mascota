import { Pet } from '../services/pets';
import { distanceKm } from './geo';

export interface PetMatch {
  pet: Pet;
  distanceKm: number;
}

export interface FindMatchesOptions {
  maxKm?: number; // radio máximo para considerar una coincidencia (default 15)
  limit?: number; // máximo de resultados a devolver (default 5)
}

// Dos especies "coinciden" si son la misma; "otro" actúa como comodín, porque
// muchos reportes de mascotas no perro/gato se clasifican como "otro".
export function especieCompatible(a: Pet['especie'], b: Pet['especie']): boolean {
  return a === b || a === 'otro' || b === 'otro';
}

// Sugiere posibles coincidencias para un reporte: si la mascota está "perdida"
// busca reportes de "encontrada" (y viceversa), de especie compatible y dentro
// de un radio, ordenados de más cerca a más lejos. Lógica pura (sin red) para
// poder testearla y reutilizarla desde cualquier pantalla.
export function findMatches(
  target: Pet,
  candidates: Pet[],
  opts: FindMatchesOptions = {},
): PetMatch[] {
  const maxKm = opts.maxKm ?? 15;
  const limit = opts.limit ?? 5;
  const opuesto: Pet['estado'] = target.estado === 'perdida' ? 'encontrada' : 'perdida';

  return candidates
    .filter((c) => c.id !== target.id)
    .filter((c) => c.estado === opuesto)
    .filter((c) => especieCompatible(target.especie, c.especie))
    .map((c) => ({
      pet: c,
      distanceKm: distanceKm({ lat: target.lat, lng: target.lng }, { lat: c.lat, lng: c.lng }),
    }))
    .filter((m) => m.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

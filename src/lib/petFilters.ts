// Filtros avanzados de la Lista: "con recompensa" y "rango de tiempo".
// Lógica pura y testeable — `now` se pasa como parámetro para no depender del reloj.
import { Pet } from '../services/pets';

export type RangoTiempo = 'todo' | 'hoy' | 'semana';

const DIA_MS = 24 * 60 * 60 * 1000;
const SEMANA_MS = 7 * DIA_MS;

// Subconjunto de Pet que necesitan estos filtros. Facilita testear con fixtures mínimas.
type PetLike = Pick<Pet, 'recompensa' | 'creado_en'>;

// True si la mascota tiene recompensa con texto real (no null, no solo espacios).
export function tieneRecompensa(pet: Pick<Pet, 'recompensa'>): boolean {
  return typeof pet.recompensa === 'string' && pet.recompensa.trim() !== '';
}

// Aplica el toggle "solo con recompensa". Si está apagado, pasan todas.
export function matchesReward(pet: Pick<Pet, 'recompensa'>, soloConRecompensa: boolean): boolean {
  if (!soloConRecompensa) return true;
  return tieneRecompensa(pet);
}

// True si `creado_en` cae dentro del rango elegido respecto de `now`.
// 'hoy' = últimas 24 h, 'semana' = últimos 7 días, 'todo' = sin límite.
export function matchesTimeRange(
  pet: Pick<Pet, 'creado_en'>,
  rango: RangoTiempo,
  now: number,
): boolean {
  if (rango === 'todo') return true;
  const creado = new Date(pet.creado_en).getTime();
  if (Number.isNaN(creado)) return false;
  const edad = now - creado;
  if (edad < 0) return true; // fechas futuras (reloj desfasado): no las escondemos
  const limite = rango === 'hoy' ? DIA_MS : SEMANA_MS;
  return edad <= limite;
}

export interface FiltrosExtra {
  conRecompensa: boolean;
  rango: RangoTiempo;
}

// Combina ambos filtros sobre una lista, sin mutar el arreglo original.
export function filterByExtras<T extends PetLike>(pets: T[], filtros: FiltrosExtra, now: number): T[] {
  return pets.filter(
    (p) => matchesReward(p, filtros.conRecompensa) && matchesTimeRange(p, filtros.rango, now),
  );
}

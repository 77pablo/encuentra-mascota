import { Pet } from '../services/pets';
import { timeAgo } from './time';

// Lógica pura del "final feliz" (verificación de reencuentro). Sin red, para
// poder probarla y reutilizarla desde cualquier pantalla.
//
// Un reporte cuenta como reencuentro cuando está cerrado (`activo=false`) y
// además tiene fecha de reencuentro (`reunida_en`). Así distinguimos una
// vuelta a casa de un cierre común.

export type ReunionFields = Pick<Pet, 'activo' | 'reunida_en'>;

export function isReunited(pet: ReunionFields): boolean {
  return pet.activo === false && pet.reunida_en != null && pet.reunida_en !== '';
}

// Etiqueta cálida con el tiempo relativo del reencuentro, p. ej.
// "Volvió a casa hace 2 días". Devuelve '' si no hay fecha de reencuentro.
export function reunionLabel(pet: Pick<Pet, 'reunida_en'>, now: number = Date.now()): string {
  if (!pet.reunida_en) return '';
  return `Volvió a casa ${timeAgo(pet.reunida_en, now)}`;
}

import { Pet } from '../services/pets';
import { isReunited } from './reunion';

// CICLO DE VIDA DEL REPORTE — lógica pura (sin red), un solo lugar para los
// umbrales. La verdad de la visibilidad la tiene Postgres (buscar_reportes con
// la condición de 45 días); acá derivamos el flag para nudgear y para realzar
// los vencidos en "Mis reportes".
//
// - A los 14 días empezamos a preguntar amablemente "¿ya volvió a casa?".
// - A los 30 días seguimos preguntando (segundo recordatorio suave).
// - A los 45 días sin renovar el reporte VENCE: sale solo de las búsquedas
//   (auto-archivado perezoso) y el dueño lo reactiva en un toque.

export const DIAS_PRIMER_NUDGE = 14;
export const DIAS_SEGUNDO_NUDGE = 30;
export const DIAS_VENCIMIENTO = 45;

const DIA_MS = 24 * 60 * 60 * 1000;

// Los campos del reporte que necesita el ciclo de vida. `renovado_en` puede
// faltar en reportes viejos (anteriores a la migración 0028): en ese caso el
// reloj cuenta desde la creación.
export type CicloFields = Pick<Pet, 'creado_en' | 'renovado_en' | 'activo' | 'reunida_en'>;

// "Ancla" del reloj: la última vez que el dueño confirmó vigencia (renovado_en)
// o, si nunca renovó, la fecha de creación.
function anclaMs(pet: Pick<Pet, 'creado_en' | 'renovado_en'>): number {
  const base = pet.renovado_en ?? pet.creado_en;
  return new Date(base).getTime();
}

// Días enteros transcurridos desde la última renovación (o la creación).
export function diasDesdeRenovacion(
  pet: Pick<Pet, 'creado_en' | 'renovado_en'>,
  now: number = Date.now(),
): number {
  return Math.floor((now - anclaMs(pet)) / DIA_MS);
}

// Vencido = pasaron 45+ días sin renovar. Un reporte reunido nunca vence: ya
// está cerrado con su final feliz, no se archiva por inactividad.
export function vencido(pet: CicloFields, now: number = Date.now()): boolean {
  if (isReunited(pet)) return false;
  return diasDesdeRenovacion(pet, now) >= DIAS_VENCIMIENTO;
}

// Hay que nudgear cuando el reporte cruzó los 14 días y sigue vigente: activo,
// no reunido y todavía no vencido. A los 45 (vencido) se deja de nudgear: el
// reporte ya salió de las búsquedas y en su lugar mostramos el realce de
// "vencido / reactivar" en "Mis reportes".
export function debeNudgear(pet: CicloFields, now: number = Date.now()): boolean {
  if (pet.activo === false) return false; // cerrado (reunido o "ya apareció")
  if (isReunited(pet)) return false;
  const dias = diasDesdeRenovacion(pet, now);
  return dias >= DIAS_PRIMER_NUDGE && dias < DIAS_VENCIMIENTO;
}

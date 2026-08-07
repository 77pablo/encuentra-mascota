import { tieneRecompensa } from './recompensa';

// Texto plano listo para pegar en un grupo de Facebook/WhatsApp. Plano a
// propósito: esos grupos no renderizan markdown. NUNCA el monto de recompensa
// (imán de estafas — ver lib/recompensa.ts) ni el teléfono (privacidad: el
// contacto va por la ficha, con sesión). Sin `new Date()`: no depende del reloj.
export type DatosDifusion = {
  nombre?: string | null;
  especie: string;
  estado: string;
  comuna?: string | null;
  descripcion?: string | null;
  recompensa?: string | null;
  robada?: boolean;
};

export function armarTextoDifusion(pet: DatosDifusion, url: string): string {
  const quien = pet.nombre?.trim() ? pet.nombre.trim() : pet.especie;
  const donde = pet.comuna?.trim() ? ` en ${pet.comuna.trim()}` : '';
  const titulo =
    pet.estado === 'encontrada'
      ? `🐾 Encontré un ${pet.especie}${donde}. ¿Es tuyo o sabés de quién es?`
      : pet.robada
        ? `🚨 ROBARON a ${quien}${donde}. Ayudame a encontrarlo.`
        : `🚨 Se perdió ${quien}${donde}. Ayudame a encontrarlo.`;
  const senas = pet.descripcion?.trim() ? `\n${pet.descripcion.trim()}` : '';
  const recompensa = tieneRecompensa(pet.recompensa) ? '\nHay recompensa.' : '';
  const cierre = '\n\nMirá la ficha y avisá acá (no hace falta crear cuenta):';
  return `${titulo}${senas}${recompensa}${cierre}\n${url}`;
}

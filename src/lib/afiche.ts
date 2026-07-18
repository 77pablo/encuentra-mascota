import { Pet } from '../services/pets';
import { Profile } from '../services/profile';
import { petUrl } from './links';

export interface AficheContent {
  titular: string;
  nombre: string | null;
  subtitulo: string;
  senas: string;
  recompensa: string | null;
  zonaTexto: string;
  foto: string | null;
  whatsappDigits: string;
  whatsappDisplay: string;
  waLink: string | null;
  url: string | null;
}

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Deja solo los dígitos del teléfono (formato que usa wa.me).
export function normalizarWhatsapp(telefono: string | null | undefined): string {
  return (telefono ?? '').replace(/\D/g, '');
}

// Un afiche sin WhatsApp pierde fuerza: esto decide si mostrar la guardia
// "cargá tu WhatsApp" antes de generar.
export function faltaWhatsapp(profile: Pick<Profile, 'telefono'> | null | undefined): boolean {
  return normalizarWhatsapp(profile?.telefono).length === 0;
}

export function armarSubtitulo(pet: Pick<Pet, 'especie' | 'raza'>): string {
  const base = especieLabel[pet.especie];
  return pet.raza ? `${base} · ${pet.raza}` : base;
}

export function armarNombreArchivo(pet: Pick<Pet, 'nombre' | 'especie'>): string {
  const raw = (pet.nombre || especieLabel[pet.especie]).toLowerCase();
  const slug =
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mascota';
  return `afiche-${slug}.png`;
}

export function armarAfiche(pet: Pet, profile: Pick<Profile, 'telefono'> | null): AficheContent {
  const digits = normalizarWhatsapp(profile?.telefono);
  return {
    titular: pet.estado === 'perdida' ? 'SE BUSCA' : '¿CONOCÉS A ESTA MASCOTA?',
    nombre: pet.nombre || null,
    subtitulo: armarSubtitulo(pet),
    senas: pet.descripcion,
    recompensa: pet.recompensa || null,
    zonaTexto: 'Visto cerca de esta zona',
    foto: pet.fotos?.[0] ?? null,
    whatsappDigits: digits,
    whatsappDisplay: profile?.telefono ?? '',
    waLink: digits ? `https://wa.me/${digits}` : null,
    url: petUrl(pet.id),
  };
}

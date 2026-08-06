// Grupos públicos grandes de mascotas perdidas en Chile. Es donde se mueven los
// casos de verdad (búsqueda 6-ago-2026), y llevar ahí nuestros reportes ataca el
// arranque en frío — nuestro problema n°1. ⚠️ Cada link se verifica A MANO antes
// de sumarlo: un grupo muerto frustra a quien más lo necesita. Nada de scraping
// ni auto-descubrimiento.
export type GrupoDifusion = {
  nombre: string;
  url: string;
  red: 'facebook' | 'whatsapp';
  alcance: 'nacional' | string; // 'nacional' o el nombre de comuna
};

export const GRUPOS: GrupoDifusion[] = [
  {
    nombre: 'SOLO MASCOTAS PERDIDAS O ENCONTRADAS (Chile)',
    url: 'https://www.facebook.com/groups/195675330629289',
    red: 'facebook',
    alcance: 'nacional',
  },
  {
    nombre: 'Animales Perdidos/Encontrados Chile',
    url: 'https://www.facebook.com/groups/185121065481026',
    red: 'facebook',
    alcance: 'nacional',
  },
  {
    nombre: 'Perros Perdidos Santiago - Chile',
    url: 'https://www.facebook.com/groups/557979667691631',
    red: 'facebook',
    alcance: 'nacional',
  },
  {
    nombre: 'Chile SOSAFE Mascotas Perdidas',
    url: 'https://www.facebook.com/groups/403011684354362',
    red: 'facebook',
    alcance: 'nacional',
  },
];

// Los de la comuna primero, después los nacionales. Orden estable dentro de cada
// grupo (el del data file). Sin comuna, solo nacionales.
export function gruposSugeridos(comuna: string | null): GrupoDifusion[] {
  const deComuna = comuna ? GRUPOS.filter((g) => g.alcance === comuna) : [];
  const nacionales = GRUPOS.filter((g) => g.alcance === 'nacional');
  return [...deComuna, ...nacionales];
}

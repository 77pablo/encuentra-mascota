import { Pet } from '../services/pets';
import { armarSubtitulo } from './afiche';

export interface TarjetaTextos {
  banda: string; // "PERDIDA EN MAIPÚ" / "ENCONTRADA" (sin comuna: solo el estado)
  titulo: string; // nombre del reporte, o una pregunta si no tiene
  subtitulo: string | null; // "Perro · Quiltro" (especie + raza si hay)
  esPerdida: boolean;
}

// Textos de la tarjeta compartible (F1). Puro: sin JSX ni captura, para poder
// testearlo sin montar nada. El color de la banda (rojo/verde) ya comunica el
// estado, así que el texto va SIN emoji (a diferencia de `buildShareText`).
export function tarjetaTextos(pet: Pick<Pet, 'estado' | 'especie' | 'raza' | 'nombre' | 'comuna'>): TarjetaTextos {
  const esPerdida = pet.estado === 'perdida';
  const base = esPerdida ? 'perdida' : 'encontrada';
  const comuna = pet.comuna?.trim();
  // toLocaleUpperCase('es') para que los acentos (Ñuñoa, Maipú) mayusculen bien.
  const banda = (comuna ? `${base} en ${comuna}` : base).toLocaleUpperCase('es');
  const titulo = pet.nombre || (esPerdida ? '¿La has visto?' : '¿Es tuya?');
  const subtitulo = armarSubtitulo(pet);
  return { banda, titulo, subtitulo, esPerdida };
}

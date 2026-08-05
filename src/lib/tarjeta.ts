import { Pet } from '../services/pets';
import { Adoption } from '../services/adoptions';
import { armarSubtitulo, RESPALDO_WEB } from './afiche';
import { petUrl, adopcionUrl } from './links';
import { lightColors } from '../theme';

// Respaldo del QR de una ficha cuando no hay base web configurada (móvil sin
// EXPO_PUBLIC_WEB_URL). Deuda tanda 13 (D2 · Step 4): esto se armaba antes
// DENTRO de `TarjetaCompartir`, que para cuando renderiza ya perdió el id del
// reporte (`DatosTarjeta` es genérico a propósito) y caía al dominio pelado
// (RESPALDO_WEB solo) — el QR de respaldo llevaba a la home en vez de a la
// ficha. Armándolo acá, donde el id todavía está a mano, `qrUrl` sale siempre
// resuelto y el componente sólo consume.
export function urlDeRespaldo(petId: string): string {
  return `${RESPALDO_WEB}/mascota/${petId}`;
}

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

// Shape genérico que consume `TarjetaCompartir`/`TarjetaGenerador`/
// `compartirTarjeta`: cualquier "tipo" de tarjeta (reporte, adopción, final
// feliz) se reduce a esto antes de llegar a la captura/compartir, así esos
// componentes no conocen `Pet` ni `Adoption`.
export interface DatosTarjeta {
  banda: string;
  bandaColor: string;
  titulo: string;
  subtitulo: string | null;
  fotoUrl: string | null;
  qrUrl: string;
  nombreArchivo: string;
}

// Colores de banda de la tarjeta de reporte (F1, sin cambios): rojo perdida,
// verde encontrada. Antes vivían como constantes dentro de TarjetaCompartir.
const BANDA_PERDIDA = '#C62828';
const BANDA_ENCONTRADA = '#2E7D32';

// Arma la tarjeta de un reporte (perdida/encontrada). Envuelve `tarjetaTextos`
// tal cual: mismo banda/título/subtítulo que rendía la tarjeta antes de esta
// generalización, sin cambios de comportamiento.
export function datosDeReporte(pet: Pet): DatosTarjeta {
  const { banda, titulo, subtitulo, esPerdida } = tarjetaTextos(pet);
  return {
    banda,
    bandaColor: esPerdida ? BANDA_PERDIDA : BANDA_ENCONTRADA,
    titulo,
    subtitulo,
    fotoUrl: pet.fotos?.[0] ?? null,
    qrUrl: petUrl(pet.id) ?? urlDeRespaldo(pet.id),
    nombreArchivo: `mascota-${pet.id}.png`,
  };
}

const especieLabelAdopcion: Record<Adoption['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const edadLabelAdopcion: Record<NonNullable<Adoption['edad']>, string> = {
  cachorro: 'Cachorro',
  adulto: 'Adulto',
  senior: 'Senior',
};

const tamanoLabelAdopcion: Record<NonNullable<Adoption['tamano']>, string> = {
  chico: 'Chico',
  mediano: 'Mediano',
  grande: 'Grande',
};

// F3 — tarjeta "BUSCA HOGAR" de una publicación de adopción. Banda con la
// comuna si la hay (mismo patrón que `tarjetaTextos`), color de marca (pino),
// subtítulo con especie + edad + tamaño (solo los que estén presentes).
export function datosDeAdopcion(
  adopcion: Pick<Adoption, 'id' | 'nombre' | 'especie' | 'edad' | 'tamano' | 'comuna' | 'fotos'>,
): DatosTarjeta {
  const comuna = adopcion.comuna?.trim();
  const banda = (comuna ? `busca hogar en ${comuna}` : 'busca hogar').toLocaleUpperCase('es');
  const titulo = adopcion.nombre || especieLabelAdopcion[adopcion.especie];
  const partes = [especieLabelAdopcion[adopcion.especie]];
  if (adopcion.edad) partes.push(edadLabelAdopcion[adopcion.edad]);
  if (adopcion.tamano) partes.push(tamanoLabelAdopcion[adopcion.tamano]);
  return {
    banda,
    bandaColor: lightColors.brand,
    titulo,
    subtitulo: partes.join(' · '),
    fotoUrl: adopcion.fotos?.[0] ?? null,
    // Mismo criterio que `urlDeRespaldo`, pero a `/adopcion/<id>`: sin base
    // configurada tampoco puede caer al dominio pelado.
    qrUrl: adopcionUrl(adopcion.id) ?? `${RESPALDO_WEB}/adopcion/${adopcion.id}`,
    nombreArchivo: `adopcion-${adopcion.id}.png`,
  };
}

const especieLabelFinalFeliz: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Días completos entre dos fechas ISO (`hasta - desde`). Puro y sin `Date.now`:
// ambas fechas son parámetros. Devuelve `null` si alguna es inválida, si el
// orden es raro (hasta antes que desde) o si todavía no pasó un día completo
// (un reencuentro el mismo día no suma "0 días después").
export function diasEntre(desde: string, hasta: string): number | null {
  const t0 = Date.parse(desde);
  const t1 = Date.parse(hasta);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  const dias = Math.floor((t1 - t0) / (24 * 60 * 60 * 1000));
  return dias >= 1 ? dias : null;
}

// F4 — tarjeta "¡VOLVIÓ A CASA!" de un reporte reunido. Foto: la del
// reencuentro si hay (`final_foto`), si no la primera del reporte. Subtítulo
// "X días después" solo si `diasEntre` da un número (si no, sin subtítulo).
export function datosDeFinalFeliz(
  pet: Pick<Pet, 'id' | 'nombre' | 'especie' | 'fotos' | 'final_foto' | 'creado_en' | 'reunida_en'>,
): DatosTarjeta {
  const titulo = pet.nombre || especieLabelFinalFeliz[pet.especie];
  const dias = pet.reunida_en ? diasEntre(pet.creado_en, pet.reunida_en) : null;
  const subtitulo = dias != null ? `${dias} día${dias === 1 ? '' : 's'} después` : null;
  return {
    banda: '¡VOLVIÓ A CASA!',
    bandaColor: lightColors.found,
    titulo,
    subtitulo,
    fotoUrl: pet.final_foto ?? pet.fotos?.[0] ?? null,
    qrUrl: petUrl(pet.id) ?? urlDeRespaldo(pet.id),
    nombreArchivo: `final-feliz-${pet.id}.png`,
  };
}

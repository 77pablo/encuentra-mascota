import { normalize } from './text';

// Filtro proactivo de contenido para el texto de un reporte (Apple guideline 1.2:
// hay que IMPEDIR que se publique contenido objetable, no solo reaccionar).
//
// Filosofía: CONSERVADOR a propósito. Solo frena lo que las tiendas consideran
// objetable (odio/discriminación, sexual explícito) y la venta de animales que
// los Términos prohíben. NO filtra el registro coloquial chileno (weón, culiao):
// no es "objetable" para Apple y bloquearlo frustraría a alguien angustiado
// publicando de buena fe — el peor error posible en esta app.
//
// El control de las FOTOS no vive acá: es la casilla de confirmación al publicar
// + denunciar/bloquear (Tanda B) + retiro rápido. Ver el spec del 21-jul.

export type ResultadoModeracion = { ok: true } | { ok: false; motivo: string };

export interface CamposReporte {
  nombre?: string;
  raza?: string;
  descripcion?: string;
  recompensa?: string;
}

const MOTIVO_ODIO =
  'El texto tiene términos ofensivos o discriminatorios. Quítalos para publicar.';
const MOTIVO_SEXUAL =
  'El texto tiene contenido sexual. Esta app es solo para reunir mascotas con su familia.';
const MOTIVO_VENTA =
  'No se pueden publicar ventas de animales. Este espacio es solo para mascotas perdidas o encontradas.';

// Listas cortas y explícitas. Se comparan sobre texto NORMALIZADO (minúsculas y
// sin acentos, ver text.ts) y por PALABRA COMPLETA, así que se escriben sin
// tildes. Mantener acotadas: cada palabra agregada es un falso positivo en
// potencia. La forma base alcanza porque el match es por raíz con sufijos
// acotados (ver `contienePalabra`).
const PALABRAS_ODIO = [
  'maricon',
  'marica',
  'maraco',
  'negro de mierda',
  'sudaca',
  'indio de mierda',
  'retardado',
  'mongolico',
];

// A propósito NO incluye 'sexo'/'sexual' a secas: un reporte legítimamente dice
// "sexo: macho" o "aún no está esterilizado sexualmente" para describir al
// animal. Solo términos y frases inequívocamente sexuales.
const PALABRAS_SEXUAL = [
  'pene',
  'vagina',
  'pornografia',
  'porno',
  'masturba',
  'follar',
  'orgasmo',
  'tener sexo',
  'sexo oral',
  'coger contigo',
];

// Venta: es la categoría con más riesgo de falso positivo, así que exige
// CO-OCURRENCIA de un verbo/indicio de venta Y un término de animal o cría.
// "Vendí mi casa" no cae (no hay término de animal); "recompensa sin precio"
// tampoco (no hay verbo de venta con objeto animal).
const INDICIOS_VENTA = [
  'vendo',
  'venta',
  'se vende',
  'se venden',
  'vendemos',
  'vender',
  'en venta',
];
const TERMINOS_ANIMAL_VENTA = [
  'cachorro',
  'cachorros',
  'cachorrito',
  'cachorritos',
  'gatito',
  'gatitos',
  'perrito',
  'perritos',
  'camada',
  'raza pura',
  'con pedigree',
];

// ¿Aparece `frase` como palabra(s) completa(s) en el texto normalizado? Para una
// sola palabra usa límites de palabra con sufijos acotados (plural / género), lo
// que evita el problema Scunthorpe (que "concentrado" cace "cono"). Para frases
// con espacios, exige límite al inicio y al final de la frase completa.
function contienePalabra(textoNorm: string, frase: string): boolean {
  const f = frase.trim();
  if (f.includes(' ')) {
    const re = new RegExp(`(^|[^a-z0-9])${escapar(f)}([^a-z0-9]|$)`, 'i');
    return re.test(textoNorm);
  }
  // Palabra sola: permite sufijos de plural/género (s, es, a, as, os) pero SOLO
  // como continuación directa, no cualquier cadena. Sin `\w*` para no cazar
  // palabras más largas que empiezan igual.
  const re = new RegExp(`(^|[^a-z0-9])${escapar(f)}(s|es|a|as|os)?([^a-z0-9]|$)`, 'i');
  return re.test(textoNorm);
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function alguna(textoNorm: string, lista: string[]): boolean {
  return lista.some((p) => contienePalabra(textoNorm, normalize(p)));
}

export function moderarTextoReporte(campos: CamposReporte): ResultadoModeracion {
  const crudo = [campos.nombre, campos.raza, campos.descripcion, campos.recompensa]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' ');
  if (crudo.trim().length === 0) return { ok: true };

  const texto = normalize(crudo);

  if (alguna(texto, PALABRAS_ODIO)) return { ok: false, motivo: MOTIVO_ODIO };
  if (alguna(texto, PALABRAS_SEXUAL)) return { ok: false, motivo: MOTIVO_SEXUAL };
  if (alguna(texto, INDICIOS_VENTA) && alguna(texto, TERMINOS_ANIMAL_VENTA)) {
    return { ok: false, motivo: MOTIVO_VENTA };
  }

  return { ok: true };
}

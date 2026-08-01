// RADIO DE BÚSQUEDA CALIBRADO POR ESPECIE Y ÁMBITO — lógica pura.
//
// Hasta acá la app usaba un radio fijo para todo el mundo (25 km en Inicio,
// 20 km en Explorar). Para un gato de interior escapado eso es unas cien veces
// más grande de lo que corresponde: el aviso se diluye entre cientos de
// personas que no pueden hacer nada y no le llega con urgencia a los tres
// vecinos que sí.
//
// DE DÓNDE SALEN LOS NÚMEROS (no son a ojo):
//   · Estudio de la U. de Queensland junto a Missing Animal Response, n=1.232
//     gatos perdidos. Mediana de la distancia a la que apareció el animal:
//        - 315 m para un gato CON acceso al exterior;
//        -  50 m para un gato de INTERIOR que se escapó.
//   · Perros: el rango habitual que reporta la misma línea de trabajo es de
//     1 a 2 km. Se mueven en otro orden de magnitud que un gato.
//   · Mediana de tiempo hasta recuperarla: 2 días en perros, 5 días en gatos.
//     De ahí sale cada cuántos días tiene sentido ampliar la búsqueda: si ya
//     pasó la mediana y no apareció, este caso no es el típico y hay que mirar
//     más lejos.
//
// La mediana NO es el radio: es el punto donde la mitad de los casos quedaron
// más cerca y la otra mitad más lejos. Buscar solo hasta la mediana dejaría
// afuera la mitad de las mascotas. Por eso el radio inicial es un múltiplo
// holgado de la mediana (unas 3-4 veces), que es donde la curva ya está muy
// achatada.
//
// Sin red, sin imports de Supabase: se prueba sola.

export type EspecieRadio = 'perro' | 'gato' | 'otro';

/** Cómo vivía el animal. Solo cambia algo en gatos (50 m contra 315 m). */
export type Ambito = 'interior' | 'exterior';

// Las etiquetas CONTESTAN la pregunta que hace `SelectorAmbito` ("¿tu gato
// salía a la calle?"), no la repiten: un chip que dice lo mismo que el título
// de arriba se lee como ruido.
export const AMBITOS: { key: Ambito; label: string }[] = [
  { key: 'exterior', label: 'Sí, salía' },
  { key: 'interior', label: 'No, era de adentro' },
];

export function esAmbito(valor: unknown): valor is Ambito {
  return valor === 'interior' || valor === 'exterior';
}

interface Perfil {
  /** Mediana del estudio, en km. Queda escrita para que se pueda auditar. */
  medianaKm: number;
  /** Radio del día 0 (múltiplo holgado de la mediana). */
  inicialKm: number;
  /** No se amplía más allá de esto: pasado cierto punto ya no es una búsqueda. */
  topeKm: number;
  /** Cada cuántos días se duplica: la mediana de tiempo hasta recuperarla. */
  diasParaAmpliar: number;
  /** Por qué este radio, en una o dos frases. Va tal cual a la pantalla. */
  motivo: string;
}

const PERFILES: Record<string, Perfil> = {
  // 50 m de mediana. 200 m = cuatro veces la mediana y, más importante, es lo
  // que se camina puerta por puerta: la manzana propia y la de enfrente.
  // Tope 5 km porque un gato de interior que apareció a 5 km ya es un caso
  // raro de verdad (se lo llevaron en auto, se subió a algo).
  'gato:interior': {
    medianaKm: 0.05,
    inicialKm: 0.2,
    topeKm: 5,
    diasParaAmpliar: 5,
    motivo:
      'Los gatos de interior aparecen casi siempre a menos de 100 m: conviene buscar puerta por puerta antes que lejos.',
  },
  // 315 m de mediana → 1 km, algo más de tres veces. Son unas tres cuadras
  // largas, el territorio que un gato con calle ya conoce.
  'gato:exterior': {
    medianaKm: 0.315,
    inicialKm: 1,
    topeKm: 10,
    diasParaAmpliar: 5,
    motivo:
      'Un gato que salía a la calle suele aparecer a unas tres cuadras: mirá patios, techos y autos del barrio antes de irte lejos.',
  },
  // 1-2 km habituales → 3 km de arranque, para no quedarse corto con el que
  // caminó los 2 km. Tope 25 km, el mismo radio que ya usaba Inicio.
  perro: {
    medianaKm: 1.5,
    inicialKm: 3,
    topeKm: 25,
    diasParaAmpliar: 2,
    motivo:
      'Un perro camina uno o dos kilómetros sin problema: vale la pena avisar bastante más allá de tu cuadra.',
  },
  // Sin dato del estudio. Acá el criterio es el conservador: si no sabemos
  // cómo se mueve, no le achicamos la búsqueda a nadie.
  otro: {
    medianaKm: 0,
    inicialKm: 5,
    topeKm: 50,
    diasParaAmpliar: 3,
    motivo:
      'Sin datos de cómo se mueve, vamos a lo ancho: mejor que sobre gente avisada a que falte.',
  },
};

// Gato sin ámbito contestado = el caso ANCHO. Omitir la pregunta nunca puede
// achicarle la búsqueda a nadie: quien no contesta se queda con los 315 m.
function perfilDe(especie: EspecieRadio, ambito?: Ambito | null): Perfil {
  if (especie === 'gato') {
    return esAmbito(ambito) ? PERFILES[`gato:${ambito}`] : PERFILES['gato:exterior'];
  }
  return especie === 'perro' ? PERFILES.perro : PERFILES.otro;
}

function redondear(km: number): number {
  return Number(km.toFixed(2));
}

export interface RadioSugerido {
  /** Radio sugerido hoy, en km. */
  km: number;
  /** Radio del día 0, antes de cualquier ampliación. */
  inicialKm: number;
  /** Techo: el radio no crece más que esto. */
  topeKm: number;
  /** Ya no queda nada por ampliar. */
  enElTope: boolean;
  /** Explicación corta y humana, para mostrar tal cual. */
  motivo: string;
}

export interface EntradaRadio {
  especie: EspecieRadio;
  ambito?: Ambito | null;
  /** Días desde la pérdida. Ausente, negativo o NaN se tratan como 0. */
  dias?: number | null;
}

export function radioSugerido({ especie, ambito, dias }: EntradaRadio): RadioSugerido {
  const perfil = perfilDe(especie, ambito);
  // Días raros no pueden achicar el radio ni reventar la cuenta: al piso.
  const d = typeof dias === 'number' && Number.isFinite(dias) && dias > 0 ? dias : 0;
  const duplicaciones = Math.floor(d / perfil.diasParaAmpliar);
  const crudo = perfil.inicialKm * 2 ** duplicaciones;
  const km = redondear(Math.min(crudo, perfil.topeKm));
  return {
    km,
    inicialKm: redondear(perfil.inicialKm),
    topeKm: redondear(perfil.topeKm),
    enElTope: km >= redondear(perfil.topeKm),
    motivo: perfil.motivo,
  };
}

// Cómo se escribe un radio en pantalla. Hermano de `distanceLabel` (lib/geo),
// pero sin el "a " adelante: acá el número es una distancia a la redonda, no la
// distancia a un punto. Y por debajo del kilómetro se habla en metros porque
// nadie busca a su gato en "0,2 km": busca en doscientos metros.
export function radioLabel(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(/[.,]0$/, '').replace('.', ',')} km`;
}

// El radio calibrado casi nunca coincide con los botones que ofrece una
// pantalla. Se elige la opción más CHICA que igual cubra el sugerido: hacia
// abajo dejaríamos afuera parte de la zona donde el estudio dice que aparece
// el animal, y eso es peor que mostrar de más.
export function ajustarAOpciones(km: number, opciones: readonly number[]): number {
  const ordenadas = [...opciones].sort((a, b) => a - b);
  return ordenadas.find((o) => o >= km) ?? ordenadas[ordenadas.length - 1];
}

// --- Radio por defecto de "cerca de mí" en Explorar ---------------------------
//
// OJO: acá no se busca UNA mascota concreta, se mira qué está pasando
// alrededor. Quien mira Explorar se mueve mucho más que el animal (toma micro,
// va al trabajo, pasea), así que el radio de la persona es bastante más ancho
// que el del bicho. De ahí el margen.
export const MARGEN_VECINDAD = 5;

/** Los botones de radio que ofrece Explorar (km). `null` = todo Chile. */
export const OPCIONES_RADIO_EXPLORAR = [1, 5, 20, 50] as const;

// Lo que la pantalla traía para todos antes de calibrar nada. Es el TECHO del
// valor por defecto: calibrar puede achicar la búsqueda de un gato, pero nunca
// abrirla más de lo que ya andaba (eso sería cambiar la pantalla, no
// calibrarla).
export const RADIO_EXPLORAR_MAX_KM = 20;

export function radioExplorarSugeridoKm(especie: EspecieRadio | null): number {
  // Sin filtro de especie no hay nada que calibrar: en la lista hay gatos,
  // perros y todo lo demás mezclado.
  if (especie === null) return RADIO_EXPLORAR_MAX_KM;
  const { km } = radioSugerido({ especie, dias: 0 });
  return Math.min(
    ajustarAOpciones(km * MARGEN_VECINDAD, OPCIONES_RADIO_EXPLORAR),
    RADIO_EXPLORAR_MAX_KM,
  );
}

// --- Cuándo preguntar el ámbito ----------------------------------------------
//
// Solo cuando la respuesta cambia algo. En gatos cambia TODO (50 m contra
// 315 m); en perros y en "otro" el radio sale igual, así que preguntar sería
// un campo más en un formulario que la persona está llenando con las manos
// temblando.
export function preguntarAmbito({
  especie,
  estado,
}: {
  especie: EspecieRadio;
  estado: 'perdida' | 'encontrada';
}): boolean {
  // En "encontrada" quien publica es quien halló al animal: no tiene forma de
  // saber si vivía adentro. Preguntarlo sería pedirle que invente.
  return especie === 'gato' && estado === 'perdida';
}

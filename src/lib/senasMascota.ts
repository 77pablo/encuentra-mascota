// SEÑAS ESTRUCTURADAS DE UN REPORTE (migración 0054) — el vocabulario compartido.
//
// El problema que resuelve: hasta acá TODO lo que identifica a un animal vivía
// en un textarea libre (`pets.descripcion`), y el motor de coincidencias cruzaba
// estado opuesto + especie + 15 km, y nada más. Con eso, la mitad de las
// coincidencias que produce son inútiles — y una coincidencia mala acá no es
// neutra: le da esperanza a alguien desesperado.
//
// Este archivo es la mitad PURA (sin red, sin Supabase): el vocabulario, las
// etiquetas y las dos reglas de contradicción. Las mismas reglas están escritas
// en SQL en la 0054 (`senas_contradicen`, `senas_puntaje`), porque el motor
// corre en la base; el guardrail `__tests__/db/migracion0054.test.ts` cruza las
// dos mitades para que no se separen en silencio.
//
// ---------------------------------------------------------------------------
// POR QUÉ ESTOS VALORES Y NO OTROS
//
// `tamano` y `esterilizado` copian LITERALMENTE lo que ya modeló `adoptions`
// (migración 0030): 'chico'|'mediano'|'grande' y el tri-estado 'si'|'no'|'no_se'.
// Que las dos mitades de la app usaran vocabularios distintos para lo mismo
// sería peor que no tener los campos: no habría forma de cruzarlas nunca.
// `sexo` no existía en adopciones, así que sigue la misma convención de
// tri-estado con un 'no_se' EXPLÍCITO (un booleano no sabe decir "no sé", y
// quien encuentra un animal en la calle muchas veces no lo sabe).

export const COLORES = [
  'negro',
  'blanco',
  'gris',
  'cafe',
  'dorado',
  'naranjo',
  'atigrado',
] as const;
export type ColorPelaje = (typeof COLORES)[number];

export const COLOR_ETIQUETA: Record<ColorPelaje, string> = {
  negro: 'Negro',
  blanco: 'Blanco',
  gris: 'Gris',
  cafe: 'Café',
  dorado: 'Dorado',
  naranjo: 'Naranjo',
  atigrado: 'Atigrado',
};

// Tope de colores por reporte. Con más de tres, "el color" deja de distinguir
// nada: marcar los siete equivale a no contestar, pero además haría que la
// regla de contradicción no descarte jamás.
export const MAX_COLORES = 3;

export const TAMANOS = ['chico', 'mediano', 'grande'] as const;
export type Tamano = (typeof TAMANOS)[number];
export const TAMANO_ETIQUETA: Record<Tamano, string> = {
  chico: 'Chico',
  mediano: 'Mediano',
  grande: 'Grande',
};

export const SEXOS = ['macho', 'hembra', 'no_se'] as const;
export type Sexo = (typeof SEXOS)[number];
export const SEXO_ETIQUETA: Record<Sexo, string> = {
  macho: 'Macho',
  hembra: 'Hembra',
  no_se: 'No sé',
};

export const ESTERILIZADOS = ['si', 'no', 'no_se'] as const;
export type EsterilizadoValor = (typeof ESTERILIZADOS)[number];
export const ESTERILIZADO_ETIQUETA: Record<EsterilizadoValor, string> = {
  si: 'Sí',
  no: 'No',
  no_se: 'No sé',
};

/**
 * Deja una lista de colores válida: solo valores del vocabulario, sin repetidos
 * y como mucho `MAX_COLORES`. Conserva el orden en que se eligieron.
 */
export function normalizarColores(valor: unknown): ColorPelaje[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const salida: ColorPelaje[] = [];
  for (const item of valor) {
    if (typeof item !== 'string') continue;
    if (!(COLORES as readonly string[]).includes(item)) continue;
    if (vistos.has(item)) continue;
    vistos.add(item);
    salida.push(item as ColorPelaje);
    if (salida.length >= MAX_COLORES) break;
  }
  return salida;
}

/**
 * ¿Los colores de los dos reportes se CONTRADICEN?
 *
 * Solo cuando los dos lados contestaron y no comparten ni un color. Que falte
 * el dato no descarta nada: la enorme mayoría de los reportes ya publicados no
 * tiene ninguno de estos campos, y un motor que los exija se queda sin
 * coincidencias para todos ellos.
 *
 * Basta UN color en común para no contradecir. Es a propósito: un animal blanco
 * y negro puede estar cargado como los dos colores de un lado y como uno solo
 * del otro, y eso es la misma mascota, no dos distintas.
 */
export function coloresSeContradicen(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined,
): boolean {
  if (!a || !b || a.length === 0 || b.length === 0) return false;
  return !a.some((c) => b.includes(c));
}

/**
 * Pares de tamaño que sí son una contradicción. Solo los extremos.
 *
 * "Chico" contra "mediano" NO entra: ahí la gente honestamente no se pone de
 * acuerdo (un mestizo de 12 kg es mediano para uno y chico para otro) y
 * descartar por eso tiraría coincidencias buenas.
 */
export const TAMANOS_INCOMPATIBLES: ReadonlyArray<readonly [Tamano, Tamano]> = [
  ['chico', 'grande'],
];

export function tamanosSeContradicen(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return TAMANOS_INCOMPATIBLES.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );
}

// ---------------------------------------------------------------------------
// NÚMERO DE CHIP
//
// El chip NO se guarda en `pets` ni se publica: vive en `pet_chips`, cerrada
// por RLS al dueño. Ver src/services/petChip.ts y la 0054 para el porqué.
//
// La limpieza tiene que ser LA MISMA en el cliente y en la base: `chip_norm` es
// una columna generada con esta misma clase de caracteres. Si las dos se
// separan, "985 112" guardado desde la app y "985112" tecleado por otra persona
// dejan de cruzarse, y el dato más fuerte que tenemos no encuentra nada.
export const CHIP_BASURA_SQL = '[^A-Za-z0-9]';

// ISO 11784/11785 (el estándar chileno) son 15 dígitos. Los viejos AVID y
// compañía tienen 9 o 10 caracteres y todavía andan dando vueltas, así que el
// rango es ancho a propósito: rechazar un chip real sería peor que aceptar uno
// mal tipeado (que simplemente no va a cruzar con nada).
//
// Y ese "ancho a propósito" manda también sobre EL TECLADO de las pantallas: si
// acá se aceptan letras, el campo NO puede pedir un teclado numérico. Un teclado
// así no rechaza el chip alfanumérico: directamente no tiene las teclas, así que
// la persona no ve ningún error, no entiende por qué no puede escribir su número
// y publica sin él. Ver el campo de chip en PublishScreen y EditPetScreen.
export const CHIP_LARGO_MIN = 9;
export const CHIP_LARGO_MAX = 15;

/** Deja el chip como se guarda y se compara, o null si no quedó nada. */
export function normalizarChip(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(new RegExp(CHIP_BASURA_SQL, 'g'), '').toUpperCase();
  return limpio === '' ? null : limpio;
}

export type ResultadoChip = { ok: true } | { ok: false; motivo: string };

/** El chip es OPCIONAL: vacío siempre es válido. */
export function validarChip(valor: string | null | undefined): ResultadoChip {
  const chip = normalizarChip(valor);
  if (chip === null) return { ok: true };
  if (chip.length < CHIP_LARGO_MIN) {
    return {
      ok: false,
      motivo: `Ese número de chip parece incompleto: tiene que tener al menos ${CHIP_LARGO_MIN} caracteres. El de Chile son 15 dígitos.`,
    };
  }
  if (chip.length > CHIP_LARGO_MAX) {
    return {
      ok: false,
      motivo: `Ese número de chip es muy largo: como mucho ${CHIP_LARGO_MAX} caracteres. El de Chile son 15 dígitos.`,
    };
  }
  return { ok: true };
}

/**
 * El chip guardado en una ficha "Mi mascota", listo para pre-cargarlo en un
 * reporte — o `null` si ese texto no sirve como número de chip.
 *
 * Hace falta porque `my_pets.chip` NUNCA pasó por `validarChip`: su único
 * control es el CHECK de 40 caracteres de la 0027 y el formulario de la ficha lo
 * guarda tal cual. Ahí adentro puede haber "no sé", "lo tiene el veterinario" o
 * el número a medias.
 *
 * Y lo que NO puede fallar es publicar. Si ese texto se copiara crudo al
 * formulario, `validarChip` lo rebotaría al apretar Publicar y el reporte de una
 * mascota perdida quedaría trabado por un dato que la persona ni siquiera
 * escribió ahí — justo al revés de para qué existe la pre-carga.
 *
 * Devuelve el número ya normalizado, que es como se guarda y como se cruza.
 */
export function chipPrecargable(valor: string | null | undefined): string | null {
  const limpio = normalizarChip(valor);
  if (limpio === null) return null;
  return validarChip(limpio).ok ? limpio : null;
}

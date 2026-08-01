// CIERRE DE CASOS — cuándo corresponde preguntarle al dueño si su mascota
// apareció. Lógica pura, sin red; `ahora` SIEMPRE llega por parámetro
// (convención de src/lib/recordatorios.ts y src/lib/cicloVida.ts).
//
// POR QUÉ EXISTE: los avisos que nadie cierra son el defecto estructural del
// rubro. Un mapa lleno de mascotas que ya volvieron a casa hace meses le hace
// perder el tiempo a quien busca de verdad. Y del otro lado produce el número
// que hoy no tiene nadie en Chile: cuántas mascotas se reencuentran.
//
// POR QUÉ TRES MOMENTOS Y NO UN RECORDATORIO: los tiempos salen de las medianas
// medidas de recuperación (2 días en perros, 5 en gatos). A los 3 días la
// mayoría de los casos ya se resolvió; a los 7 se resolvió casi todo lo que se
// iba a resolver rápido; a los 21, un reporte que sigue abierto casi siempre es
// un aviso que nadie cerró. Después del 21 NO se pregunta más: quien todavía lo
// tiene abierto ya sabe que su animal no volvió, y repetirle la pregunta cada
// semana sería crueldad automatizada.

export const HITOS = [3, 7, 21] as const;
export type Hito = (typeof HITOS)[number];

// Las tres respuestas posibles. Sin tildes ni eñes a propósito: viajan tal cual
// al CHECK de la migración 0049 (`cierre_motivo in (...)`) y a la RPC
// `responder_estado`. Un solo lugar donde están escritas, para que el cliente y
// la base no se puedan desincronizar.
export const RESPUESTAS = ['aparecio', 'sigo_buscando', 'ya_no_busco'] as const;
export type RespuestaCierre = (typeof RESPUESTAS)[number];

// Los campos del reporte que mira esta lógica. `preguntado_en` es OPCIONAL a
// propósito: mientras la migración 0049 no esté aplicada, la fila que devuelve
// `getPet` (que lee con `select('*')`) directamente no trae la clave.
export interface ReporteCierre {
  creado_en: string;
  activo: boolean;
  reunida_en?: string | null;
  preguntado_en?: string | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

// ¿La base de esta instalación ya sabe de seguimiento?
//
// Es el portero de toda la función, y descansa en un detalle de PostgREST que
// vale la pena dejar escrito: `select('*')` devuelve TODAS las columnas de la
// tabla, incluidas las que valen null. O sea que la clave `preguntado_en`
// aparece en el objeto (con valor null) en cuanto la 0049 está aplicada, y NO
// aparece si no lo está. Eso distingue "nunca le preguntamos" de "la base no
// tiene dónde anotarlo", que son cosas muy distintas.
//
// Sin este portero, en una base sin migrar todo reporte de más de 3 días
// mostraría la pregunta y los tres botones fallarían con PGRST202 al tocarlos.
// El requisito es más duro que eso: la tarjeta simplemente no aparece.
export function hayColumnaDeSeguimiento(reporte: object): boolean {
  return 'preguntado_en' in reporte;
}

export function debePreguntar(
  r: ReporteCierre,
  ahora: Date,
): { preguntar: boolean; hito: Hito | null } {
  const callarse = { preguntar: false as const, hito: null };

  // Cerrado o ya reunido: no hay nada que preguntar, la historia terminó.
  if (!r.activo || r.reunida_en) return callarse;
  // La base no tiene dónde anotar la respuesta (ver arriba).
  if (!hayColumnaDeSeguimiento(r)) return callarse;

  const diasDesde = (t: string) => (ahora.getTime() - Date.parse(t)) / DIA_MS;
  const transcurridos = diasDesde(r.creado_en);
  if (!Number.isFinite(transcurridos)) return callarse;

  // El hito que toca es el MÁS ALTO ya alcanzado, no el primero: quien abre la
  // app por primera vez al mes ve una sola pregunta, la del tiempo real, y no
  // las tres acumuladas.
  const alcanzados = HITOS.filter((h) => transcurridos >= h);
  if (alcanzados.length === 0) return callarse;
  const ultimo = alcanzados[alcanzados.length - 1];

  // Ya respondió DESPUÉS de que este hito se cumplió: no se repite.
  // `diasDesde(preguntado_en)` = hace cuánto respondió.
  // `transcurridos - ultimo`   = hace cuánto se cumplió el hito.
  // Si respondió más cerca en el tiempo que el hito, la respuesta es de este
  // hito. El `<=` cubre el empate (respondió justo al cumplirse) y también los
  // relojes corridos: un `preguntado_en` en el futuro da negativo y calla.
  if (r.preguntado_en && diasDesde(r.preguntado_en) <= transcurridos - ultimo) {
    return callarse;
  }

  return { preguntar: true, hito: ultimo };
}

// Rango de tiempo de la Lista ("Hoy" / "Última semana" / "Todo").
//
// El filtrado en sí lo hace ahora Postgres (migración 0014): acá solo traducimos
// la opción que eligió el usuario a la fecha desde la cual pedir reportes.
// Antes esto filtraba en memoria sobre TODOS los reportes descargados, algo que
// dejó de tener sentido cuando la búsqueda pasó al servidor.
//
// `now` se recibe como parámetro para poder testear sin depender del reloj.

export type RangoTiempo = 'todo' | 'hoy' | 'semana';

const DIA_MS = 24 * 60 * 60 * 1000;
const SEMANA_MS = 7 * DIA_MS;

// Fecha desde la cual mostrar reportes, o null si el rango es "todo"
// (sin límite, el servidor no aplica el filtro).
export function desdeDeRango(rango: RangoTiempo, now: number): Date | null {
  if (rango === 'todo') return null;
  const ventana = rango === 'hoy' ? DIA_MS : SEMANA_MS;
  return new Date(now - ventana);
}

// ────────────────────────────────────────────────────────────────────────────
// FILTROS QUE LLEGAN POR LA RUTA
//
// Los accesos rápidos de Inicio (los chips y la tarjeta "En tu comuna") llevan
// a Explorar con un filtro puesto. Antes navegaban PELADOS —`navigate('Explorar')`
// sin nada— y aterrizabas en la misma pantalla que ves entrando por la pestaña:
// controles con aspecto de filtro que no filtraban nada.
//
// Esta función es el lado que LEE. Vive acá y no dentro de la pantalla para
// poder probarla sola y, sobre todo, para poder cruzarla en un test con el lado
// que ESCRIBE (`ACCESOS_INICIO`, en HomeScreen): si alguien agrega un acceso con
// una clave que este lector no conoce, el chip volvería a no hacer nada y no
// habría error en ningún lado.

export interface FiltrosDeRuta {
  comuna: string | null;
  especie: 'perro' | 'gato' | 'otro' | null;
  estado: 'perdida' | 'encontrada' | null;
  cerca: boolean;
}

const ESPECIES_VALIDAS = ['perro', 'gato', 'otro'] as const;
const ESTADOS_VALIDOS = ['perdida', 'encontrada'] as const;

/**
 * Traduce los parámetros de navegación de Explorar a un juego COMPLETO de
 * filtros, o `null` si no hay nada aplicable.
 *
 * Dos decisiones que importan:
 *
 *  · Devuelve el juego completo (los que no vienen quedan en neutro), no un
 *    parche. Un acceso promete UN filtro: tocar "Gatos" después de "Perdidos"
 *    tiene que dar gatos, no gatos-perdidos.
 *  · Valida los valores contra lo que la búsqueda entiende. Estos parámetros
 *    pueden venir de un deep link, o sea de afuera; un `especie=dinosaurio`
 *    viajaría hasta la consulta y volvería vacío sin que nadie sepa por qué.
 */
export function filtrosDesdeRuta(params: unknown): FiltrosDeRuta | null {
  if (!params || typeof params !== 'object') return null;
  const p = params as Record<string, unknown>;

  const comuna = typeof p.comuna === 'string' && p.comuna.trim() ? p.comuna.trim() : null;
  const especie = ESPECIES_VALIDAS.includes(p.especie as any)
    ? (p.especie as FiltrosDeRuta['especie'])
    : null;
  const estado = ESTADOS_VALIDOS.includes(p.estado as any)
    ? (p.estado as FiltrosDeRuta['estado'])
    : null;
  const cerca = p.cerca === true;

  // Nada reconocible: no se toca lo que el usuario ya tenía elegido.
  if (!comuna && !especie && !estado && !cerca) return null;
  return { comuna, especie, estado, cerca };
}

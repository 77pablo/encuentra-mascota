// CERRAR EL CÍRCULO DEL REENCUENTRO — lógica pura del agradecimiento.
//
// Cuando una mascota vuelve a casa, la app celebraba solo con el dueño: quien
// dejó una pista o marcó un avistamiento ayudó de verdad y no quedaba ni una
// línea que lo dijera. Acá se resuelve QUIÉN ayudó y CÓMO se lo nombra, a
// partir de datos que la ficha del reporte ya tiene cargados (las pistas y los
// avistamientos). Sin red y sin columnas nuevas: es un gesto en pantalla.

import type { Tip } from './tips';
import type { Sighting } from '../services/sightings';

export interface ResumenAyudantes {
  /** Nombres de quienes se pueden nombrar, en el orden en que ayudaron. */
  nombres: string[];
  /** Cuántos ayudaron sin poder nombrarlos (avistamiento, cuenta borrada, sin nombre). */
  anonimos: number;
  /** Personas distintas que ayudaron. Siempre `nombres.length + anonimos`. */
  total: number;
}

// Cuántos nombres se listan antes de pasar a "y N vecinos más". Tres es lo que
// entra cómodo en una línea sin que la tarjeta se vuelva un listado.
const MAX_NOMBRES = 3;

/**
 * Personas distintas que ayudaron en este reporte, sin contar al dueño.
 *
 * Una misma persona puede haber dejado varias pistas y varios avistamientos:
 * cuenta UNA vez. Si en alguna de esas participaciones se pudo resolver su
 * nombre, se la nombra; si no, entra como vecino sin nombre.
 *
 * Quien borró su cuenta se cuenta como vecino sin nombre a propósito: la ayuda
 * existió y se agradece, pero el nombre viejo ya no es de nadie (el mismo
 * criterio de `firmaAutor`, que la firma como "Un vecino").
 */
export function resumenAyudantes(
  pistas: Tip[],
  avistamientos: Sighting[],
  duenoId: string | null | undefined,
): ResumenAyudantes {
  // Mapa userId → nombre (o null). Se recorre en orden de aparición para que el
  // agradecimiento respete el orden en que fue llegando la ayuda.
  const porUsuario = new Map<string, string | null>();

  const anotar = (userId: string | null | undefined, nombre: string | null) => {
    if (!userId) return;
    if (duenoId && userId === duenoId) return;
    const previo = porUsuario.get(userId);
    // Si ya estaba con nombre, no lo pisamos con un null que venga de un
    // avistamiento (esas filas nunca traen nombre).
    if (previo) return;
    porUsuario.set(userId, nombre);
  };

  for (const p of pistas) {
    const nombre = p.autorEliminadoEn ? null : (p.autorNombre ?? '').trim() || null;
    anotar(p.userId, nombre);
  }
  for (const s of avistamientos) {
    anotar(s.user_id, null);
  }

  const nombres: string[] = [];
  let anonimos = 0;
  for (const nombre of porUsuario.values()) {
    if (nombre) nombres.push(nombre);
    else anonimos += 1;
  }

  return { nombres, anonimos, total: nombres.length + anonimos };
}

// "Ana", "Ana y Beto", "Ana, Beto y Caro".
function enumerar(nombres: string[]): string {
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/**
 * La frase que se muestra en la tarjeta del final feliz. Devuelve '' cuando no
 * hay a quién agradecer, para que la pantalla no dibuje un bloque vacío.
 */
export function fraseGracias(resumen: ResumenAyudantes): string {
  const { nombres, anonimos, total } = resumen;
  if (total === 0) return '';

  // Nadie nombrable: se habla de "vecinos" y la frase cambia de forma, porque
  // "Gracias a 3 vecinos más" sin un primer nombre suena a error.
  if (nombres.length === 0) {
    return anonimos === 1
      ? 'Gracias al vecino que ayudó a que volviera a casa.'
      : `Gracias a los ${anonimos} vecinos que ayudaron a que volviera a casa.`;
  }

  const mostrados = nombres.slice(0, MAX_NOMBRES);
  const resto = nombres.length - mostrados.length + anonimos;
  if (resto === 0) {
    return `Gracias a ${enumerar(mostrados)} por ayudar a que volviera a casa.`;
  }
  const cola = resto === 1 ? '1 vecino más' : `${resto} vecinos más`;
  return `Gracias a ${enumerar([...mostrados, cola])} por ayudar a que volviera a casa.`;
}

// CUADRILLA — organizar la búsqueda física del barrio (migración 0048).
//
// Lógica pura: sin red, sin Supabase, sin React. Se prueba sola.
//
// Por qué existe esta función: la búsqueda física del vecindario resuelve el
// 49% de los casos en perros y el 30% en gatos; la base de datos resuelve entre
// el 2% y el 6%. El problema real del tutor no es la falta de gente dispuesta a
// ayudar —la tiene— sino no saber cómo organizarla.
//
// DOS REGLAS DE PRODUCTO QUE NO SE NEGOCIAN, y que están cableadas acá adentro:
//   1. Nada de gamificar. Sin puntajes, sin rankings, sin insignias festivas.
//      Del otro lado hay alguien angustiado buscando a su animal.
//   2. Ningún texto puede sonar a "nadie te ayudó". Una cuadrilla de UNA
//      persona es el estado normal del primer minuto, no un fracaso: el dueño
//      solo ya tiene una lista de tareas concretas que le sirve.

import { pluralizar } from './plural';

// Tope de una tarea. Es un renglón ("Pegar carteles en las esquinas de Maipú"),
// no una descripción: entra de una en la pantalla y se lee de un vistazo. El
// mismo número está en el CHECK de la 0048.
export const TAREA_MAX = 120;

export type EstadoTarea = 'pendiente' | 'tomada' | 'hecha';

export type Tarea = {
  id: string;
  cuadrillaId: string;
  titulo: string;
  estado: EstadoTarea;
  /** userId de quien la tomó; null mientras está libre. */
  tomadaPor: string | null;
  tomadaEn: string | null;
  creadoEn: string;
};

export type Miembro = {
  userId: string;
  nombre: string | null;
  creadoEn: string;
};

// ---------------------------------------------------------------------------
// TAREAS SUGERIDAS
// ---------------------------------------------------------------------------

// Recorta sin cortar una palabra por la mitad si se puede evitar.
function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const duro = texto.slice(0, max);
  const corte = duro.lastIndexOf(' ');
  return (corte > max * 0.6 ? duro.slice(0, corte) : duro).trimEnd();
}

// Sugerencias CONCRETAS para arrancar. La diferencia entre "pegá carteles" y
// "pegar 10 carteles en las esquinas más transitadas de Maipú" es la diferencia
// entre una tarea que nadie toma y una que alguien toma.
//
// La comuna es el único dato de lugar que el reporte garantiza (lat/lng está
// difuminada a propósito desde el borde de escritura, así que no hay calle que
// nombrar). Los reportes anteriores a la Tanda 3 no tienen ni comuna: ahí cae a
// "el barrio", que sigue siendo mejor que un hueco.
export function tareasSugeridas(pet: {
  comuna?: string | null;
  nombre?: string | null;
  especie: 'perro' | 'gato' | 'otro';
}): string[] {
  const lugar = pet.comuna?.trim() || 'el barrio';
  const nombre = pet.nombre?.trim();
  // Sin nombre no puede quedar "llamando a " colgado.
  const llamando = nombre ? `llamando a ${nombre}` : 'llamando y parando a escuchar';

  // Un gato asustado se queda a menos de cinco casas y no viene cuando lo
  // llaman; un perro se aleja kilómetros y lo levanta cualquiera. Buscarlos
  // igual es perder la tarde: por eso la quinta tarea cambia según la especie.
  const porEspecie =
    pet.especie === 'gato'
      ? 'Revisar techos, autos, patios y huecos a menos de cinco casas: un gato asustado se esconde cerca y no responde'
      : `Preguntar en la municipalidad y en la comisaría de ${lugar} por animales recogidos estos días`;

  return [
    `Pegar 10 carteles en las esquinas más transitadas de ${lugar}`,
    `Recorrer las 6 cuadras alrededor del punto del reporte, ${llamando}`,
    `Pasar por las veterinarias de ${lugar} y dejar un cartel en cada una`,
    'Preguntar en el kiosco, la panadería y el almacén de la cuadra',
    porEspecie,
    `Compartir el reporte en los grupos de vecinos de ${lugar}`,
  ].map((t) => recortar(t, TAREA_MAX));
}

// ---------------------------------------------------------------------------
// VALIDACIÓN
// ---------------------------------------------------------------------------

export type ValidacionTarea = { ok: true; titulo: string } | { ok: false; error: string };

export function validarTarea(titulo: string): ValidacionTarea {
  const limpio = titulo.trim();
  if (!limpio) return { ok: false, error: 'Escribí qué hay que hacer.' };
  if (limpio.length > TAREA_MAX) {
    return { ok: false, error: `La tarea es muy larga: máximo ${TAREA_MAX} caracteres.` };
  }
  return { ok: true, titulo: limpio };
}

// ---------------------------------------------------------------------------
// PERMISOS — espejo exacto de la RLS de la 0048.
//
// Se repiten acá para que la pantalla no ofrezca botones que la base va a
// rechazar. La base sigue siendo la autoridad: esto es cortesía, no seguridad.
// ---------------------------------------------------------------------------

// Una tarea libre la toma cualquiera de la cuadrilla. Una que ya tiene dueño no
// se le roba a nadie — ni el dueño del reporte: primero la suelta.
export function puedeTomar(tarea: Tarea, userId: string | null, _esDueno: boolean): boolean {
  if (!userId) return false;
  return tarea.estado === 'pendiente' && tarea.tomadaPor === null;
}

// La suelta quien la tomó. El dueño del reporte TAMBIÉN, porque si no, un
// ayudante que se fue de viaje deja la tarea trabada para siempre.
export function puedeSoltar(tarea: Tarea, userId: string | null, esDueno: boolean): boolean {
  if (!userId) return false;
  if (tarea.estado !== 'tomada' || !tarea.tomadaPor) return false;
  return tarea.tomadaPor === userId || esDueno;
}

// La cierra quien la tomó, o el dueño (mismo motivo que arriba).
export function puedeCompletar(tarea: Tarea, userId: string | null, esDueno: boolean): boolean {
  if (!userId) return false;
  if (tarea.estado !== 'tomada' || !tarea.tomadaPor) return false;
  return tarea.tomadaPor === userId || esDueno;
}

// ---------------------------------------------------------------------------
// PRESENTACIÓN
// ---------------------------------------------------------------------------

export type TareasAgrupadas = { pendientes: Tarea[]; tomadas: Tarea[]; hechas: Tarea[] };

// Primero lo que falta hacer, al final lo cerrado. Dentro de cada grupo, la más
// vieja primero: es el orden en que se pensaron y el que la gente ya leyó.
// No muta el arreglo que recibe.
export function agruparTareas(tareas: Tarea[]): TareasAgrupadas {
  const porFecha = (a: Tarea, b: Tarea) =>
    new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime();
  const de = (estado: EstadoTarea) => tareas.filter((t) => t.estado === estado).sort(porFecha);
  return { pendientes: de('pendiente'), tomadas: de('tomada'), hechas: de('hecha') };
}

// De quién es una tarea, en palabras. Nunca un uuid en pantalla: un ayudante
// que todavía no cargó su nombre es "un vecino", igual que en las pistas.
export function quienLaTiene(
  tarea: Tarea,
  miembros: Miembro[],
  miUserId: string | null,
): string | null {
  if (!tarea.tomadaPor) return null;
  if (miUserId && tarea.tomadaPor === miUserId) return 'La tomaste vos';
  const nombre = miembros.find((m) => m.userId === tarea.tomadaPor)?.nombre?.trim();
  return `La tomó ${nombre || 'un vecino'}`;
}

// Una línea con el estado de la cuadrilla.
//
// Con UNA sola persona no se cuenta gente: se cuenta trabajo. Decir "1 persona
// buscando" (o peor, "0 ayudantes") es recordarle al dueño que está solo justo
// cuando abrió la pantalla a los dos minutos de compartir el link.
export function resumenCuadrilla(miembros: number, tareas: Tarea[]): string {
  const gente = miembros <= 1 ? 'Tu cuadrilla' : `${miembros} personas buscando`;
  const pendientes = tareas.filter((t) => t.estado === 'pendiente').length;
  const trabajo =
    pendientes > 0
      ? `${pendientes} ${pluralizar(pendientes, 'tarea', 'tareas')} sin tomar`
      : 'todo repartido';
  return `${gente} · ${trabajo}`;
}

// Qué se le dice al dueño debajo del botón de invitar, según cuántos son.
//
// Con dos personas la pantalla NO pide más gente: dos es el caso real y el que
// el MVP quiere que funcione bien. Seguir pidiendo gente con dos es decirle a
// la persona que lo que consiguió no alcanza.
export function sugerenciaDeInvitacion(miembros: number): string {
  if (miembros <= 1) {
    return 'Mandale el link a dos o tres vecinos de confianza. Con una persona más se cubre el doble de cuadras en la mitad del tiempo.';
  }
  if (miembros === 2) {
    return 'Ya son dos. Repártanse las tareas de la lista para no pisarse: dos personas en la misma cuadra es una cuadra perdida.';
  }
  return `Son ${miembros}. Repártanse las tareas de la lista y marquen las que van cerrando, así nadie repite lo que ya se hizo.`;
}

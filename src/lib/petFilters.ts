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

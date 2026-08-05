// DIFUSION — la logica pura del tablero de "a quien le avise" (migracion 0063).
// Sin red y sin `new Date()` adentro: todo lo que dependa del reloj se recibe.
//
// TONO (misma regla que cuadrilla.ts y PlanBusqueda.tsx): no gamificar y no
// sonar a "nadie te ayudo". Quien esta buscando a su animal no necesita que le
// midan el esfuerzo; necesita saber que le queda por hacer.

// OJO: el modulo exporta `pluralizar`, no `plural`.
import { pluralizar } from './plural';

export const ETIQUETA_MAX = 80;

export type TipoDestino = 'persona' | 'lugar' | 'institucion';
export type EstadoDestino = 'pendiente' | 'avisado';

export type Destino = {
  id: string;
  petId: string;
  tipo: TipoDestino;
  etiqueta: string | null;
  lugarId: string | null;
  // Nombre del lugar de OSM (viene del join contra `lugares`, migracion 0063).
  // Solo tiene valor cuando `tipo === 'lugar'`; el CHECK de la 0063 obliga
  // `etiqueta null` para ese tipo, asi que sin esto no habia forma de mostrar
  // NADA en la fila del tablero.
  lugarNombre: string | null;
  institucionId: string | null;
  estado: EstadoDestino;
  avisadoEn: string | null;
  creadoEn: string;
};

export function validarEtiqueta(texto: string): { ok: boolean; motivo?: string } {
  const limpio = texto.trim();
  if (limpio.length === 0) return { ok: false, motivo: 'Escribí a quién le vas a avisar.' };
  if (limpio.length > ETIQUETA_MAX) {
    return { ok: false, motivo: `Máximo ${ETIQUETA_MAX} caracteres.` };
  }
  return { ok: true };
}

export function agruparDestinos(ds: Destino[]): { pendientes: Destino[]; avisados: Destino[] } {
  return {
    pendientes: ds.filter((d) => d.estado === 'pendiente'),
    avisados: ds.filter((d) => d.estado === 'avisado'),
  };
}

export function resumenDifusion(ds: Destino[]): string {
  const { avisados } = agruparDestinos(ds);
  if (ds.length === 0) return 'Anotá a quién le vas a avisar para no repetirte ni olvidarte.';
  if (avisados.length === 0) return 'Todavía no marcaste ninguno como avisado.';
  // `pluralizar` existe desde el pulido de la tanda 9: la regla en español es
  // n === 1, no n > 1 (con cero va el plural).
  return `Marcaste ${avisados.length} ${pluralizar(avisados.length, 'aviso', 'avisos')}.`;
}

export function sugerenciasDePersonas(pet: { comuna?: string | null }): string[] {
  const comuna = pet.comuna?.trim();
  const base = [
    'El grupo de WhatsApp del edificio o del pasaje',
    'La junta de vecinos',
    'El kiosco, la panadería y el almacén de la cuadra',
    'Los que pasean perros a la misma hora',
  ];
  if (comuna) base.push(`El grupo de compra y venta de ${comuna}`);
  return base.map((s) => s.slice(0, ETIQUETA_MAX));
}

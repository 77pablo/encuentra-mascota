// Recordatorios del carnet de "Mi mascota" (Función 6): vacuna y
// antiparasitarios, aviso SOLO in-app (decisión de Pablo: sin push ni correo).
// Lógica pura, sin red; `hoy` SIEMPRE llega como parámetro (testeable, sin
// `Date.now()` suelto).

export type EstadoDosis = 'al_dia' | 'vence_pronto' | 'vencida';

// Mismas 3 fechas que suma la migración 0034, en camelCase para el lado JS.
export interface Carnet {
  vacunaProxima?: string | null;
  antiparasitarioInternoProximo?: string | null;
  antiparasitarioExternoProximo?: string | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_VENCE_PRONTO = 14;

function inicioDelDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Estado de UNA dosis: sin fecha o fecha inválida → null (no hay nada que
// avisar, degrada en silencio). ≤14 días → vence_pronto (borde inclusivo).
export function estadoDosis(fecha: string | null | undefined, hoy: Date): EstadoDosis | null {
  if (!fecha) return null;
  const f = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(f.getTime())) return null;
  const dias = Math.round((f.getTime() - inicioDelDia(hoy)) / DIA_MS);
  if (dias < 0) return 'vencida';
  if (dias <= DIAS_VENCE_PRONTO) return 'vence_pronto';
  return 'al_dia';
}

const PRIORIDAD: Record<EstadoDosis, number> = { vencida: 2, vence_pronto: 1, al_dia: 0 };

interface ItemUrgente {
  etiqueta: string;
  estado: EstadoDosis;
  fecha: string;
}

// Recorre los 3 ítems del carnet y devuelve el más urgente (vencida gana sobre
// vence_pronto; entre dos con la misma urgencia, el de fecha más próxima/vieja
// gana). `null` si todo está al día o vacío.
function itemMasUrgente(carnet: Carnet, hoy: Date): ItemUrgente | null {
  const items: { etiqueta: string; fecha: string | null | undefined }[] = [
    { etiqueta: 'la vacuna', fecha: carnet.vacunaProxima },
    { etiqueta: 'el antiparasitario', fecha: carnet.antiparasitarioInternoProximo },
    { etiqueta: 'el antiparasitario', fecha: carnet.antiparasitarioExternoProximo },
  ];

  let mejor: ItemUrgente | null = null;
  for (const item of items) {
    const estado = estadoDosis(item.fecha, hoy);
    if (!estado || estado === 'al_dia') continue;
    const prioridad = PRIORIDAD[estado];
    const gana =
      !mejor ||
      prioridad > PRIORIDAD[mejor.estado] ||
      (prioridad === PRIORIDAD[mejor.estado] && item.fecha! < mejor.fecha);
    if (gana) {
      mejor = { etiqueta: item.etiqueta, estado, fecha: item.fecha! };
    }
  }
  return mejor;
}

// Resumen para el banner de UNA ficha: "A Luna le toca la vacuna". `null` si
// no hay nada pendiente (todo al día o sin fechas cargadas).
export function resumenRecordatorios(nombre: string, carnet: Carnet, hoy: Date): string | null {
  const item = itemMasUrgente(carnet, hoy);
  return item ? `A ${nombre} le toca ${item.etiqueta}` : null;
}

// Igual que arriba pero para VARIAS fichas (banner de Inicio/Mis mascotas
// cuando el usuario tiene más de una): elige la ficha con el estado más
// urgente entre todas. `null` si ninguna tiene algo pendiente.
export function resumenRecordatoriosVarios(
  fichas: { nombre: string; carnet: Carnet }[],
  hoy: Date,
): string | null {
  let mejor: { nombre: string; item: ItemUrgente } | null = null;
  for (const ficha of fichas) {
    const item = itemMasUrgente(ficha.carnet, hoy);
    if (!item) continue;
    if (!mejor || PRIORIDAD[item.estado] > PRIORIDAD[mejor.item.estado]) {
      mejor = { nombre: ficha.nombre, item };
    }
  }
  return mejor ? `A ${mejor.nombre} le toca ${mejor.item.etiqueta}` : null;
}

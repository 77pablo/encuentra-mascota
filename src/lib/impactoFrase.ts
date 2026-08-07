// Frase humana de la tarjeta "Lo que logramos juntos" (Tanda 21).
//
// Regla de oro: con pocos datos NO se dice nada. "100% en 0 días" con un solo
// caso miente más que callar. Los umbrales los comparte la página /impacto
// (public/impacto/index.html los espeja; hay guard de test de ese espejo).
export const MIN_REENCUENTROS = 3;
export const MIN_PERDIDAS = 5;

export interface DatosImpactoFrase {
  reencuentros: number;
  /** Total histórico de perdidas visibles. `undefined` = RPC vieja (pre-0070). */
  perdidasHistoricas?: number;
  /** Mediana de días hasta el reencuentro. `null` = la RPC decidió callar (<3). */
  medianaDias?: number | null;
}

export function fraseImpacto(d: DatosImpactoFrase): string | null {
  if (d.perdidasHistoricas === undefined) return null; // RPC vieja: degradar mudo
  if (d.reencuentros < MIN_REENCUENTROS || d.perdidasHistoricas < MIN_PERDIDAS) return null;

  const partes: string[] = [];
  const deCada10 = Math.round((10 * d.reencuentros) / d.perdidasHistoricas);
  // Una tasa que redondea a 0 no es un logro para mostrar: se omite y queda
  // la mediana (si hay). Honesto sin ser desmoralizante.
  if (deCada10 >= 1) partes.push(`De cada 10 perdidas, ${Math.min(deCada10, 10)} ya volvieron`);
  if (d.medianaDias !== null && d.medianaDias !== undefined) {
    const dias = Math.max(1, Math.round(d.medianaDias));
    partes.push(`la mitad vuelve en ~${dias} ${dias === 1 ? 'día' : 'días'}`);
  }
  return partes.length ? partes.join(' · ') : null;
}

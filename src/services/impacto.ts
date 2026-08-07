import { supabase } from '../lib/supabase';

// Impacto de la comunidad: conteos agregados globales, sin datos personales.
// Ver migración 0039 (RPC `impacto_comunidad`, security definer, pública).

export interface Impacto {
  reencuentros: number;
  buscando: number;
  adopciones: number;
  aportes: number;
  /** Solo con la RPC 0070; `undefined` con la vieja (la tarjeta degrada sola). */
  perdidasHistoricas?: number;
  /** `null` = la RPC calló a propósito (<3 reencuentros). */
  medianaDias?: number | null;
}

// Trae los conteos para la tarjeta "Lo que logramos juntos" de Inicio.
// Degrada a `null` en cualquier error (RPC no aplicada, red caída, etc.):
// es una tarjeta decorativa, nunca debe tumbar la pantalla.
export async function getImpacto(): Promise<Impacto | null> {
  const { data, error } = await supabase.rpc('impacto_comunidad');
  if (error) return null;
  const r = (data ?? [])[0];
  if (!r) return null;
  return {
    reencuentros: Number(r.reencuentros ?? 0),
    buscando: Number(r.buscando ?? 0),
    adopciones: Number(r.adopciones ?? 0),
    aportes: Number(r.aportes ?? 0),
    // `== null` a propósito: un conteo no puede ser null en la 0070, solo
    // faltar (RPC vieja). `mediana_dias` sí distingue: null = la RPC calló.
    perdidasHistoricas: r.perdidas_historicas == null ? undefined : Number(r.perdidas_historicas),
    medianaDias:
      r.mediana_dias === undefined ? undefined : r.mediana_dias === null ? null : Number(r.mediana_dias),
  };
}

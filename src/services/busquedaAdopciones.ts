// BÚSQUEDA DE ADOPCIONES EN EL SERVIDOR (migración 0030)
//
// Espejo de `busqueda.ts` (`buscarReportes`), pero para el feed de adopción:
// llama a la RPC `buscar_adopciones`, que filtra/ordena/pagina en Postgres.
// Ver docs/superpowers/specs/2026-07-21-adopcion-design.md, sección "RPC
// buscar_adopciones".
import { supabase } from '../lib/supabase';
import { Adoption } from './adoptions';

export type OrdenAdopcion = 'recientes' | 'cerca';

export interface FiltrosAdopcion {
  especie?: 'perro' | 'gato' | 'otro' | null;
  tamano?: 'chico' | 'mediano' | 'grande' | null;
  lat?: number | null;
  lng?: number | null;
  radioKm?: number | null;
  orden?: OrdenAdopcion;
}

// Una publicación de adopción tal como vuelve de la búsqueda: los campos de
// siempre más la distancia ya calculada por la base (null si no mandamos
// punto de referencia).
export interface AdopcionConDistancia extends Adoption {
  distancia_km: number | null;
}

// Mismo motivo que en `busqueda.ts`: cursor y no offset, para no repetir ni
// saltear filas si alguien publica mientras se scrollea.
export interface Cursor {
  fecha: string;
  id: string;
  distancia: number | null;
}

export interface Pagina {
  adopciones: AdopcionConDistancia[];
  cursor: Cursor | null; // null = no hay más páginas
}

export const TAMANO_PAGINA = 20;

function cursorDe(adopciones: AdopcionConDistancia[]): Cursor | null {
  const ultimo = adopciones[adopciones.length - 1];
  if (!ultimo) return null;
  return { fecha: ultimo.creado_en, id: ultimo.id, distancia: ultimo.distancia_km };
}

// Trae una página de adopciones. `cursor` viene de la página anterior; en la
// primera llamada va en null.
export async function buscarAdopciones(
  filtros: FiltrosAdopcion = {},
  cursor: Cursor | null = null,
  limite: number = TAMANO_PAGINA,
): Promise<Pagina> {
  const { data, error } = await supabase.rpc('buscar_adopciones', {
    p_especie: filtros.especie ?? null,
    p_tamano: filtros.tamano ?? null,
    p_lat: filtros.lat ?? null,
    p_lng: filtros.lng ?? null,
    p_radio_km: filtros.radioKm ?? null,
    p_orden: filtros.orden ?? 'recientes',
    p_cursor_fecha: cursor?.fecha ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_cursor_dist: cursor?.distancia ?? null,
    p_limite: limite,
  });
  if (error) throw error;

  const adopciones = (data ?? []) as AdopcionConDistancia[];
  return {
    adopciones,
    // Si vino una página incompleta, ya no hay más: nos ahorramos una consulta.
    cursor: adopciones.length < limite ? null : cursorDe(adopciones),
  };
}

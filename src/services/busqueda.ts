// BÚSQUEDA EN EL SERVIDOR (migración 0014)
//
// Reemplaza al viejo `listActivePets()`, que se traía TODOS los reportes activos
// al teléfono y filtraba en memoria. Acá el filtrado, el orden por cercanía y la
// paginación los hace Postgres, y el cliente recibe de a una página.
import { supabase } from '../lib/supabase';
import { Pet } from './pets';

export type Orden = 'recientes' | 'cerca';

export interface FiltrosBusqueda {
  lat?: number | null;
  lng?: number | null;
  radioKm?: number | null;
  estado?: 'perdida' | 'encontrada' | null;
  especie?: 'perro' | 'gato' | 'otro' | null;
  texto?: string | null;
  conRecompensa?: boolean;
  desde?: Date | null; // rango de tiempo ("hoy", "última semana")
  orden?: Orden;
  comuna?: string | null; // feed por comuna: casa o alcance (Tanda 3)
}

// Un reporte tal como vuelve de la búsqueda: los campos de siempre más la
// distancia ya calculada por la base (null si no mandamos punto de referencia).
// `buscar_reportes` (migración 0028) suma `renovado_en` al retorno para que el
// cliente sepa cuándo nudgear; se hereda de `Pet` y llega en el cast de abajo,
// sin mapeo manual (la RPC ya solo devuelve los no vencidos).
export interface PetConDistancia extends Pet {
  distancia_km: number | null;
}

// Apunta a "el último que ya viste". Se lo devolvemos a la base para pedir la
// página siguiente. Usamos cursor y no offset porque con offset, si alguien
// publica mientras scrolleás, se repiten o se saltan filas.
export interface Cursor {
  fecha: string;
  id: string;
  distancia: number | null;
}

export interface Pagina {
  reportes: PetConDistancia[];
  cursor: Cursor | null; // null = no hay más páginas
}

export const TAMANO_PAGINA = 20;

function cursorDe(reportes: PetConDistancia[]): Cursor | null {
  const ultimo = reportes[reportes.length - 1];
  if (!ultimo) return null;
  return { fecha: ultimo.creado_en, id: ultimo.id, distancia: ultimo.distancia_km };
}

// Trae una página de reportes. `cursor` viene de la página anterior; en la
// primera llamada va en null.
export async function buscarReportes(
  filtros: FiltrosBusqueda = {},
  cursor: Cursor | null = null,
  limite: number = TAMANO_PAGINA,
): Promise<Pagina> {
  const { data, error } = await supabase.rpc('buscar_reportes', {
    p_lat: filtros.lat ?? null,
    p_lng: filtros.lng ?? null,
    p_radio_km: filtros.radioKm ?? null,
    p_estado: filtros.estado ?? null,
    p_especie: filtros.especie ?? null,
    p_texto: filtros.texto?.trim() ? filtros.texto.trim() : null,
    p_con_recompensa: filtros.conRecompensa === true,
    p_desde: filtros.desde ? filtros.desde.toISOString() : null,
    p_orden: filtros.orden ?? 'recientes',
    p_cursor_fecha: cursor?.fecha ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_cursor_dist: cursor?.distancia ?? null,
    p_limite: limite,
    p_comuna: filtros.comuna?.trim() ? filtros.comuna.trim() : null,
  });
  if (error) throw error;

  const reportes = (data ?? []) as PetConDistancia[];
  return {
    reportes,
    // Si vino una página incompleta, ya no hay más: nos ahorramos una consulta.
    cursor: reportes.length < limite ? null : cursorDe(reportes),
  };
}

// Cuenta reportes activos en una comuna (casa o alcance), para el encabezado del
// feed y la sección de Inicio. Los nombres de comuna no tienen comas ni comillas,
// así que el `.or` es seguro. RLS pública se aplica (solo activos no ocultos).
export async function contarReportesEnComuna(comuna: string): Promise<number> {
  const { count, error } = await supabase
    .from('pets')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true)
    .eq('oculto', false)
    .or(`comuna.eq.${comuna},comunas_alcance.cs.{"${comuna}"}`);
  if (error) throw error;
  return count ?? 0;
}

// Coincidencias perdido ↔ encontrado de un reporte. Antes se calculaban en el
// cliente recorriendo todos los reportes; ahora las resuelve la base.
export interface Coincidencia {
  id: string;
  estado: 'perdida' | 'encontrada';
  especie: 'perro' | 'gato' | 'otro';
  nombre: string | null;
  descripcion: string;
  fotos: string[];
  lat: number;
  lng: number;
  creado_en: string;
  distancia_km: number;
}

export async function buscarCoincidencias(
  petId: string,
  radioKm = 15,
  limite = 10,
): Promise<Coincidencia[]> {
  const { data, error } = await supabase.rpc('buscar_coincidencias', {
    p_pet_id: petId,
    p_radio_km: radioKm,
    p_limite: limite,
  });
  if (error) throw error;
  return (data ?? []) as Coincidencia[];
}

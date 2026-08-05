// BÚSQUEDA EN EL SERVIDOR (migración 0014)
//
// Reemplaza al viejo `listActivePets()`, que se traía TODOS los reportes activos
// al teléfono y filtraba en memoria. Acá el filtrado, el orden por cercanía y la
// paginación los hace Postgres, y el cliente recibe de a una página.
import { supabase } from '../lib/supabase';
import { esMigracionSinAplicar } from '../lib/dbErrors';
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
  // Señas estructuradas (migración 0054). Ver el comentario de `buscarReportes`:
  // estos dos son los ÚNICOS filtros que pueden no existir en la base, así que
  // solo se mandan cuando la persona eligió uno.
  color?: string | null;
  tamano?: string | null;
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
  // true = la base no tiene la 0054 y los filtros de color/tamaño NO se
  // aplicaron, así que estos resultados NO son los que la persona pidió. Sin
  // esto, la pantalla mostraba la lista completa con los chips pintados como
  // activos y el contador en "(2)": alguien que busca a su gato negro veía
  // perros dorados y no tenía forma de distinguir "no hay ninguno cerca" de
  // "el filtro no existe". El `console.warn` que había no lo ve ningún usuario.
  senasIgnoradas?: boolean;
}

export const TAMANO_PAGINA = 20;

function cursorDe(reportes: PetConDistancia[]): Cursor | null {
  const ultimo = reportes[reportes.length - 1];
  if (!ultimo) return null;
  return { fecha: ultimo.creado_en, id: ultimo.id, distancia: ultimo.distancia_km };
}

// Trae una página de reportes. `cursor` viene de la página anterior; en la
// primera llamada va en null.
//
// LOS DOS FILTROS DE SEÑA (0054) SOLO VIAJAN SI SE USAN, y no es una
// optimización: es lo que hace que Explorar siga andando con la 0054 sin
// aplicar. `buscar_reportes` gana dos parámetros, así que si los mandáramos
// SIEMPRE, contra una base vieja PostgREST no encontraría ninguna firma que
// calce (PGRST202) y la pantalla quedaría en blanco para todo el mundo, filtre
// o no filtre la persona. Mandándolos solo cuando hay filtro puesto, el 99% de
// las búsquedas resuelven contra la firma de siempre.
export async function buscarReportes(
  filtros: FiltrosBusqueda = {},
  cursor: Cursor | null = null,
  limite: number = TAMANO_PAGINA,
): Promise<Pagina> {
  const base = {
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
  };
  const color = filtros.color?.trim() ? filtros.color.trim() : null;
  const tamano = filtros.tamano?.trim() ? filtros.tamano.trim() : null;

  const pedir = (args: Record<string, unknown>) => supabase.rpc('buscar_reportes', args);

  const pagina = (data: unknown, senasIgnoradas = false): Pagina => {
    const reportes = (data ?? []) as PetConDistancia[];
    return {
      reportes,
      // Si vino una página incompleta, ya no hay más: nos ahorramos una consulta.
      cursor: reportes.length < limite ? null : cursorDe(reportes),
      senasIgnoradas,
    };
  };

  if (!color && !tamano) {
    const { data, error } = await pedir(base);
    if (error) throw error;
    return pagina(data);
  }

  const conSenas = await pedir({ ...base, p_color: color, p_tamano: tamano });
  if (!conSenas.error) return pagina(conSenas.data);
  // Solo "esa función no existe" (PGRST202 / 42883) se reintenta. Un 42501 de
  // permisos o un corte de red suben tal cual: si entraran acá, la búsqueda
  // devolvería resultados sin filtrar ante cualquier problema y nadie se
  // enteraría de que hay algo roto.
  if (!esMigracionSinAplicar(conSenas.error)) throw conSenas.error;
  // Queda escrito. El síntoma que ve la persona —"elegí Negro y salen perros
  // blancos"— no dice por sí solo que falta correr una migración.
  console.warn(
    'buscarReportes: esta base todavía no tiene la 0054, así que los filtros de color y tamaño no se aplicaron.',
  );
  const sinSenas = await pedir(base);
  if (sinSenas.error) throw sinSenas.error;
  // Se devuelve marcado: la pantalla tiene que poder decir que estos NO son los
  // resultados que se pidieron (ver `senasIgnoradas` arriba).
  return pagina(sinSenas.data, true);
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
  // SEÑAS ESTRUCTURADAS (migración 0054). Las dos llegan `undefined` contra una
  // base sin la 0054 —la RPC vieja devuelve las columnas de siempre y nada
  // más—, así que ninguna pantalla puede asumir que estén.
  //
  // `chip_coincide` es lo ÚNICO que sale del chip: el número nunca se devuelve,
  // por nadie. Ver supabase/migrations/0054 y src/services/petChip.ts.
  chip_coincide?: boolean;
  puntaje?: number;
  // DESGLOSE (migración 0065). Igual que `chip_coincide` y `puntaje`, llega
  // `undefined` contra una base sin la 0065 — la RPC vieja no la conoce y
  // PostgREST no manda una clave que no existe. `porQueCoincide` (lib) ya
  // sabe tratar `undefined`/`null` como "sin razones", así que ninguna
  // pantalla necesita otro chequeo.
  //
  // `foto_similitud` NO va acá: la RPC no la devuelve (decisión de Pablo,
  // 4-ago — el coseno exacto era un oráculo del embedding). El parecido de
  // la foto llega SOLO como el booleano `porque.foto`.
  porque?: Record<string, boolean> | null;
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

// BÚSQUEDA DE ADOPCIONES EN EL SERVIDOR (migración 0030)
//
// Espejo de `busqueda.ts` (`buscarReportes`), pero para el feed de adopción:
// llama a la RPC `buscar_adopciones`, que filtra/ordena/pagina en Postgres.
// Ver docs/superpowers/specs/2026-07-21-adopcion-design.md, sección "RPC
// buscar_adopciones".
import { supabase } from '../lib/supabase';
import { esMigracionSinAplicar, ErrorAmigable } from '../lib/dbErrors';
import { Adoption } from './adoptions';

export type OrdenAdopcion = 'recientes' | 'cerca';

export interface FiltrosAdopcion {
  especie?: 'perro' | 'gato' | 'otro' | null;
  tamano?: 'chico' | 'mediano' | 'grande' | null;
  // Filtro por comuna (F5, migración 0033). `null`/ausente = todas las comunas.
  comuna?: string | null;
  // Texto libre sobre nombre + descripción (migración 0052). Adopción era la
  // única superficie de búsqueda del producto sin buscador: se podía filtrar
  // por especie y tamaño, pero no escribir "cachorro negro".
  texto?: string | null;
  // Edad (migración 0052). La columna existe desde la 0030 y la tarjeta ya la
  // MUESTRA; lo que faltaba era poder filtrar por ella.
  edad?: 'cachorro' | 'adulto' | 'senior' | null;
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
  // LOS DOS PARÁMETROS NUEVOS VIAJAN SOLO CUANDO SE USAN. No es una
  // optimización: PostgREST resuelve la función por el JUEGO DE NOMBRES de los
  // argumentos, así que mandar `p_texto` contra una base donde la 0052 todavía
  // no corrió devuelve PGRST202 y se cae el FEED ENTERO, no solo el filtro. Sin
  // texto ni edad la llamada es exactamente la de siempre y todo sigue andando
  // aunque el SQL no esté aplicado.
  const texto = (filtros.texto ?? '').trim();
  const nuevos: Record<string, unknown> = {};
  if (texto !== '') nuevos.p_texto = texto;
  if (filtros.edad) nuevos.p_edad = filtros.edad;

  const { data, error } = await supabase.rpc('buscar_adopciones', {
    p_especie: filtros.especie ?? null,
    p_tamano: filtros.tamano ?? null,
    p_comuna: filtros.comuna ?? null,
    p_lat: filtros.lat ?? null,
    p_lng: filtros.lng ?? null,
    p_radio_km: filtros.radioKm ?? null,
    p_orden: filtros.orden ?? 'recientes',
    p_cursor_fecha: cursor?.fecha ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_cursor_dist: cursor?.distancia ?? null,
    p_limite: limite,
    ...nuevos,
  });
  if (error) {
    // Con un filtro nuevo puesto y la migración sin aplicar, el error crudo
    // ("Could not find the function…") no le dice nada a nadie. Le decimos qué
    // soltar para recuperar el listado, que sí funciona.
    if (Object.keys(nuevos).length > 0 && esMigracionSinAplicar(error)) {
      throw new ErrorAmigable(
        'Todavía no podemos buscar por texto ni por edad acá. Quitá esos dos filtros y el resto del listado funciona igual.',
      );
    }
    throw error;
  }

  const adopciones = (data ?? []) as AdopcionConDistancia[];
  return {
    adopciones,
    // Si vino una página incompleta, ya no hay más: nos ahorramos una consulta.
    cursor: adopciones.length < limite ? null : cursorDe(adopciones),
  };
}

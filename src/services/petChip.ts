import { supabase } from '../lib/supabase';
import { normalizarChip } from '../lib/senasMascota';

// ACCESO AL NÚMERO DE CHIP DE UN REPORTE (migración 0054).
//
// Este es el ÚNICO archivo de la app que nombra `pet_chips`, y el guardián
// `__tests__/services/petChip.test.ts` lo verifica. Si mañana hace falta el chip
// desde otra pantalla, se pasa por acá; así hay UN solo lugar donde mirar cuando
// alguien pregunte "¿esto se puede filtrar?". Mismo criterio que la 0047 aplicó
// sobre las señas privadas.
//
// POR QUÉ EL CHIP NO ESTÁ EN `pets`
//
//  · `pets` se lee con `select('*')` en media app y lo exponen las RPC públicas
//    de búsqueda y la ficha pública. Una columna `chip` ahí habría estado a UN
//    `select('*')` de distancia de salir impresa para cualquiera sin cuenta.
//  · Y publicarlo rompe lo que viene a arreglar: el chip es lo único que prueba
//    de quién es el animal. En el aviso, el estafador que hoy dice "la tengo,
//    mandame plata" pasaría a decir "la tengo, su chip es 985112…" y quedaría
//    indistinguible del dueño real. Es la misma dinámica contra la que existe la
//    seña secreta de la 0047.
//
// El chip se guarda, se CRUZA en la base (dentro de funciones que nunca lo
// devuelven) y no sale nunca. Lo único que viaja hacia el cliente es el booleano
// `chip_coincide` de `buscar_coincidencias`.
//
// Y nada de esto viaja en el mismo `select` que las columnas de `pets`: es otra
// tabla y otra llamada. Esa es también la razón de que la app ande con la 0054
// sin aplicar por este lado — la trampa clásica de PostgREST (pedir algo nuevo
// junto a lo viejo rompe la consulta ENTERA) acá no aplica.

const TABLA = 'pet_chips';

// ¿El error es "la 0054 todavía no está aplicada"?
//   · 42P01    → undefined_table de Postgres.
//   · PGRST205 → PostgREST no encuentra la tabla en el cache de esquema.
// Deliberadamente estrecho: un 42501 de RLS o un corte de red NO entran, porque
// si entraran el chip desaparecería en silencio y nadie sabría que hay algo roto.
function esTablaFaltante(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('could not find the table') || msg.includes('does not exist');
}

/** Lo que hay guardado, o `null` si NO SE PUDO SABER. */
export type LecturaChip = { chip: string | null };

/**
 * Lee el chip del reporte.
 *
 * Devuelve `{ chip: null }` cuando la lectura funcionó y no hay ninguno, y
 * `null` cuando no se pudo leer (sin migración, sin permiso, sin red).
 *
 * LA DIFERENCIA ENTRE ESOS DOS ES TODO. Si se confundieran, un formulario con
 * la casilla vacía porque la lectura falló guardaría "vacío" encima y BORRARÍA
 * el chip real, sin decir nada. Es literalmente la trampa que ya documentó
 * `EditPetScreen` con la seña secreta de la 0047 y con el teléfono del perfil.
 *
 * NO TIRA NUNCA: se llama desde pantallas que tienen que cargar igual.
 */
export async function leerChip(petId: string): Promise<LecturaChip | null> {
  const { data, error } = await supabase
    .from(TABLA)
    .select('chip')
    .eq('pet_id', petId)
    .maybeSingle();

  if (error) {
    // Sin migración es lo esperado: ni siquiera avisamos.
    if (!esTablaFaltante(error)) {
      console.warn(`leerChip: no se pudo leer el chip del reporte ${petId}:`, error.message);
    }
    return null;
  }
  return { chip: (data?.chip as string | undefined) ?? null };
}

/**
 * Guarda (o borra) el chip del reporte.
 *
 * Devuelve `false` SOLO cuando la 0054 no está aplicada: es "la función todavía
 * no existe", no un fracaso. Cualquier otro error SÍ se propaga, porque quien
 * apretó Guardar tiene que enterarse.
 *
 * Publicar un reporte no puede fallar por esto: `PublishScreen` lo llama después
 * de crear el reporte y se come el error. Una mascota perdida importa más que un
 * extra.
 */
export async function guardarChip(
  petId: string,
  userId: string,
  chip: string | null | undefined,
): Promise<boolean> {
  // Se guarda ya normalizado. La base lo vuelve a limpiar por su cuenta en
  // `chip_norm` (que es por donde se cruza), pero guardar limpio evita que dos
  // escrituras del mismo número se vean distintas en la propia fila.
  const limpio = normalizarChip(chip);

  // Vaciar la casilla = borrar. Se borra la FILA y no se deja una con cadena
  // vacía: una fila así haría creer a la UI que hay un chip cargado y, peor,
  // su `chip_norm` sería '' y podría cruzarse con cualquier otra basura.
  if (limpio === null) {
    const { error } = await supabase.from(TABLA).delete().eq('pet_id', petId);
    if (error) {
      if (esTablaFaltante(error)) return false;
      throw error;
    }
    return true;
  }

  const { error } = await supabase
    .from(TABLA)
    .upsert({ pet_id: petId, user_id: userId, chip: limpio }, { onConflict: 'pet_id' });
  if (error) {
    if (esTablaFaltante(error)) return false;
    throw error;
  }
  return true;
}

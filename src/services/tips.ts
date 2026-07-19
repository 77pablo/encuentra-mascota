import { supabase } from '../lib/supabase';
import { ordenarTips, validarTip, Tip } from '../lib/tips';
import { ErrorAmigable } from '../lib/dbErrors';

// PISTAS DEL BARRIO — acceso a `pet_tips` (migración 0012).
// Mismo patrón que `petUpdates.ts`, con una diferencia: `listarTips` degrada a
// vacío si la tabla todavía no existe, para no tumbar la ficha del reporte.

// Fila cruda tal como llega de PostgREST. `profiles` viene como objeto en
// runtime, pero los tipos generados lo infieren como arreglo (mismo caso que el
// join de `favorites`): normalizamos las dos formas.
type FilaTip = {
  id: string;
  pet_id: string;
  user_id: string;
  texto: string;
  creado_en: string;
  profiles?:
    | { nombre: string | null; eliminado_en?: string | null }
    | Array<{ nombre: string | null; eliminado_en?: string | null }>
    | null;
};

const SELECT_CON_AUTOR = 'id, pet_id, user_id, texto, creado_en, profiles(nombre, eliminado_en)';
// Escalon intermedio: mismo embed a `profiles` pero sin `eliminado_en`. Existe
// porque mientras la migracion 0017 no este aplicada esa columna no existe, y
// PostgREST no devuelve datos parciales: si se la pedimos junto con `nombre`,
// la consulta ENTERA falla y se pierde la firma real de quien dejo la pista.
// Cuando la migracion lleve tiempo aplicada este escalon queda muerto y se
// puede sacar.
const SELECT_SOLO_NOMBRE = 'id, pet_id, user_id, texto, creado_en, profiles(nombre)';
const SELECT_SIN_AUTOR = 'id, pet_id, user_id, texto, creado_en';

function aTip(fila: FilaTip): Tip {
  const perfil = Array.isArray(fila.profiles) ? fila.profiles[0] ?? null : fila.profiles ?? null;
  return {
    id: fila.id,
    petId: fila.pet_id,
    userId: fila.user_id,
    texto: fila.texto,
    creadoEn: fila.creado_en,
    autorNombre: perfil?.nombre ?? null,
    autorEliminadoEn: perfil?.eliminado_en ?? null,
  };
}

// Pistas de un reporte, de la más nueva a la más vieja. Si la migración 0012 no
// está aplicada (o el join a `profiles` no se puede resolver sin sesión),
// devolvemos lo que se pueda en vez de romper la pantalla.
export async function listarTips(petId: string): Promise<Tip[]> {
  const consulta = (select: string) =>
    supabase
      .from('pet_tips')
      .select(select)
      .eq('pet_id', petId)
      .order('creado_en', { ascending: false });

  try {
    const conAutor = await consulta(SELECT_CON_AUTOR);
    if (!conAutor.error) {
      return ordenarTips(((conAutor.data ?? []) as unknown as FilaTip[]).map(aTip));
    }
    // La consulta con `eliminado_en` fallo (probablemente porque la migracion
    // 0017 todavia no esta aplicada). Reintentamos pidiendo solo `nombre`
    // para no perder la firma real: sin este escalon, todas las pistas
    // pasarian a firmar "Un vecino" en vez de solo las de cuentas borradas.
    const soloNombre = await consulta(SELECT_SOLO_NOMBRE);
    if (!soloNombre.error) {
      return ordenarTips(((soloNombre.data ?? []) as unknown as FilaTip[]).map(aTip));
    }
    // Sin sesión el embed a `profiles` no se puede resolver de ninguna forma:
    // reintentamos sin él, porque el texto de la pista importa más que la
    // firma.
    const sinAutor = await consulta(SELECT_SIN_AUTOR);
    if (sinAutor.error) return [];
    return ordenarTips(((sinAutor.data ?? []) as unknown as FilaTip[]).map(aTip));
  } catch {
    return [];
  }
}

// Deja una pista a nombre de quien tiene la sesión abierta (la RLS exige que
// `user_id` sea el propio). Propaga el error: la pantalla avisa si no se pudo.
export async function crearTip(petId: string, texto: string): Promise<Tip> {
  const validacion = validarTip(texto);
  if (!validacion.ok) throw new ErrorAmigable(validacion.error);

  const { data: sesion } = await supabase.auth.getUser();
  const userId = sesion?.user?.id;
  if (!userId) throw new ErrorAmigable('Necesitás tener la sesión abierta para dejar una pista.');

  const { data, error } = await supabase
    .from('pet_tips')
    .insert({ pet_id: petId, user_id: userId, texto: validacion.texto })
    .select(SELECT_SIN_AUTOR)
    .single();
  if (error) throw error;
  return aTip(data as unknown as FilaTip);
}

// Borra una pista (autor de la pista o dueño del reporte, según la RLS de 0012).
//
// Pedimos las filas borradas a propósito: cuando la RLS rechaza un delete,
// PostgREST NO devuelve error, simplemente no borra nada. Sin este chequeo la
// pantalla diría "listo" y la pista seguiría ahí.
export async function borrarTip(id: string): Promise<void> {
  const { data, error } = await supabase.from('pet_tips').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ErrorAmigable('No se pudo borrar la pista.');
  }
}

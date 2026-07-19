import { supabase } from '../lib/supabase';
import { PetInput } from '../schemas/pet';
import { ErrorAmigable } from '../lib/dbErrors';
import { difuminarUbicacion } from '../lib/difuminarUbicacion';
import { rutaDeFotoPropia } from '../lib/rutaStorage';

export interface Pet {
  id: string;
  user_id: string;
  estado: 'perdida' | 'encontrada';
  especie: 'perro' | 'gato' | 'otro';
  raza: string | null;
  nombre: string | null;
  descripcion: string;
  fotos: string[];
  lat: number;
  lng: number;
  recompensa: string | null;
  activo: boolean;
  oculto: boolean;
  creado_en: string;
  // Final feliz (verificación de reencuentro) — ver reunions.ts / lib/reunion.ts.
  reunida_en?: string | null;
  final_feliz?: string | null;
  final_foto?: string | null;
}

// NOTA: acá vivía `activePetsCache`, una caché de 30s de "todos los reportes
// activos". La búsqueda del servidor (migraciones 0014/0015) la dejó sin uso:
// ninguna pantalla se trae la lista completa, todas piden páginas filtradas con
// `services/busqueda.ts`. Se quitó junto con `listActivePets()`, que ya no
// llamaba nadie. Si alguna vez hace falta cachear, conviene hacerlo POR
// CONSULTA (clave = filtros + cursor), no una lista global.

export async function createPet(input: PetInput, fotos: string[], userId: string): Promise<Pet> {
  // La ubicacion se difumina ACA, en el borde de escritura, para que ninguna
  // pantalla pueda saltarse el paso por olvido. La coordenada exacta no se
  // guarda en ninguna parte: lo que no se guarda no se puede filtrar.
  const { lat, lng } = difuminarUbicacion({ lat: input.lat, lng: input.lng });
  const { data, error } = await supabase
    .from('pets')
    .insert({ ...input, lat, lng, fotos, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Pet;
}

export async function listMyReports(userId: string, activo: boolean): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .eq('activo', activo)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Pet[];
}

export async function listLostBySpecies(especie: Pet['especie']): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('activo', true)
    .eq('estado', 'perdida')
    .eq('especie', especie)
    .eq('oculto', false)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Pet[];
}

// Trae un reporte por id. Usamos `maybeSingle` en vez de `single` a propósito:
// con `single`, un reporte inexistente o ya borrado devuelve el error crudo de
// PostgREST ("Cannot coerce the result to a single JSON object") y esa jerga
// terminaba en pantalla. Pasa de verdad: el afiche con QR sigue pegado en la
// calle después de que la mascota volvió a casa y el reporte se borró.
export const PET_NO_DISPONIBLE =
  'Este reporte ya no está disponible. Puede que la mascota ya haya vuelto a casa.';

export async function getPet(id: string): Promise<Pet> {
  const { data, error } = await supabase.from('pets').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorAmigable(PET_NO_DISPONIBLE);
  return data as Pet;
}

export async function closePet(id: string): Promise<void> {
  const { error } = await supabase.from('pets').update({ activo: false }).eq('id', id);
  if (error) throw error;
}

export async function updatePet(
  id: string,
  fields: Partial<Pick<Pet, 'estado' | 'especie' | 'raza' | 'nombre' | 'descripcion' | 'recompensa'>>,
): Promise<void> {
  const { error } = await supabase.from('pets').update(fields).eq('id', id);
  if (error) throw error;
}

// Borra el reporte y, con él, sus fotos del bucket público.
//
// El ORDEN importa: primero se leen las rutas, después se borra de Storage y al
// final la fila. Si se borrara la fila primero, las rutas se pierden y no hay
// reintento posible (es la lección literal del Critical #2 del borrado de
// cuenta, donde las fotos quedaban para siempre en un bucket público mientras
// respondíamos "listo").
//
// Si Storage falla, la fila se borra IGUAL: quedaría una foto huérfana, que es
// exactamente el estado de hoy, mientras que abortar dejaría a la persona sin
// poder borrar su propio reporte —que puede ser justo una urgencia de
// privacidad—. Se elige el estado malo visible por sobre el silencioso.
//
// "Visible" acá quiere decir: con registro. El mismo criterio que ya aplica
// `delete-account/index.ts:126-133` para rutas ajenas descartadas se aplica
// acá a dos huecos por los que este flujo podía fallar completamente en
// silencio (ver los `console.warn` de abajo): que el `select` que lee las
// rutas falle, y que el filtro `rutaDeFotoPropia` descarte TODAS las URLs que
// había. Ninguno de los dos aborta el borrado de la fila, por la misma razón
// de arriba.
export async function deletePet(id: string, userId: string): Promise<void> {
  const { data: fila, error: errLectura } = await supabase
    .from('pets')
    .select('fotos, final_foto')
    .eq('id', id)
    .maybeSingle();
  // Sin este aviso, un fallo de red acá borraría la fila sin haber tocado
  // ninguna foto y la app le diría "Borrado" a la persona igual.
  if (errLectura) {
    console.warn(
      `deletePet: no se pudieron leer las fotos del reporte ${id} antes de borrarlo (se borra el reporte de todas formas):`,
      errLectura.message,
    );
  }

  const urls: string[] = [...((fila?.fotos as string[]) ?? [])];
  // `final_foto` (el "final feliz", migración 0008) vive en su propia columna y
  // es fácil de olvidar: sin esto, cada reencuentro deja una huérfana.
  if (fila?.final_foto) urls.push(fila.final_foto as string);

  const rutasFiltradas = urls
    .map((u) => rutaDeFotoPropia(u, userId))
    .filter((r): r is string => r !== null);
  // Deduplicar: si `final_foto` también está dentro de `fotos`, la misma ruta
  // llegaría dos veces. Hermano del mismo paso en `delete-account/index.ts:140`.
  const rutas = [...new Set(rutasFiltradas)];

  // Había URLs pero el filtro las descartó TODAS: puede ser que `getPublicUrl`
  // haya cambiado de formato (self-hosted, CDN, otra convención) o que alguien
  // haya guardado a mano la URL de otra persona en su propio reporte. Sin este
  // aviso ninguno de los dos escenarios se distingue de "no había fotos".
  if (urls.length > 0 && rutas.length === 0) {
    console.warn(
      `deletePet: se descartaron las ${urls.length} foto(s) del reporte ${id}: ninguna es reconocible como propia de ${userId}`,
    );
  }

  if (rutas.length > 0) {
    const { error: errStorage } = await supabase.storage.from('pet-photos').remove(rutas);
    // A propósito no se corta el flujo: ver el comentario de arriba.
    if (errStorage) console.warn('No se pudieron borrar algunas fotos:', errStorage.message);
  }

  const { error } = await supabase.from('pets').delete().eq('id', id);
  if (error) throw error;
}

// Cuenta reencuentros (reportes cerrados) para mostrar en la pantalla de Inicio.
export async function countReunidas(): Promise<number> {
  const { count, error } = await supabase
    .from('pets')
    .select('id', { count: 'exact', head: true })
    .eq('activo', false);
  if (error) throw error;
  return count ?? 0;
}

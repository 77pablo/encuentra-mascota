import { supabase } from '../lib/supabase';
import { PetInput } from '../schemas/pet';
import { ErrorAmigable } from '../lib/dbErrors';
import { difuminarUbicacion } from '../lib/difuminarUbicacion';

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

export async function deletePet(id: string): Promise<void> {
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

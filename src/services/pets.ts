import { supabase } from '../lib/supabase';
import { PetInput } from '../schemas/pet';
import { ttlCache } from '../lib/cache';

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
  creado_en: string;
}

// Caché de la lista de reportes activos (30s). Evita pedir todo a la base
// cada vez que se cambia entre Mapa y Lista.
const activePetsCache = ttlCache<Pet[]>(30_000);

export async function createPet(input: PetInput, fotos: string[], userId: string): Promise<Pet> {
  const { data, error } = await supabase
    .from('pets')
    .insert({ ...input, fotos, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  activePetsCache.clear(); // hay un reporte nuevo → refrescar
  return data as Pet;
}

export async function listActivePets(opts?: { force?: boolean }): Promise<Pet[]> {
  if (!opts?.force) {
    const cached = activePetsCache.get();
    if (cached) return cached;
  }
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('activo', true)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  const pets = (data ?? []) as Pet[];
  activePetsCache.set(pets);
  return pets;
}

export async function listLostBySpecies(especie: Pet['especie']): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('activo', true)
    .eq('estado', 'perdida')
    .eq('especie', especie)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Pet[];
}

export async function getPet(id: string): Promise<Pet> {
  const { data, error } = await supabase.from('pets').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Pet;
}

export async function closePet(id: string): Promise<void> {
  const { error } = await supabase.from('pets').update({ activo: false }).eq('id', id);
  if (error) throw error;
  activePetsCache.clear(); // se cerró un reporte → refrescar
}

export async function updatePet(
  id: string,
  fields: Partial<Pick<Pet, 'estado' | 'especie' | 'raza' | 'nombre' | 'descripcion' | 'recompensa'>>,
): Promise<void> {
  const { error } = await supabase.from('pets').update(fields).eq('id', id);
  if (error) throw error;
  activePetsCache.clear();
}

export async function deletePet(id: string): Promise<void> {
  const { error } = await supabase.from('pets').delete().eq('id', id);
  if (error) throw error;
  activePetsCache.clear();
}

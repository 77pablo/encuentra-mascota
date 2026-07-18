import { supabase } from '../lib/supabase';

export interface PetUpdate {
  id: string;
  pet_id: string;
  user_id: string;
  texto: string;
  creado_en: string;
}

// Publica una novedad del reporte (solo el dueño, según RLS) y devuelve la
// fila creada. El texto se limpia y no puede quedar vacío.
export async function addUpdate(petId: string, userId: string, texto: string): Promise<PetUpdate> {
  const clean = texto.trim();
  if (!clean) throw new Error('La novedad está vacía');
  const { data, error } = await supabase
    .from('pet_updates')
    .insert({ pet_id: petId, user_id: userId, texto: clean })
    .select()
    .single();
  if (error) throw error;
  return data as PetUpdate;
}

// Bitácora de novedades de un reporte, de la más reciente a la más antigua.
export async function listUpdates(petId: string): Promise<PetUpdate[]> {
  const { data, error } = await supabase
    .from('pet_updates')
    .select('*')
    .eq('pet_id', petId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PetUpdate[];
}

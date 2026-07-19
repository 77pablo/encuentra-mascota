import { supabase } from '../lib/supabase';
import { difuminarUbicacion } from '../lib/difuminarUbicacion';

export interface Sighting {
  id: string;
  pet_id: string;
  user_id: string;
  lat: number;
  lng: number;
  nota: string | null;
  foto: string | null;
  creado_en: string;
}

export interface NewSighting {
  pet_id: string;
  user_id: string;
  lat: number;
  lng: number;
  nota?: string | null;
  foto?: string | null;
}

// Registra un avistamiento ("lo vi acá") y devuelve la fila creada.
export async function addSighting(input: NewSighting): Promise<Sighting> {
  // Un avistamiento es la ubicacion de quien lo reporta y tiene el mismo
  // problema de privacidad que el reporte inicial: se difumina aca, al
  // escribir, y la coordenada exacta no se guarda en ninguna parte.
  const { lat, lng } = difuminarUbicacion({ lat: input.lat, lng: input.lng });
  const { data, error } = await supabase
    .from('sightings')
    .insert({
      pet_id: input.pet_id,
      user_id: input.user_id,
      lat,
      lng,
      nota: input.nota ?? null,
      foto: input.foto ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Sighting;
}

// Rastro de avistamientos de un reporte, del más reciente al más antiguo.
export async function listSightings(petId: string): Promise<Sighting[]> {
  const { data, error } = await supabase
    .from('sightings')
    .select('*')
    .eq('pet_id', petId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Sighting[];
}

// Borra un avistamiento (autor del avistamiento o dueño del reporte, según RLS).
export async function deleteSighting(id: string): Promise<void> {
  const { error } = await supabase.from('sightings').delete().eq('id', id);
  if (error) throw error;
}

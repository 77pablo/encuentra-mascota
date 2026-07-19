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
  // true cuando lat/lng ya vienen difuminadas (ej. el pin no se movio del
  // punto inicial del reporte, que createPet ya difumino). Por defecto es
  // false: una coordenada "cruda" (GPS del usuario o un toque/arrastre en el
  // mapa) siempre se tiene que difuminar aca. Ver AddSightingScreen.
  yaDifuminado?: boolean;
}

// Registra un avistamiento ("lo vi acá") y devuelve la fila creada.
export async function addSighting(input: NewSighting): Promise<Sighting> {
  // Un avistamiento es la ubicacion de quien lo reporta y tiene el mismo
  // problema de privacidad que el reporte inicial: se difumina aca, al
  // escribir, y la coordenada exacta no se guarda en ninguna parte.
  //
  // Excepcion: si input.yaDifuminado es true, la coordenada que llego ya
  // esta difuminada (viene del pin inicial, que createPet ya movio ~250m) y
  // no se toca de nuevo. Difuminar una coordenada ya difuminada no arriesga
  // privacidad (nunca acerca al punto real), pero si degrada sin necesidad
  // la precision del rastro: dos difuminados independientes pueden sumar
  // error en la misma direccion y alejar el avistamiento mas de lo que
  // cualquiera de los dos haria solo.
  const { lat, lng } = input.yaDifuminado
    ? { lat: input.lat, lng: input.lng }
    : difuminarUbicacion({ lat: input.lat, lng: input.lng });
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

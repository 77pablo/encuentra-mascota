import { supabase } from '../lib/supabase';

// Guardar (corazón) publicaciones de adopción. Tabla `adoption_saves` con
// clave compuesta (user_id, adoption_id); paralela a `favorites` (que
// referencia pets) para no acoplar ni volver polimórficos los favoritos de
// reportes existentes. Cada usuario gestiona solo los suyos (ver RLS en
// 0030). Mismo patrón que `services/favorites.ts`.

export async function addAdoptionSave(userId: string, adoptionId: string): Promise<void> {
  const { error } = await supabase
    .from('adoption_saves')
    .insert({ user_id: userId, adoption_id: adoptionId });
  if (error) throw error;
}

export async function removeAdoptionSave(userId: string, adoptionId: string): Promise<void> {
  const { error } = await supabase
    .from('adoption_saves')
    .delete()
    .eq('user_id', userId)
    .eq('adoption_id', adoptionId);
  if (error) throw error;
}

// Solo los ids de las adopciones guardadas — para pintar el corazón en el
// feed y en la tarjeta de detalle.
export async function listMyAdoptionSaveIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('adoption_saves')
    .select('adoption_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row: { adoption_id: string }) => row.adoption_id);
}

import { supabase } from '../lib/supabase';
import { Pet } from './pets';

// Guardar / seguir reportes. La tabla `favorites` tiene clave compuesta
// (user_id, pet_id); cada usuario gestiona solo los suyos (ver RLS en 0009).

export async function addFavorite(userId: string, petId: string): Promise<void> {
  const { error } = await supabase.from('favorites').insert({ user_id: userId, pet_id: petId });
  if (error) throw error;
}

export async function removeFavorite(userId: string, petId: string): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('pet_id', petId);
  if (error) throw error;
}

// Solo los ids de las mascotas guardadas — para pintar el corazón en las listas.
export async function listMyFavoriteIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('favorites').select('pet_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row: { pet_id: string }) => row.pet_id);
}

// Las mascotas guardadas completas, de la más nueva a la más vieja, para la
// pantalla "Guardados". Trae el join a pets en una sola consulta.
export async function listMyFavorites(userId: string): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('creado_en, pets(*)')
    .eq('user_id', userId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  // El join `pets(*)` es una relación muchos-a-uno: en runtime `pets` llega
  // como objeto, pero los tipos generados lo infieren como arreglo. Normalizamos
  // ambas formas y descartamos filas cuya mascota ya no exista.
  return ((data ?? []) as Array<{ pets: Pet | Pet[] | null }>)
    .map((row) => (Array.isArray(row.pets) ? row.pets[0] ?? null : row.pets))
    .filter((pet): pet is Pet => pet != null);
}

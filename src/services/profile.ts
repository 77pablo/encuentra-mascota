import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  nombre: string;
  foto_perfil: string | null;
  telefono: string | null;
  red_social: string | null;
  creado_en: string;
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return (data ?? null) as Profile | null;
}

export async function updateMyProfile(
  userId: string,
  fields: { nombre?: string; foto_perfil?: string; telefono?: string; red_social?: string },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
}

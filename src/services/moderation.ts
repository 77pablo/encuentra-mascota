import { supabase } from '../lib/supabase';

export async function denunciarPet(petId: string, reporterUser: string, motivo: string): Promise<void> {
  const { error } = await supabase.from('denuncias').insert({ pet_id: petId, reporter_user: reporterUser, motivo });
  if (error) throw error;
}

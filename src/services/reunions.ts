import { supabase } from '../lib/supabase';
import { clearActivePetsCache, Pet } from './pets';

// Servicio del "final feliz" (verificación de reencuentro). Vive en un archivo
// aparte de pets.ts a propósito, para minimizar conflictos de merge.

export interface MarkReunitedInput {
  nota?: string | null; // mensajito feliz opcional del dueño
  foto?: string | null; // URL pública de la foto del reencuentro (opcional)
}

// Marca un reporte como reunido: lo cierra (`activo=false`) y deja el registro
// del final feliz. Luego limpia la caché de reportes activos para que la lista
// se refresque. El dueño ya tiene permiso de UPDATE por RLS.
export async function markReunited(id: string, input: MarkReunitedInput = {}): Promise<void> {
  const nota = input.nota?.trim();
  const { error } = await supabase
    .from('pets')
    .update({
      activo: false,
      reunida_en: new Date().toISOString(),
      final_feliz: nota ? nota : null,
      final_foto: input.foto ?? null,
    })
    .eq('id', id);
  if (error) throw error;
  clearActivePetsCache(); // se cerró un reporte → refrescar listas
}

// Lista los finales felices más recientes (reportes cerrados con fecha de
// reencuentro). Útil para celebrar los reencuentros en la pantalla de Inicio.
export async function listFinalesFelices(limit = 10): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('activo', false)
    .eq('oculto', false)
    .not('reunida_en', 'is', null)
    .order('reunida_en', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Pet[];
}

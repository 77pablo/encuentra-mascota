import { supabase } from '../lib/supabase';
import { filtrarBloqueados, idsBloqueados } from './bloqueos';

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
//
// Se ocultan las novedades de gente que bloqueé, igual que las pistas
// (`tips.ts`) y los avistamientos (`sightings.ts`). Filtro del CLIENTE (lista
// corta, sin cursor) que degrada a conjunto vacío si no hay sesión o si la tabla
// 0022 todavía no existe: cosmético a propósito, son datos públicos y el bloqueo
// protege de una PERSONA en la interfaz, no es un control de acceso.
//
// En la práctica una novedad la escribe el dueño del reporte (así lo exige la
// RLS de la 0010), así que esto es "no ver el reporte de alguien que bloqueé"
// desde otro ángulo, no un caso raro.
export async function listUpdates(petId: string): Promise<PetUpdate[]> {
  const [{ data, error }, bloqueados] = await Promise.all([
    supabase
      .from('pet_updates')
      .select('*')
      .eq('pet_id', petId)
      .order('creado_en', { ascending: false }),
    idsBloqueados(),
  ]);
  if (error) throw error;
  return filtrarBloqueados((data ?? []) as PetUpdate[], bloqueados, (u) => u.user_id);
}

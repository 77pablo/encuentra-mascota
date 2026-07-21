import { supabase } from '../lib/supabase';
import { AdoptionInput } from '../schemas/adoption';
import { ErrorAmigable } from '../lib/dbErrors';
import { difuminarUbicacion } from '../lib/difuminarUbicacion';
import { rutaDeFotoPropia } from '../lib/rutaStorage';

export interface Adoption {
  id: string;
  user_id: string;
  especie: 'perro' | 'gato' | 'otro';
  nombre: string | null;
  descripcion: string;
  fotos: string[];
  lat: number;
  lng: number;
  comuna?: string | null;
  edad?: 'cachorro' | 'adulto' | 'senior' | null;
  tamano?: 'chico' | 'mediano' | 'grande' | null;
  esterilizado?: 'si' | 'no' | 'no_se' | null;
  // Único campo con set de valores distinto (ver schemas/adoption.ts).
  vacunas?: 'al_dia' | 'no' | 'no_se' | null;
  convive_ninos?: 'si' | 'no' | 'no_se' | null;
  convive_perros?: 'si' | 'no' | 'no_se' | null;
  convive_gatos?: 'si' | 'no' | 'no_se' | null;
  requisitos?: string | null;
  activo: boolean;
  // Final feliz: cuándo la mascota encontró familia (ver marcarAdoptada).
  adoptada_en?: string | null;
  oculto: boolean;
  creado_en: string;
}

// `schemas/adoption.ts` valida el formulario, pero no incluye lat/lng/comuna
// (esos vienen del selector de ubicación, no de los campos de texto — mismo
// motivo por el que `PublishScreen` exige la comuna aparte del schema de
// `pets`). El servicio los necesita para difuminar y guardar el punto.
export type AdoptionCreateInput = AdoptionInput & {
  lat: number;
  lng: number;
  comuna?: string | null;
};

export async function createAdoption(
  input: AdoptionCreateInput,
  fotos: string[],
  userId: string,
): Promise<Adoption> {
  // Mismo borde de escritura que `createPet`: la ubicación se difumina ACA, y
  // la coordenada exacta nunca se guarda en ninguna parte.
  const { lat, lng } = difuminarUbicacion({ lat: input.lat, lng: input.lng });
  const { data, error } = await supabase
    .from('adoptions')
    .insert({ ...input, lat, lng, fotos, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Adoption;
}

// Mismo motivo que `PET_NO_DISPONIBLE`: con `single()` una publicación
// inexistente o ya borrada devuelve el error crudo de PostgREST. Usamos
// `maybeSingle` y lo traducimos a un mensaje que se pueda mostrar.
export const ADOPTION_NO_DISPONIBLE =
  'Esta publicación de adopción ya no está disponible. Puede que la mascota ya haya encontrado familia.';

export async function getAdoption(id: string): Promise<Adoption> {
  const { data, error } = await supabase.from('adoptions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorAmigable(ADOPTION_NO_DISPONIBLE);
  return data as Adoption;
}

export async function listMyAdoptions(userId: string): Promise<Adoption[]> {
  const { data, error } = await supabase
    .from('adoptions')
    .select('*')
    .eq('user_id', userId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Adoption[];
}

export async function updateAdoption(
  id: string,
  fields: Partial<
    Pick<
      Adoption,
      | 'especie'
      | 'nombre'
      | 'descripcion'
      | 'edad'
      | 'tamano'
      | 'esterilizado'
      | 'vacunas'
      | 'convive_ninos'
      | 'convive_perros'
      | 'convive_gatos'
      | 'requisitos'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('adoptions').update(fields).eq('id', id);
  if (error) throw error;
}

// Borra la publicación y, con ella, sus fotos del bucket público. Mismo
// patrón (y mismo orden: primero leer rutas, después Storage, al final la
// fila) que `deletePet`, incluida la misma decisión de no abortar si Storage
// falla — ver los comentarios largos ahí para el porqué.
export async function deleteAdoption(id: string, userId: string): Promise<void> {
  const { data: fila, error: errLectura } = await supabase
    .from('adoptions')
    .select('fotos')
    .eq('id', id)
    .maybeSingle();
  if (errLectura) {
    console.warn(
      `deleteAdoption: no se pudieron leer las fotos de la publicación ${id} antes de borrarla (se borra igual):`,
      errLectura.message,
    );
  }

  const urls: string[] = [...((fila?.fotos as string[]) ?? [])];
  const rutasFiltradas = urls
    .map((u) => rutaDeFotoPropia(u, userId))
    .filter((r): r is string => r !== null);
  const rutas = [...new Set(rutasFiltradas)];

  if (urls.length > 0 && rutas.length === 0) {
    console.warn(
      `deleteAdoption: se descartaron las ${urls.length} foto(s) de la publicación ${id}: ninguna es reconocible como propia de ${userId}`,
    );
  }

  if (rutas.length > 0) {
    const { error: errStorage } = await supabase.storage.from('pet-photos').remove(rutas);
    // A propósito no se corta el flujo: mismo criterio que `deletePet`.
    if (errStorage) console.warn('No se pudieron borrar algunas fotos:', errStorage.message);
  }

  const { error } = await supabase.from('adoptions').delete().eq('id', id);
  if (error) throw error;
}

// Final feliz: la mascota encontró familia. Sale del feed (la RPC
// `buscar_adopciones` excluye `adoptada_en is not null`), pero guardados y
// chat sobreviven.
export async function marcarAdoptada(id: string): Promise<void> {
  const { error } = await supabase
    .from('adoptions')
    .update({ adoptada_en: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

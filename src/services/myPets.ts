import { supabase } from '../lib/supabase';
import { MyPetInput } from '../schemas/myPet';
import { rutaDeFotoPropia } from '../lib/rutaStorage';

// Una ficha "Mi mascota": registro permanente de una mascota (distinto de un
// reporte `pets`). Se registra una vez y sirve para pre-cargar un reporte
// "perdida" en un toque y para imprimir la placa de collar con QR.
export interface MyPet {
  id: string;
  user_id: string;
  nombre: string;
  especie: 'perro' | 'gato' | 'otro';
  raza: string | null;
  foto: string | null;
  senas: string | null;
  chip: string | null;
  // Token de 128 bits generado en el servidor (default de la 0027). Es la clave
  // pública del QR: nunca se fija desde el cliente.
  collar_token: string;
  creado_en: string;
}

// Los opcionales vacíos se guardan como null, no como cadena vacía: una seña
// "" no aporta nada y ensucia la base. `undefined` y '' colapsan a null.
function limpio(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}

export async function listMyPets(userId: string): Promise<MyPet[]> {
  const { data, error } = await supabase
    .from('my_pets')
    .select('*')
    .eq('user_id', userId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyPet[];
}

export async function createMyPet(
  input: MyPetInput,
  foto: string | null,
  userId: string,
): Promise<MyPet> {
  // NO se envía `collar_token`: lo genera el servidor con su default (128 bits),
  // para que el cliente no pueda fijarlo.
  const { data, error } = await supabase
    .from('my_pets')
    .insert({
      user_id: userId,
      nombre: input.nombre.trim(),
      especie: input.especie,
      raza: limpio(input.raza),
      senas: limpio(input.senas),
      chip: limpio(input.chip),
      foto: limpio(foto),
    })
    .select()
    .single();
  if (error) throw error;
  return data as MyPet;
}

// Campos editables de una ficha. La foto se maneja aparte (se sube y se pasa la
// URL); el resto sale del formulario.
export interface MyPetUpdate {
  nombre?: string;
  especie?: 'perro' | 'gato' | 'otro';
  raza?: string | null;
  senas?: string | null;
  chip?: string | null;
  foto?: string | null;
}

export async function updateMyPet(id: string, fields: MyPetUpdate): Promise<void> {
  // Normalizamos los opcionales de texto a null igual que en el alta.
  const payload: Record<string, unknown> = {};
  if (fields.nombre !== undefined) payload.nombre = fields.nombre.trim();
  if (fields.especie !== undefined) payload.especie = fields.especie;
  if (fields.raza !== undefined) payload.raza = limpio(fields.raza);
  if (fields.senas !== undefined) payload.senas = limpio(fields.senas);
  if (fields.chip !== undefined) payload.chip = limpio(fields.chip);
  if (fields.foto !== undefined) payload.foto = limpio(fields.foto);

  const { error } = await supabase.from('my_pets').update(payload).eq('id', id);
  if (error) throw error;
}

// Borra la ficha y, con ella, su foto del bucket público. Mismo orden y criterio
// que `deletePet`: primero se lee la ruta, después se borra de Storage y al final
// la fila. Si Storage falla, la fila se borra igual (estado malo visible > la
// persona sin poder borrar su ficha).
export async function deleteMyPet(id: string, userId: string): Promise<void> {
  const { data: fila, error: errLectura } = await supabase
    .from('my_pets')
    .select('foto')
    .eq('id', id)
    .maybeSingle();
  if (errLectura) {
    console.warn(
      `deleteMyPet: no se pudo leer la foto de la ficha ${id} antes de borrarla (se borra igual):`,
      errLectura.message,
    );
  }

  const ruta = fila?.foto ? rutaDeFotoPropia(fila.foto as string, userId) : null;
  if (ruta) {
    const { error: errStorage } = await supabase.storage.from('pet-photos').remove([ruta]);
    if (errStorage) console.warn('No se pudo borrar la foto de la ficha:', errStorage.message);
  }

  const { error } = await supabase.from('my_pets').delete().eq('id', id);
  if (error) throw error;
}

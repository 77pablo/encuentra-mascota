import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

// Comprime a máx 1080px de ancho y sube; devuelve la URL pública.
export async function uploadPetPhoto(uri: string, userId: string): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1080 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
  );

  const response = await fetch(manipulated.uri);
  const arrayBuffer = await response.arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('pet-photos')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from('pet-photos').getPublicUrl(path);
  return data.publicUrl;
}

// Sube varias fotos en paralelo y devuelve sus URLs públicas, preservando el orden.
export async function uploadPetPhotos(uris: string[], userId: string): Promise<string[]> {
  return Promise.all(uris.map((uri) => uploadPetPhoto(uri, userId)));
}

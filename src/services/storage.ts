import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { idAleatorio } from '../lib/idAleatorio';
import { rutaDeFotoPropia } from '../lib/rutaStorage';

// Comprime a máx 1080px de ancho y sube; devuelve la URL pública.
export async function uploadPetPhoto(uri: string, userId: string): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1080 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
  );

  const response = await fetch(manipulated.uri);
  const arrayBuffer = await response.arrayBuffer();
  const path = `${userId}/${idAleatorio()}.jpg`;

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

// ─────────────────────────────────────────────────────────────────────────────
// M-6: no dejar fotos huérfanas cuando la escritura va a ser rechazada.
//
// Contexto: desde la 0036, las 6 policies de INSERT (pets, adoptions,
// pet_tips, sightings, adoption_questions, messages) llevan
// `and not estoy_suspendido()`. Como en el flujo de publicar la foto se sube al
// bucket ANTES del insert, un usuario suspendido gastaba la subida y recién
// después la base le devolvía 42501: la imagen quedaba huérfana para siempre y
// podía repetirlo a voluntad.
//
// LA DEFENSA ES LA RLS, no esto. Nada de acá impide publicar: un cliente
// modificado se salta las dos funciones de abajo y la base lo rechaza igual.
// Lo que arreglan es la basura en el bucket y el mensaje confuso.
// ─────────────────────────────────────────────────────────────────────────────

// ¿La sesión actual está suspendida? Chequeo de cortesía para no gastar una
// subida al bucket antes de un rechazo seguro.
//
// Degrada a `false` ante CUALQUIER error (base sin la 0036 aplicada, red
// caída, invitado sin permiso de ejecución sobre la RPC): en la duda seguimos
// el flujo normal y decide la RLS. Un `true` inventado por un fallo de red le
// bloquearía la publicación a alguien que sí puede publicar, que es el error
// caro de los dos.
export async function estoySuspendido(): Promise<boolean> {
  const { data, error } = await supabase.rpc('estoy_suspendido');
  if (error) return false;
  return data === true;
}

// ¿La base rechazó la escritura de forma DEFINITIVA? Dos casos: permisos
// (`42501` = insufficient_privilege, o el texto de RLS cuando PostgREST lo
// devuelve sin `code`) y el anti-spam de publicaciones (`P0001`).
//
// Importa que sea ESTE conjunto y no "cualquier error": un rechazo de la base
// significa que la fila NO entró, así que las fotos que iba a referenciar son
// basura segura. Un error de red, en cambio, deja en duda si el insert entró;
// borrar ahí las fotos de un reporte vivo sería peor que dejar una huérfana.
//
// (Antes se llamaba `esRechazoDePermiso` y solo cubría el primer caso, así que
// llegar al límite de publicaciones dejaba fotos huérfanas en cada intento.)
export function esRechazoDefinitivo(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const codigo = 'code' in error ? String((error as { code: unknown }).code ?? '') : '';
  if (codigo === '42501') return true;
  // El anti-spam de publicaciones (`check_pet_rate_limit`, 0002) corta con un
  // `raise exception`, que PostgREST devuelve como `P0001`. Es un rechazo TAN
  // definitivo como el de permisos —la fila no entró— y hay que tratarlo igual:
  // sin esto, alcanzar el límite dejaba las fotos recién subidas huérfanas en el
  // bucket, y el mensaje invita a reintentar, así que se multiplicaban. Es el
  // único `P0001` que puede recibir un insert de `pets`.
  if (codigo === 'P0001') return true;
  const texto = ('message' in error ? String((error as { message: unknown }).message ?? '') : '')
    .toLowerCase();
  return (
    texto.includes('row-level security') ||
    texto.includes('permission denied') ||
    texto.includes('límite de publicaciones')
  );
}

// Borra del bucket fotos que acabamos de subir y que ya no va a referenciar
// nadie. Mejor esfuerzo: nunca lanza. Si el borrado falla nos quedamos con la
// huérfana —exactamente el estado de hoy—, pero no le arruinamos a la persona
// el error real que estaba por ver.
//
// Filtra por `rutaDeFotoPropia` como `deletePet`: si una URL no es reconocible
// como propia, no se manda a Storage (rebotaría por RLS igual). Ojo con el
// silencio de PostgREST/Storage: un borrado sin permiso no devuelve error, solo
// no borra; por eso el `console.warn` cuando había URLs y no quedó ninguna ruta.
export async function borrarFotosSubidas(urls: string[], userId: string): Promise<void> {
  try {
    const rutas = [
      ...new Set(
        urls.map((u) => rutaDeFotoPropia(u, userId)).filter((r): r is string => r !== null),
      ),
    ];
    if (urls.length > 0 && rutas.length === 0) {
      console.warn(
        `borrarFotosSubidas: se descartaron las ${urls.length} foto(s) recién subidas: ninguna es reconocible como propia de ${userId}`,
      );
      return;
    }
    if (rutas.length === 0) return;
    const { error } = await supabase.storage.from('pet-photos').remove(rutas);
    if (error) {
      console.warn('borrarFotosSubidas: quedaron fotos huérfanas en el bucket:', error.message);
    }
  } catch (e: any) {
    console.warn('borrarFotosSubidas: quedaron fotos huérfanas en el bucket:', e?.message ?? e);
  }
}

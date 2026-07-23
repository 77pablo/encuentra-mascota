// Decide si hay que subir la foto adjunta de un mensaje de chat o reusar la
// URL de una subida anterior. Separado de `ChatScreen` para poder testearlo
// sin montar toda la pantalla (ver `onSend`).
//
// Por qué existe: antes, cuando `uploadPetPhoto` tenía éxito pero el
// `sendMessage` posterior fallaba, se guardaba la URL remota ya subida en el
// mismo estado que la uri local (`imagenAdjunta`). En el reintento, `onSend`
// volvía a pasar esa URL remota a `uploadPetPhoto`, re-subiéndola (archivo
// huérfano en Storage) — y `expo-image-manipulator` espera una uri LOCAL, no
// una URL `https://` (puede fallar directo, sobre todo en web por CORS).
//
// `ChatScreen` ahora guarda la uri local en `imagenAdjunta` y la URL ya
// subida (si la hay) en un estado separado, `urlSubida`. Esta función es la
// única que decide qué hacer con esos dos valores:
// - Sin foto adjunta: no hay nada que subir.
// - Con foto adjunta y ya subida antes (reintento): se reusa esa URL, sin
//   volver a llamar a `subir`.
// - Con foto adjunta y sin subir todavía: se sube la uri local.
export async function resolverUrlFoto(
  imagenAdjunta: string | null,
  urlSubida: string | null,
  subir: (uriLocal: string) => Promise<string>,
): Promise<string | undefined> {
  if (!imagenAdjunta) return undefined;
  if (urlSubida) return urlSubida;
  return subir(imagenAdjunta);
}

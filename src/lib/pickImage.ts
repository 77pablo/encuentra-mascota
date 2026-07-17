import * as ImagePicker from 'expo-image-picker';

// Toma una foto con la cámara. Devuelve el uri, o null si se cancela / sin permiso.
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (res.canceled) return null;
  return res.assets[0].uri;
}

// Elige una o varias fotos de la galería (hasta `limit`). Devuelve los uris.
export async function pickFromLibrary(limit = 1): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    quality: 1,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => a.uri);
}

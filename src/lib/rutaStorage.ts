// Las fotos se guardan como URL publica completa (ver services/storage.ts), asi
// que para borrarlas de Storage hay que recuperar la ruta de adentro del bucket.
const BUCKET = 'pet-photos';
const MARCA = `/storage/v1/object/public/${BUCKET}/`;

// Devuelve la ruta dentro del bucket solo si la foto es del propio usuario.
//
// Exige la misma forma que `mis_fotos_a_borrar()` en 0017 y que el filtro
// gemelo de `delete-account/index.ts`: UN solo segmento bajo la carpeta del
// usuario. No es la defensa principal —esa es la RLS de Storage, que no se
// puede evitar desde el cliente— pero deja escrita la invariante en el
// codigo, evita mandarle a Storage rutas que van a rebotar, y si alguna vez
// este camino se muda a una Edge Function con service_role, el filtro ya
// esta puesto.
//
// A propósito SIN regex: una version anterior armaba `new RegExp(`^${userId}/[^/]+$`)`,
// interpolando el userId directo en el patron. El comentario de esa version
// decia que el `[^/]+` descartaba subcarpetas y `..`, lo cual es cierto para
// el patron en si, pero la premisa de fondo —que ese patron es seguro sea
// cual sea el userId— era falsa: con `userId = '.*'` la regex deja de exigir
// ESE userId y termina matcheando la ruta de cualquier otro usuario, y con
// `userId = '1111.1111'` el `.` matchea cualquier caracter y deja pasar
// `1111x1111`. Hoy no es explotable porque el userId viene siempre de la
// sesion (un UUID), pero la comparacion de strings de abajo elimina la clase
// de problema entera en vez de confiar en el formato del dato — la misma
// forma, a proposito, que usa `delete-account/index.ts:117-124`
// (`startsWith` + `slice` + `!includes('/')`).
export function rutaDeFotoPropia(url: string, userId: string): string | null {
  if (!url || !userId) return null;
  const i = url.indexOf(MARCA);
  if (i === -1) return null;

  const ruta = url.slice(i + MARCA.length);
  const prefijo = `${userId}/`;
  if (!ruta.startsWith(prefijo)) return null;

  const resto = ruta.slice(prefijo.length);
  // Un solo segmento: nada de subcarpetas ni de `..` seguido de otra barra.
  return resto.length > 0 && !resto.includes('/') ? ruta : null;
}

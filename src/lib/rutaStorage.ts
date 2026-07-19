// Las fotos se guardan como URL publica completa (ver services/storage.ts), asi
// que para borrarlas de Storage hay que recuperar la ruta de adentro del bucket.
const BUCKET = 'pet-photos';
const MARCA = `/storage/v1/object/public/${BUCKET}/`;

// Devuelve la ruta dentro del bucket solo si la foto es del propio usuario.
//
// Exige la misma forma que `mis_fotos_a_borrar()` en 0017: UN solo segmento bajo
// la carpeta del usuario. No es la defensa principal —esa es la RLS de Storage,
// que no se puede evitar desde el cliente— pero deja escrita la invariante en el
// codigo, evita mandarle a Storage rutas que van a rebotar, y si alguna vez este
// camino se muda a una Edge Function con service_role, el filtro ya esta puesto.
export function rutaDeFotoPropia(url: string, userId: string): string | null {
  if (!url || !userId) return null;
  const i = url.indexOf(MARCA);
  if (i === -1) return null;

  const ruta = url.slice(i + MARCA.length);
  // `[^/]+` en el segundo segmento descarta subcarpetas y tambien el `..`, que
  // solo puede escalar si viene seguido de otra barra.
  const permitida = new RegExp(`^${userId}/[^/]+$`);
  return permitida.test(ruta) ? ruta : null;
}

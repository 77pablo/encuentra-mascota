import { supabase } from '../lib/supabase';
import { ErrorAmigable, esMigracionSinAplicar } from '../lib/dbErrors';
import { difuminarUbicacion } from '../lib/difuminarUbicacion';

// AVISAR SIN CUENTA (migración 0050, RPC `avistar_sin_cuenta`).
//
// Quien se topa con el animal en la calle es un desconocido: no tiene la app,
// no se va a registrar, y muchas veces está tocando el botón con una mano
// mientras sostiene al perro con la otra. Este es el único camino de escritura
// que no pide sesión además del collar (`avisar_escaneo_collar`, 0027), y sigue
// su mismo criterio: la RPC no devuelve nada, no delata si el reporte existe y
// tiene rate-limit propio.

// Tope de la nota. La base recorta igual (la RPC se puede llamar con curl);
// acá se recorta antes para no mandar 40 kB por una pegada de texto.
export const TOPE_NOTA = 500;

export interface DatosAviso {
  nota?: string | null;
  // La ubicación de quien avisa, CRUDA. Se difumina en este archivo, igual que
  // en createPet/addSighting: la coordenada exacta no sale del teléfono.
  lat?: number | null;
  lng?: number | null;
}

// Mensaje para el único caso en que este flujo puede fallar de forma esperable:
// la web ya está arriba y la migración todavía no. Decir "listo, avisamos"
// cuando no se avisó nada manda a esa persona a su casa creyendo que la familia
// ya sabe — es el peor final posible de la cadena.
export const AVISO_NO_DISPONIBLE =
  'No pudimos avisar desde acá. Escribile a la familia con el botón de contacto del reporte.';

export async function avisarSinCuenta(petId: string, datos: DatosAviso = {}): Promise<void> {
  // Media coordenada no es una coordenada: con una sola, o con un NaN, el pin
  // termina en cualquier parte. Sin punto se avisa igual (la nota sola ya vale).
  const hayPunto =
    typeof datos.lat === 'number' &&
    typeof datos.lng === 'number' &&
    Number.isFinite(datos.lat) &&
    Number.isFinite(datos.lng);
  const punto = hayPunto ? difuminarUbicacion({ lat: datos.lat!, lng: datos.lng! }) : null;

  const nota = (datos.nota ?? '').trim().slice(0, TOPE_NOTA);

  const { error } = await supabase.rpc('avistar_sin_cuenta', {
    p_pet_id: petId,
    p_nota: nota.length > 0 ? nota : null,
    p_lat: punto ? punto.lat : null,
    p_lng: punto ? punto.lng : null,
  });

  if (!error) return;
  // Sin la 0050 aplicada la función no existe (PGRST202). Se traduce a algo que
  // se entienda y que ofrezca la salida que SÍ funciona; todo lo demás (red,
  // permisos) se propaga tal cual para que la pantalla lo muestre y reintente.
  if (esMigracionSinAplicar(error)) throw new ErrorAmigable(AVISO_NO_DISPONIBLE);
  throw error;
}

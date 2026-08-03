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
  // Correo OPCIONAL de quien avisa, para un único aviso de reencuentro (D1,
  // migración 0055/0061). Finalidad única (Ley 21.719): no se usa para nada
  // más y este archivo no lo loguea ni lo muestra en ningún lado.
  correo?: string | null;
}

// Mensaje del único chequeo de cliente sobre el correo: uno de forma, no de
// existencia (eso no se puede saber sin mandar el mail). Deja avisar igual
// si la persona prefiere dejarlo vacío.
export const CORREO_INVALIDO =
  'Ese correo no parece válido. Revisalo o dejalo vacío: el aviso sale igual.';

// La misma forma laxa que valida la base (0061): algo@algo.algo. La
// validación real es la del servidor; esta es solo para no mandar a la
// persona a esperar un mail que la 0061 va a descartar en silencio.
export function correoValido(correo: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) && correo.length <= 254;
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

  // Igual que la nota: se recorta/normaliza acá, pero quien de verdad decide
  // si el correo vale es la 0061 en el servidor (esto es solo UX, para no
  // hacer esperar a alguien un mail que nunca va a llegar).
  const correo = (datos.correo ?? '').trim().toLowerCase();
  if (correo && !correoValido(correo)) throw new ErrorAmigable(CORREO_INVALIDO);

  const { error } = await supabase.rpc('avistar_sin_cuenta', {
    p_pet_id: petId,
    p_nota: nota.length > 0 ? nota : null,
    p_lat: punto ? punto.lat : null,
    p_lng: punto ? punto.lng : null,
    p_correo: correo || null,
  });

  if (!error) return;
  // Sin la 0050 aplicada la función no existe (PGRST202). Se traduce a algo que
  // se entienda y que ofrezca la salida que SÍ funciona; todo lo demás (red,
  // permisos) se propaga tal cual para que la pantalla lo muestre y reintente.
  if (esMigracionSinAplicar(error)) throw new ErrorAmigable(AVISO_NO_DISPONIBLE);
  throw error;
}

// AVISAR CON FOTO (D5, sobre la Edge Function `aviso-anonimo-foto` de la 0062).
//
// Un anónimo no tiene sesión: no puede subir directo a Storage (la policy de
// INSERT del bucket privado `avisos-anonimos` es `to authenticated`). La foto
// entera viaja acá, a la Edge Function, que valida tamaño/tipo, llama a la
// misma `avistar_sin_cuenta` de arriba y recién ahí sube.
export interface DatosAvisoConFoto extends DatosAviso {
  fotoBase64: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export async function avisarConFoto(petId: string, datos: DatosAvisoConFoto): Promise<void> {
  const correo = (datos.correo ?? '').trim().toLowerCase();
  if (correo && !correoValido(correo)) throw new ErrorAmigable(CORREO_INVALIDO);

  const { error } = await supabase.functions.invoke('aviso-anonimo-foto', {
    body: {
      pet_id: petId,
      nota: (datos.nota ?? '').trim().slice(0, TOPE_NOTA),
      correo: correo || null,
      foto_base64: datos.fotoBase64,
      content_type: datos.contentType,
    },
  });

  // La Edge Function contesta SIEMPRE `{ ok: true }` con 200 salvo un error
  // real (rate-limit, datos inválidos, foto > 2 MB, 5xx): las tres 200
  // (camino feliz, descarte enmascarado por bloqueo/tope/dedupe, subida
  // fallida) devuelven EXACTAMENTE el mismo body, sin ningún campo que las
  // distinga (F2) — a propósito, para no convertir a la EF en un oráculo. Acá
  // solo se mira `error`. Hacia quien avisa, el resultado es el mismo
  // "gracias" de siempre en los tres casos.
  if (error) throw new ErrorAmigable(AVISO_NO_DISPONIBLE);
}

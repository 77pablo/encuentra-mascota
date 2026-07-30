// CORS para las Edge Functions.
//
// Por qué hace falta: el gateway de Supabase agrega cabeceras CORS a SUS
// respuestas (por ejemplo el 404 de una función que no existe), pero NO a la
// respuesta de una función desplegada. Comprobado contra el proyecto real: un
// preflight a `send-notifications` vuelve 200 sin una sola cabecera
// `access-control-*`. Sin esto, cualquier llamada desde la web (que corre en
// otro origen que la API) la bloquea el navegador antes de salir.
//
// Este archivo es a propósito PURO (no toca `Deno`): así lo puede importar el
// test de jest, que corre en Node. Cada función lee su entorno y le pasa la
// lista de orígenes.

// Orígenes de desarrollo. El puerto 8091 es el que usa `npx expo start --web`.
export const ORIGENES_DEV = [
  'http://localhost:8091',
  'http://localhost:8081',
  'http://127.0.0.1:8091',
];

// El sitio publicado. Va acá dentro, y NO solamente en una variable de entorno,
// por un error que estuvo vivo en producción y en silencio:
//
// El comodín de abajo exigía un subdominio (`abc123.` + el dominio), así que
// cubría todas las vistas previas de Cloudflare pero NO el dominio pelado del
// sitio real. Producción entraba a la lista únicamente si alguien se acordaba de
// definir `EXPO_PUBLIC_WEB_URL` en los secretos de las Edge Functions — y nadie
// lo hizo. Resultado: una vista previa inventada podía llamar a las funciones y
// el sitio de verdad no, con lo cual **borrar mi cuenta no funcionaba en
// producción** (requisito de Apple y Google, y derecho de supresión de la
// Ley 21.719), igual que el push del chat y el borrado de fotos de moderación.
//
// La regla que queda: el camino principal no puede depender de configuración
// opcional. `EXPO_PUBLIC_WEB_URL` se sigue respetando —sirve para el día que
// haya dominio propio— pero ya no es lo único que sostiene al sitio real.
export const ORIGEN_PROD = 'https://encuentras-mascota.pages.dev';

/**
 * ¿Este origen puede llamar a la función?
 *
 * Acepta los orígenes de la lista, el sitio de producción y cualquier subdominio
 * de `.pages.dev` del proyecto: Cloudflare Pages publica cada deploy en una URL
 * de vista previa distinta (`abc123.encuentras-mascota.pages.dev`), así que
 * fijar solo la URL de producción rompería las vistas previas.
 *
 * Se compara el origen COMPLETO, nunca con `includes()`: `startsWith` o
 * `includes` sobre el dominio dejarían pasar a `encuentras-mascota.pages.dev.
 * atacante.com`, que es un dominio ajeno. El subdominio es opcional pero UNO
 * SOLO: `x.y.encuentras-mascota.pages.dev` no es nuestro.
 */
export function origenPermitido(origen: string | null, permitidos: string[]): boolean {
  if (!origen) return false;
  if (permitidos.includes(origen)) return true;
  return /^https:\/\/([a-z0-9-]+\.)?encuentras-mascota\.pages\.dev$/.test(origen);
}

/**
 * Cabeceras CORS para una respuesta.
 *
 * Si el origen no está permitido devuelve el objeto sin
 * `Access-Control-Allow-Origin`: el navegador bloquea la respuesta, que es
 * justo lo que queremos. No usamos `*` porque estas funciones reciben la
 * cabecera `Authorization` con el token de sesión del usuario.
 */
export function cabecerasCors(origen: string | null, permitidos: string[]): Record<string, string> {
  if (!origenPermitido(origen, permitidos)) return {};
  return {
    'Access-Control-Allow-Origin': origen as string,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    // El origen permitido varía según quién pregunte: sin esto, una caché
    // intermedia podría servirle a un origen la respuesta de otro.
    Vary: 'Origin',
  };
}

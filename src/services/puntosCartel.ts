import { armarQueryOverpass, parsearSemaforos, PuntoCartel } from '../lib/puntosCartel';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_MS = 15000;

// Busca semáforos (proxy de esquinas de tráfico) cerca del punto del reporte,
// llamando a Overpass DESDE EL NAVEGADOR. Verificado el 6-ago: Overpass manda
// `Access-Control-Allow-Origin: *`, así que el fetch cross-origin funciona; y
// en el navegador NO se puede setear `User-Agent` (header prohibido), pero el
// navegador manda el suyo, que Overpass acepta (el 406 del seed era por el UA
// de Node, no aplica acá).
//
// LANZA ante cualquier problema (timeout, 504 —los vi—, red caída): quien
// llama lo trata como "no se pudo, mostrá el consejo genérico". Nunca deja la
// ficha rota. El timeout propio existe porque Overpass puede colgarse mucho más
// que su timeout server-side.
export async function buscarPuntosCartel(
  lat: number,
  lng: number,
  radioM: number,
  signal?: AbortSignal,
): Promise<PuntoCartel[]> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  // Si el llamador ya trae su propia señal (p. ej. la pantalla se desmontó),
  // se encadena para abortar también.
  if (signal) signal.addEventListener('abort', () => controlador.abort());
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: new URLSearchParams({ data: armarQueryOverpass(lat, lng, radioM) }),
      signal: controlador.signal,
    });
    if (!res.ok) throw new Error(`Overpass respondió ${res.status}`);
    const json = await res.json();
    return parsearSemaforos(json, { lat, lng });
  } finally {
    clearTimeout(timer);
  }
}

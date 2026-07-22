// Service worker de la PWA "Encuentra tu Mascota". CONSERVADOR a propósito:
// la app está en producción y un SW agresivo puede dejar a alguien pegado en
// una versión vieja sin darse cuenta. Reglas:
//   - Jamás intercepta un origen distinto al propio (Supabase, CDNs, etc.):
//     esas peticiones siguen su camino normal, como si no hubiera SW.
//   - Cache-first SOLO para /_expo/static/* y /icons/* (assets hasheados e
//     inmutables: si cambian de contenido, cambian de nombre de archivo).
//   - Navegaciones (HTML): network-first con fallback a la caché de '/' si
//     falla la red (offline). Así el usuario nunca ve el error nativo del
//     navegador, aunque no haya conexión.
//   - Nada de precache en install: los bundles son hasheados y se cachean al
//     vuelo la primera vez que se piden.
//   - `activate` borra cachés de versiones viejas SIEMPRE, para no acumular
//     basura ni servir contenido obsoleto por error.
//   - Sin push, sin background sync: no corresponde en esta tanda.
//
// IMPORTANTE — subir VERSION en cada cambio de este archivo (invalida las
// cachés viejas en el próximo activate de cada usuario). Los bundles de
// /_expo/static/* son hasheados (si cambian, cambian de nombre), pero se
// cachean al vuelo en cache-first; se recorta a un tope de 60 entradas
// por caché para acotar la cuota (ver cacheFirst()).
const VERSION = 'v1';
const CACHE_NAME = `emp-pwa-${VERSION}`;

self.addEventListener('install', (event) => {
  // Sin precache: nada que esperar. Se activa apenas se pueda (ver más abajo
  // por qué NO llamamos skipWaiting automático).
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith('emp-pwa-') && nombre !== CACHE_NAME)
            .map((nombre) => caches.delete(nombre)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// --- Lógica de decisión ---------------------------------------------------
// COPIA A MANO (comentario espejo) de `estrategiaPara` en
// src/lib/pwa/decisionCache.ts, que tiene los tests. sw.js corre en su propio
// scope de worker fuera del bundle de la app y no puede importar ese módulo,
// así que esta función replica la misma lógica literalmente. Si cambia una,
// cambia la otra.
function estrategiaPara(url, modo, origen) {
  const destino = new URL(url);
  if (destino.origin !== origen) return 'ignorar';
  if (destino.pathname.startsWith('/_expo/static/') || destino.pathname.startsWith('/icons/')) {
    return 'cache-first';
  }
  if (modo === 'navigate') return 'red-con-fallback';
  return 'red';
}
// --- Fin lógica de decisión ------------------------------------------------

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const enCache = await cache.match(request);
  if (enCache) return enCache;
  const resp = await fetch(request);
  // Solo guardamos respuestas OK; una 404/500 no se cachea.
  if (resp && resp.ok) {
    cache.put(request, resp.clone());
    // Recorte LRU: keys() devuelve orden de inserción en la práctica, así que
    // recortamos al principio (aproximadamente FIFO) si superamos el tope.
    // Suficiente para acotar cuota de IndexedDB sin acoplarse al pipeline de
    // build (los bundles cambian de hash en cada deploy pero VERSION no).
    const keys = await cache.keys();
    if (keys.length > 60) {
      await Promise.all(keys.slice(0, keys.length - 60).map(k => cache.delete(k)));
    }
  }
  return resp;
}

async function redConFallback(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put('/', resp.clone());
    return resp;
  } catch {
    // Sin red: primero el fallback de '/' cacheado, y si tampoco existe (nunca
    // se guardó, p. ej. primera visita offline), dejamos que el error suba tal
    // cual — no hay nada razonable que servir.
    const enCache = await cache.match('/');
    if (enCache) return enCache;
    throw new Error('offline y sin caché de "/"');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Solo GET: nunca metemos POST/PUT/DELETE en el medio (formularios, RPC,
  // subidas), aunque en teoría ya quedarían afuera por el chequeo de origen.
  if (request.method !== 'GET') return;

  const estrategia = estrategiaPara(request.url, request.mode, self.location.origin);

  if (estrategia === 'ignorar' || estrategia === 'red') return; // no interceptar, red normal

  if (estrategia === 'cache-first') {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (estrategia === 'red-con-fallback') {
    event.respondWith(redConFallback(request));
  }
});

// Lógica PURA de qué hacer con cada pedido en el service worker de la PWA
// (public/sw.js). Se extrae acá para poder testearla con jest: sw.js corre en
// su propio scope de worker (no pasa por el bundler de la app), así que NO
// puede importar este módulo — sw.js REPLICA esta misma función a mano, con
// un comentario que apunta acá. Cualquier cambio de esta lógica debe
// reflejarse a mano en public/sw.js.
export type Estrategia = 'red' | 'cache-first' | 'red-con-fallback' | 'ignorar';

// `url`: URL completa del pedido. `modo`: `request.mode` (p. ej. 'navigate'
// para una navegación de documento). `origen`: `self.location.origin` del
// service worker (el origen de la propia app).
export function estrategiaPara(url: string, modo: string, origen: string): Estrategia {
  const destino = new URL(url);

  // Nunca interceptar otro origen (Supabase, CDNs, etc.): que siga su camino
  // normal a la red, tal cual como si no hubiera service worker.
  if (destino.origin !== origen) return 'ignorar';

  // Assets hasheados e inmutables: cache-first (si ya está en caché, ni
  // siquiera se pide a la red).
  if (destino.pathname.startsWith('/_expo/static/') || destino.pathname.startsWith('/icons/')) {
    return 'cache-first';
  }

  // Navegaciones (el documento HTML): network-first con fallback a la caché
  // de '/' si la red falla (offline), para no dejar al usuario con un error
  // de navegador en vez de la app.
  if (modo === 'navigate') return 'red-con-fallback';

  // Cualquier otro pedido del propio origen (manifest, APIs propias, etc.):
  // directo a la red, sin cachear.
  return 'red';
}

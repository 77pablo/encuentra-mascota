// DEEP LINKS Y ONBOARDING — helpers puros (spec 2026-08-06).
//
// Quien llega por un link/QR (el vecino con la mascota adelante) tiene que
// ver el CONTENIDO, no el tutorial de bienvenida. RootNavigator usa esto para
// saltear el onboarding cuando la URL inicial es una ruta publica, SIN marcar
// el flag: la bienvenida queda pendiente para la proxima visita normal.

// Deriva los prefijos de ruta ('mascota', 'collar', ...) de los screens del
// linking (formato 'mascota/:id'). Del config REAL, no de una copia: ver
// src/navigation/linkingConfig.ts.
export function rutasDeLinkPublico(screens: Record<string, string>): string[] {
  return Object.values(screens)
    .map((path) => path.split('/')[0].trim())
    .filter((prefijo) => prefijo.length > 0 && !prefijo.startsWith(':'));
}

// ¿El pathname apunta a una ruta publica de link? Matchea el PRIMER segmento
// completo: '/mascota/abc' si, '/mascotas-x/abc' no, '/' no. Nunca lanza.
export function esRutaDeLinkPublico(pathname: string, rutas: string[]): boolean {
  if (typeof pathname !== 'string') return false;
  const primerSegmento = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)[0];
  if (!primerSegmento) return false;
  return rutas.includes(primerSegmento);
}

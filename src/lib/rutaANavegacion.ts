// Pulido: consumir `data.ruta` de un push (Notifications.addNotificationResponseReceivedListener,
// ver pushSetup.ts). Función PURA (sin navegación, sin red) para poder
// testearla sin un build nativo: la Función de verdad se cablea en
// pushSetup.ts, que sí depende de expo-notifications y del navigationRef.
//
// `ruta` llega tal cual del payload del push (JSON arbitrario, de ahí el
// `unknown`): cualquier cosa que no calce con un patrón conocido, o cuyo id no
// sea un UUID, degrada a `null` (no navegar) en vez de lanzar.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Nombres REALES de pantallas del stack raíz (ver RootNavigator.tsx). Ambas
// son alcanzables por link público (`adopcion/:id`, `mascota/:id`), así que
// también son el destino natural de un push con esa misma ruta.
export type DestinoRuta = { name: 'AdopcionDetail' | 'MascotaPublica'; params: { id: string } };

export function rutaANavegacion(ruta: unknown): DestinoRuta | null {
  if (typeof ruta !== 'string' || ruta.trim().length === 0) return null;

  const m = ruta.match(/^\/(adopcion|mascota)\/([^/]+)\/?$/);
  if (!m) return null;

  const [, tipo, id] = m;
  if (!UUID_RE.test(id)) return null;

  return { name: tipo === 'adopcion' ? 'AdopcionDetail' : 'MascotaPublica', params: { id } };
}

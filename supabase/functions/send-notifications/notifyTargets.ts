// ⚠️⚠️ ARCHIVO ESPEJADO — NO LO EDITES SOLO ACÁ ⚠️⚠️
//
// Este archivo es una copia de `src/lib/notifyTargets.ts` (más `distanceKm` de
// `src/lib/geo.ts`, inlineado abajo). Existe por duplicado porque el runtime de
// Deno de las Edge Functions solo empaqueta lo que está dentro de la carpeta de
// la función: no puede importar `../../../src/lib/...`.
//
// SI CAMBIÁS UNA REGLA DE TARGETING, CAMBIALA EN LOS DOS ARCHIVOS:
//   1. src/lib/notifyTargets.ts          (la app, con tests en __tests__/lib/)
//   2. supabase/functions/send-notifications/notifyTargets.ts  (este archivo)
// Los tests que cubren estas reglas viven solo en el lado de la app.

export type TipoEvento = 'reporte_nuevo' | 'avistamiento' | 'pista';

export type EventoAviso = {
  id: string;
  tipo: TipoEvento;
  petId: string;
  actorId: string | null;
  datos: { lat?: number; lng?: number; especie?: string; extracto?: string; estado_pet?: string };
};

export type Prefs = {
  userId: string;
  zona: boolean;
  avistamientos: boolean;
  pistas: boolean;
  coincidencias: boolean;
  canalEmail: boolean;
  canalPush: boolean;
};

export type ZonaAlerta = { userId: string; lat: number; lng: number; radioKm: number };

export type Contexto = {
  duenoPetId: string;
  nombrePet: string | null;
  zonas: ZonaAlerta[];
  prefs: Record<string, Prefs>;
};

export type Destinatario = { userId: string; canales: ('email' | 'push')[] };

// Copia de `distanceKm` de src/lib/geo.ts (Haversine).
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const PREFS_POR_DEFECTO: Omit<Prefs, 'userId'> = {
  zona: true,
  avistamientos: true,
  pistas: true,
  coincidencias: true,
  canalEmail: true,
  canalPush: true,
};

function prefsDe(ctx: Contexto, userId: string): Omit<Prefs, 'userId'> {
  return ctx.prefs[userId] ?? PREFS_POR_DEFECTO;
}

function quiereEsteTipo(p: Omit<Prefs, 'userId'>, tipo: TipoEvento): boolean {
  if (tipo === 'reporte_nuevo') return p.zona;
  if (tipo === 'avistamiento') return p.avistamientos;
  return p.pistas;
}

function canalesDe(p: Omit<Prefs, 'userId'>): ('email' | 'push')[] {
  const canales: ('email' | 'push')[] = [];
  if (p.canalEmail) canales.push('email');
  if (p.canalPush) canales.push('push');
  return canales;
}

export function resolverDestinatarios(evento: EventoAviso, ctx: Contexto): Destinatario[] {
  const candidatos: string[] =
    evento.tipo === 'reporte_nuevo' ? candidatosPorZona(evento, ctx) : [ctx.duenoPetId];

  const vistos = new Set<string>();
  const salida: Destinatario[] = [];

  for (const userId of candidatos) {
    if (!userId) continue;
    if (userId === evento.actorId) continue;
    if (vistos.has(userId)) continue;
    vistos.add(userId);

    const p = prefsDe(ctx, userId);
    if (!quiereEsteTipo(p, evento.tipo)) continue;

    const canales = canalesDe(p);
    if (canales.length === 0) continue;

    salida.push({ userId, canales });
  }

  return salida;
}

function candidatosPorZona(evento: EventoAviso, ctx: Contexto): string[] {
  const { lat, lng } = evento.datos;
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];
  const punto = { lat, lng };
  return ctx.zonas
    .filter((z) => distanceKm({ lat: z.lat, lng: z.lng }, punto) <= z.radioKm)
    .map((z) => z.userId);
}

export function componerAviso(
  evento: EventoAviso,
  ctx: Contexto,
): { titulo: string; cuerpo: string; ruta: string } {
  const ruta = `/mascota/${evento.petId}`;
  const nombre = ctx.nombrePet?.trim() ? ctx.nombrePet.trim() : null;
  const suya = nombre ?? 'tu mascota';

  if (evento.tipo === 'reporte_nuevo') {
    const especie =
      evento.datos.especie === 'gato'
        ? 'un gato'
        : evento.datos.especie === 'perro'
        ? 'un perro'
        : 'una mascota';
    return {
      titulo: 'Hay una mascota perdida cerca tuyo',
      cuerpo: `Alguien reportó ${especie} por tu zona. Si lo viste, cualquier dato suma.`,
      ruta,
    };
  }

  if (evento.tipo === 'avistamiento') {
    return {
      titulo: `Alguien vio a ${suya}`,
      cuerpo: 'Dejaron un avistamiento en tu reporte. Entrá a ver dónde fue.',
      ruta,
    };
  }

  const extracto = evento.datos.extracto?.trim();
  return {
    titulo: `Dejaron una pista sobre ${suya}`,
    cuerpo: extracto ? `"${extracto}"` : 'Alguien del barrio aportó un dato en tu reporte.',
    ruta,
  };
}

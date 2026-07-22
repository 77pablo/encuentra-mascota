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

export type TipoEvento =
  | 'reporte_nuevo'
  | 'avistamiento'
  | 'pista'
  | 'coincidencia'
  | 'escaneo_collar'
  | 'busqueda_guardada';

export type EventoAviso = {
  id: string;
  tipo: TipoEvento;
  petId: string;
  actorId: string | null;
  // Destinatario directo ('escaneo_collar' y 'busqueda_guardada'): el evento ya
  // trae a quién avisarle. En el resto de los tipos el destinatario se deriva
  // del reporte.
  targetUserId?: string | null;
  datos: {
    lat?: number;
    lng?: number;
    especie?: string;
    extracto?: string;
    estado_pet?: string;
    comuna?: string;
    // 'coincidencia': el reporte que calza (el "otro"). match_pet_id es a dónde
    // lleva la ruta; match_estado decide si hablamos de un perdido o un encontrado.
    match_pet_id?: string;
    match_estado?: string;
    match_especie?: string;
    // 'escaneo_collar': datos de la ficha del collar y del escaneo.
    nombre_mascota?: string;
    nota?: string;
    // 'busqueda_guardada': el reporte recién publicado que calzó con la
    // búsqueda guardada de alguien (ver enqueue_busquedas_guardadas, 0031).
    estado?: string;
    nombre?: string;
  };
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
  // userIds que SIGUEN la comuna del evento (opt-in explícito). Los computa el que
  // llama (la Edge Function), consultando notification_prefs.comunas_seguidas.
  // Solo se usan en 'reporte_nuevo'; en el resto va vacío.
  seguidoresComuna: string[];
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
  if (tipo === 'coincidencia') return p.coincidencias;
  return p.pistas;
}

function canalesDe(p: Omit<Prefs, 'userId'>): ('email' | 'push')[] {
  const canales: ('email' | 'push')[] = [];
  if (p.canalEmail) canales.push('email');
  if (p.canalPush) canales.push('push');
  return canales;
}

// Reglas (misma lógica que src/lib/notifyTargets.ts):
// - 'reporte_nuevo' va a la UNIÓN de (a) zonas de alerta que cubren el punto
//   (filtradas por la preferencia `zona`) y (b) ctx.seguidoresComuna, que como es un
//   opt-in EXPLÍCITO NO se filtra por la preferencia `zona`.
// - 'avistamiento', 'pista' y 'coincidencia' van solo al dueño del reporte de
//   referencia (ctx.duenoPetId).
// - Nunca al actor; se deduplica por userId; se respeta el filtro de canales.
export function resolverDestinatarios(evento: EventoAviso, ctx: Contexto): Destinatario[] {
  // 'escaneo_collar' y 'busqueda_guardada': destinatario único y directo =
  // evento.targetUserId, NO el dueño de un reporte. Ninguno pasa por el
  // interruptor de tipo: es opt-in explícito. Solo se respeta el filtro de canales.
  if (evento.tipo === 'escaneo_collar' || evento.tipo === 'busqueda_guardada') {
    const target = evento.targetUserId ?? null;
    if (!target || target === evento.actorId) return [];
    const canales = canalesDe(prefsDe(ctx, target));
    return canales.length === 0 ? [] : [{ userId: target, canales }];
  }

  // Los seguidores de comuna son opt-in explícito: entran sí o sí (salvo el actor y
  // los canales). Guardamos el conjunto para saltarles el filtro de preferencia `zona`.
  const seguidores = evento.tipo === 'reporte_nuevo' ? ctx.seguidoresComuna ?? [] : [];
  const optIn = new Set(seguidores);

  const candidatos: string[] =
    evento.tipo === 'reporte_nuevo'
      ? [...candidatosPorZona(evento, ctx), ...seguidores]
      : [ctx.duenoPetId];

  const vistos = new Set<string>();
  const salida: Destinatario[] = [];

  for (const userId of candidatos) {
    if (!userId) continue;
    if (userId === evento.actorId) continue;
    if (vistos.has(userId)) continue;
    vistos.add(userId);

    const p = prefsDe(ctx, userId);
    // Los seguidores de la comuna no pasan por el interruptor de tipo (`zona`).
    if (!optIn.has(userId) && !quiereEsteTipo(p, evento.tipo)) continue;

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
  const nombre = ctx.nombrePet?.trim() ? ctx.nombrePet.trim() : null;
  const suya = nombre ?? 'tu mascota';

  // 'escaneo_collar' lleva su propia ruta (la vista del dueño), no /mascota/:id
  // (puede no haber reporte). El nombre viene en datos.nombre_mascota; la nota,
  // si viene, se muestra como texto (el escape a HTML del correo lo hace
  // send-notifications/index.ts, común a todos los tipos).
  if (evento.tipo === 'escaneo_collar') {
    const nombreMascota = evento.datos.nombre_mascota?.trim() || nombre || 'tu mascota';
    const nota = evento.datos.nota?.trim();
    return {
      titulo: `Alguien escaneó la placa de ${nombreMascota}`,
      cuerpo: nota
        ? `"${nota}" · Entrá para ver dónde.`
        : `Alguien encontró a ${nombreMascota} y quiere avisarte. Entrá para ver dónde.`,
      ruta: '/mis-mascotas',
    };
  }

  // 'busqueda_guardada': aviso dirigido a quien guardó una búsqueda que calzó
  // con el reporte recién publicado.
  if (evento.tipo === 'busqueda_guardada') {
    const estadoLabel = evento.datos.estado === 'encontrada' ? 'ENCONTRADA' : 'PERDIDA';
    const especieLabel =
      evento.datos.especie === 'gato' ? 'gato' : evento.datos.especie === 'perro' ? 'perro' : 'mascota';
    const comunaTexto = evento.datos.comuna?.trim() || 'tu zona';
    const nombreReporte = evento.datos.nombre?.trim();
    return {
      titulo: 'Apareció un reporte que calza con tu búsqueda',
      cuerpo: `${estadoLabel} en ${comunaTexto} — ${especieLabel}${nombreReporte ? ` «${nombreReporte}»` : ''}`,
      ruta: `/mascota/${evento.petId}`,
    };
  }

  const ruta = `/mascota/${evento.petId}`;

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

  if (evento.tipo === 'coincidencia') {
    // La ruta lleva al OTRO reporte (el que calza), que es lo que la persona
    // quiere ver, no el suyo. match_estado es el estado del reporte que apareció:
    // si es 'encontrada' apareció un encontrado (y el de referencia es un perdido).
    const otro = evento.datos.match_estado === 'encontrada' ? 'un encontrado' : 'un perdido';
    return {
      titulo: `Apareció ${otro} que podría ser ${suya}`,
      cuerpo: 'Alguien reportó una mascota que podría ser la tuya, cerca. Entrá a verla.',
      ruta: `/mascota/${evento.datos.match_pet_id ?? evento.petId}`,
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

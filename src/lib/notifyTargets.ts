import { distanceKm } from './geo';

// Lógica de targeting de los avisos que salen de la app (correo y push).
//
// IMPORTANTE: este archivo es puro a propósito — nada de red ni de Supabase.
//
// ⚠️⚠️ ARCHIVO ESPEJADO ⚠️⚠️
// Existe una copia en `supabase/functions/send-notifications/notifyTargets.ts`,
// porque el runtime de Deno de las Edge Functions solo empaqueta lo que está
// dentro de la carpeta de la función y no puede importar desde `src/`.
// SI CAMBIÁS UNA REGLA DE TARGETING, CAMBIALA EN LOS DOS ARCHIVOS.

export type TipoEvento = 'reporte_nuevo' | 'avistamiento' | 'pista' | 'escaneo_collar';

export type EventoAviso = {
  id: string;
  tipo: TipoEvento;
  petId: string;
  actorId: string | null;
  // Destinatario directo (solo 'escaneo_collar'): el dueño de la ficha del
  // collar. En el resto de los tipos el destinatario se deriva del reporte.
  targetUserId?: string | null;
  datos: {
    lat?: number; lng?: number; especie?: string; extracto?: string;
    estado_pet?: string; comuna?: string; nombre_mascota?: string; nota?: string;
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
  duenoPetId: string; // user_id del dueño del reporte del evento
  nombrePet: string | null; // para el texto ("Alguien vio a Pelusa")
  zonas: ZonaAlerta[]; // todas las zonas activas (solo se usan en 'reporte_nuevo')
  prefs: Record<string, Prefs>; // por userId; si falta, se asumen los valores por defecto
  // userIds que SIGUEN la comuna del evento (opt-in explícito). Los computa el que
  // llama (la Edge Function), consultando notification_prefs.comunas_seguidas.
  // Solo se usan en 'reporte_nuevo'; en el resto va vacío.
  seguidoresComuna: string[];
};

export type Destinatario = { userId: string; canales: ('email' | 'push')[] };

// Quien nunca tocó la pantalla de Avisos recibe todo: es el default más útil
// para una mascota perdida, y siempre puede apagar lo que le moleste.
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

// Interruptor de tipo que le corresponde a cada evento.
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

// Devuelve a quién hay que avisarle y por qué canales. Reglas:
// - 'reporte_nuevo' va a la UNIÓN de dos caminos:
//     (a) las zonas de alerta que cubren el punto del reporte (filtradas por la
//         preferencia `zona` del usuario, como siempre), y
//     (b) quienes siguen la comuna del reporte (ctx.seguidoresComuna): como es un
//         opt-in EXPLÍCITO, a estos NO se los filtra por la preferencia `zona`.
// - 'avistamiento' y 'pista' van solo al dueño del reporte.
// - Nunca se le avisa al actor de su propio evento.
// - Se deduplica por userId (una persona, un aviso): quien está en los dos caminos
//   recibe uno solo.
// - En todos los casos se respeta el filtro de canales (email/push).
export function resolverDestinatarios(evento: EventoAviso, ctx: Contexto): Destinatario[] {
  // 'escaneo_collar': destinatario único y directo = el dueño de la ficha
  // (evento.targetUserId), NO el dueño de un reporte (puede no haber reporte
  // activo). No pasa por ningún interruptor de tipo: el dueño puso la placa
  // justamente para esto (alta prioridad). Solo se respeta el filtro de canales.
  if (evento.tipo === 'escaneo_collar') {
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
    if (userId === evento.actorId) continue; // no me aviso a mí mismo
    if (vistos.has(userId)) continue;
    vistos.add(userId);

    const p = prefsDe(ctx, userId);
    // Los seguidores de la comuna no pasan por el interruptor de tipo (`zona`):
    // ya dijeron que sí explícitamente al seguir la comuna.
    if (!optIn.has(userId) && !quiereEsteTipo(p, evento.tipo)) continue;

    const canales = canalesDe(p);
    if (canales.length === 0) continue; // apagó los dos canales: no hay por dónde

    salida.push({ userId, canales });
  }

  return salida;
}

// Zonas cuyo centro está a menos del radio del punto del reporte. Si el evento
// vino sin coordenadas no hay nada que comparar: devolvemos vacío en vez de
// reventar (la cola no debe trabarse por un dato incompleto).
function candidatosPorZona(evento: EventoAviso, ctx: Contexto): string[] {
  const { lat, lng } = evento.datos;
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];
  const punto = { lat, lng };
  return ctx.zonas
    .filter((z) => distanceKm({ lat: z.lat, lng: z.lng }, punto) <= z.radioKm)
    .map((z) => z.userId);
}

// Texto del aviso, cálido y en el tono de la app: nada de correo de sistema.
// `ruta` es relativa; quien envía le antepone EXPO_PUBLIC_WEB_URL.
export function componerAviso(
  evento: EventoAviso,
  ctx: Contexto,
): { titulo: string; cuerpo: string; ruta: string } {
  const nombre = ctx.nombrePet?.trim() ? ctx.nombrePet.trim() : null;
  // Sin nombre hablamos de "tu mascota" / "una mascota": nunca mostramos un hueco.
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

  const ruta = `/mascota/${evento.petId}`;

  if (evento.tipo === 'reporte_nuevo') {
    const especie = evento.datos.especie === 'gato' ? 'un gato' : evento.datos.especie === 'perro' ? 'un perro' : 'una mascota';
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

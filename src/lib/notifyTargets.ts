import { distanceKm } from './geo';

// Lógica de targeting de los avisos que salen de la app (correo y push).
//
// IMPORTANTE: este archivo es puro a propósito — nada de red ni de Supabase.
// Lo importan la app y la Edge Function `send-notifications`, que es la única
// que decide a quién le llega cada aviso. Si cambia una regla acá, cambia para
// los dos lados.

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
  duenoPetId: string; // user_id del dueño del reporte del evento
  nombrePet: string | null; // para el texto ("Alguien vio a Pelusa")
  zonas: ZonaAlerta[]; // todas las zonas activas (solo se usan en 'reporte_nuevo')
  prefs: Record<string, Prefs>; // por userId; si falta, se asumen los valores por defecto
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
// - 'reporte_nuevo' va a las zonas de alerta que cubren el punto del reporte.
// - 'avistamiento' y 'pista' van solo al dueño del reporte.
// - Nunca se le avisa al actor de su propio evento.
// - Se deduplica por userId (una persona, un aviso).
export function resolverDestinatarios(evento: EventoAviso, ctx: Contexto): Destinatario[] {
  const candidatos: string[] =
    evento.tipo === 'reporte_nuevo' ? candidatosPorZona(evento, ctx) : [ctx.duenoPetId];

  const vistos = new Set<string>();
  const salida: Destinatario[] = [];

  for (const userId of candidatos) {
    if (!userId) continue;
    if (userId === evento.actorId) continue; // no me aviso a mí mismo
    if (vistos.has(userId)) continue;
    vistos.add(userId);

    const p = prefsDe(ctx, userId);
    if (!quiereEsteTipo(p, evento.tipo)) continue;

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
  const ruta = `/mascota/${evento.petId}`;
  const nombre = ctx.nombrePet?.trim() ? ctx.nombrePet.trim() : null;
  // Sin nombre hablamos de "tu mascota" / "una mascota": nunca mostramos un hueco.
  const suya = nombre ?? 'tu mascota';

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

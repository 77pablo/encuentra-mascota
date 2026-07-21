import { supabase } from '../lib/supabase';
import { nombreDeAutor } from '../lib/cuentaEliminada';

export interface Message {
  id: string;
  // Nullable desde la 0017: si el reporte se borro (borrando la cuenta o el
  // reporte suelto), el mensaje sobrevive con `pet_id = null` en vez de
  // desaparecer con el.
  pet_id: string | null;
  from_user: string;
  to_user: string;
  texto: string;
  leido: boolean;
  creado_en: string;
}

export async function countUnread(me: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('to_user', me)
    .eq('leido', false);
  if (error) throw error;
  return count ?? 0;
}

export async function markThreadRead(petId: string | null, me: string, other: string): Promise<void> {
  // `.eq('pet_id', null)` genera `pet_id=eq.null`, que en PostgREST no matchea
  // filas con NULL (hay que pedirlo con `.is`). Sin esta rama, un hilo cuyo
  // reporte se borro (0017) nunca se marcaria como leido.
  let query = supabase
    .from('messages')
    .update({ leido: true })
    .eq('to_user', me)
    .eq('from_user', other)
    .eq('leido', false);
  query = petId === null ? query.is('pet_id', null) : query.eq('pet_id', petId);
  const { error } = await query;
  if (error) throw error;
}

export async function sendMessage(petId: string | null, fromUser: string, toUser: string, texto: string) {
  const clean = texto.trim();
  if (!clean) throw new Error('Mensaje vacío');
  const { error } = await supabase.from('messages').insert({
    pet_id: petId, from_user: fromUser, to_user: toUser, texto: clean,
  });
  if (error) throw error;
}

export async function listMessages(petId: string | null, me: string, other: string): Promise<Message[]> {
  // Mismo motivo que en markThreadRead: con el reporte borrado, `pet_id` es
  // NULL y hay que pedirlo con `.is`, no con `.eq`.
  let query = supabase
    .from('messages')
    .select('*')
    .or(`and(from_user.eq.${me},to_user.eq.${other}),and(from_user.eq.${other},to_user.eq.${me})`)
    .order('creado_en', { ascending: true });
  query = petId === null ? query.is('pet_id', null) : query.eq('pet_id', petId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Message[];
}

export type ConversationKey = {
  // Nullable: el reporte que originó la conversación puede haberse borrado
  // (borrado de cuenta o borrado suelto del reporte) sin que el hilo muera.
  petId: string | null;
  otherUser: string;
  lastTexto: string;
  lastAt: string;
};

export type Conversation = ConversationKey & {
  otherNombre: string;
  /** True si la otra parte borró su cuenta: no se le puede escribir. */
  otherEliminado: boolean;
  petLabel: string;
};

// Pliega una página de mensajes (ordenados de más nuevo a más viejo) DENTRO de
// un mapa acumulador. "El primero visto gana", por eso el orden desc importa: el
// primer mensaje que se ve de cada hilo es el más nuevo, y ese es el que queda
// como `lastTexto`/`lastAt`. Se separó de `foldConversations` para poder plegar
// página por página en `listConversations` sin tener que juntar TODOS los
// mensajes en memoria antes de agrupar.
function foldPageInto(threads: Map<string, ConversationKey>, msgs: Message[], me: string): void {
  for (const m of msgs) {
    const otherUser = m.from_user === me ? m.to_user : m.from_user;
    // `pet_id` nulo (reporte borrado, 0017) da la clave `null:<otro>`: todos los
    // hilos con reporte borrado de una misma persona se funden en uno, a
    // propósito.
    const key = `${m.pet_id}:${otherUser}`;
    if (!threads.has(key)) {
      threads.set(key, { petId: m.pet_id, otherUser, lastTexto: m.texto, lastAt: m.creado_en });
    }
  }
}

// Pura: asume msgs ordenados de más nuevo a más viejo. Un hilo por (petId, otro usuario).
export function foldConversations(msgs: Message[], me: string): ConversationKey[] {
  const threads = new Map<string, ConversationKey>();
  foldPageInto(threads, msgs, me);
  return [...threads.values()];
}

// Tamaño de página al barrer la historia de mensajes. Se pagina a propósito y
// NO se usa un `.limit(500)`: ese atajo corta por recencia de MENSAJE, no de
// CONVERSACIÓN, así que una conversación vieja pero viva (mucho tráfico de otros
// hilos por encima) desaparecería de la lista SIN ningún error —exactamente la
// clase de pérdida silenciosa que ya se coló tres veces en este proyecto—. Y
// tampoco se deja la consulta sin cota: una consulta sin `.range()` depende del
// tope de filas del servidor (PostgREST), que si algún día se configura truncaría
// la historia en silencio y volvería a esconder hilos. Paginando y plegando cada
// página se ven TODOS los mensajes, así que ningún hilo se pierde, sin tener que
// traerlos todos juntos a memoria de una vez.
//
// El agrupado real (una sola consulta con `distinct on` en el servidor) está
// diseñado en el spec de la Tanda D como paso siguiente; requiere una RPC y su
// migración. Mientras no exista, esto es correcto: no pierde hilos.
const PAGINA_MENSAJES = 1000;

export async function listConversations(me: string): Promise<Conversation[]> {
  const threads = new Map<string, ConversationKey>();
  // Barremos la historia por páginas y plegamos cada una. Se ordena además por
  // `id` para desempatar `creado_en` repetidos: sin ese segundo criterio, dos
  // mensajes con el mismo instante podrían caer en distinta página de forma no
  // determinista y saltearse en el borde (el mismo bug del cursor de distancia
  // que salteaba filas).
  for (let desde = 0; ; desde += PAGINA_MENSAJES) {
    const { data, error } = await supabase
      .from('messages')
      // Solo las columnas que necesita el agrupado y el enriquecido: sin `id`
      // ni `leido`, que la lista de conversaciones no usa.
      .select('pet_id, from_user, to_user, texto, creado_en')
      .or(`from_user.eq.${me},to_user.eq.${me}`)
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + PAGINA_MENSAJES - 1);
    if (error) throw error;
    const pagina = (data ?? []) as Message[];
    foldPageInto(threads, pagina, me);
    // Página incompleta = era la última. Es lo que corta el bucle.
    if (pagina.length < PAGINA_MENSAJES) break;
  }
  const base = [...threads.values()];
  if (base.length === 0) return [];

  const userIds = [...new Set(base.map((t) => t.otherUser))];
  // Sin el filtro, un hilo con reporte borrado (petId null) mete `null` en el
  // `.in(...)` de la consulta a `pets`, que no tiene filas con id nulo: solo
  // ensucia la query sin aportar nada.
  const petIds = [...new Set(base.map((t) => t.petId).filter((id): id is string => id !== null))];
  const consultaPerfiles = (select: string) =>
    supabase.from('profiles').select(select).in('id', userIds);

  // Si TODOS los hilos son de reportes borrados no hay nada que pedirle a
  // `pets`: `.in('id', [])` no aporta nada y evitarlo ahorra un viaje de red.
  const consultaPets = petIds.length > 0
    ? supabase.from('pets').select('id, estado, especie').in('id', petIds)
    : Promise.resolve({ data: [] as any[], error: null });

  const [profsIntento, petsRes] = await Promise.all([
    consultaPerfiles('id, nombre, eliminado_en'),
    consultaPets,
  ]);
  let profsRes = profsIntento;
  if (profsRes.error) {
    // La consulta con `eliminado_en` fallo (probablemente porque la migracion
    // 0017 todavia no esta aplicada). PostgREST no devuelve datos parciales:
    // si no reintentamos sin esa columna, `data` llega null y TODOS los
    // usuarios pierden su nombre real (no solo las cuentas borradas), aunque
    // esten vivos. Reintentamos pidiendo solo `nombre` para mantener el
    // comportamiento de siempre hasta que la migracion se aplique. Cuando
    // lleve tiempo aplicada, este escalon queda muerto y se puede sacar.
    profsRes = await consultaPerfiles('id, nombre');
  }
  const perfilById = new Map<string, { nombre: string | null; eliminadoEn: string | null }>(
    (profsRes.data ?? []).map((p: any) => [p.id, { nombre: p.nombre, eliminadoEn: p.eliminado_en ?? null }]),
  );
  const petById = new Map<string, string>(
    (petsRes.data ?? []).map((p: any) => [p.id, `${p.estado} · ${p.especie}`]),
  );

  return base.map((t) => {
    const perfil = perfilById.get(t.otherUser) ?? { nombre: null, eliminadoEn: null };
    return {
      ...t,
      otherNombre: nombreDeAutor(perfil.nombre, perfil.eliminadoEn),
      otherEliminado: perfil.eliminadoEn !== null,
      // `petId === null` es el caso de la 0017 (reporte borrado de verdad, ver
      // messages_pet_id_fkey): decirlo tal cual es mas honesto que 'Mascota',
      // que sugeriria que el reporte todavia existe en algun lado.
      petLabel: t.petId === null ? 'Reporte eliminado' : (petById.get(t.petId) ?? 'Mascota'),
    };
  });
}

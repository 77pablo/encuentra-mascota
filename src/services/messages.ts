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

// Pura: asume msgs ordenados de más nuevo a más viejo. Un hilo por (petId, otro usuario).
export function foldConversations(msgs: Message[], me: string): ConversationKey[] {
  const threads = new Map<string, ConversationKey>();
  for (const m of msgs) {
    const otherUser = m.from_user === me ? m.to_user : m.from_user;
    const key = `${m.pet_id}:${otherUser}`;
    if (!threads.has(key)) {
      threads.set(key, { petId: m.pet_id, otherUser, lastTexto: m.texto, lastAt: m.creado_en });
    }
  }
  return [...threads.values()];
}

export async function listConversations(me: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`from_user.eq.${me},to_user.eq.${me}`)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  const base = foldConversations((data ?? []) as Message[], me);
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

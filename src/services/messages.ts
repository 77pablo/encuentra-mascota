import { supabase } from '../lib/supabase';

export interface Message {
  id: string;
  pet_id: string;
  from_user: string;
  to_user: string;
  texto: string;
  leido: boolean;
  creado_en: string;
}

export async function sendMessage(petId: string, fromUser: string, toUser: string, texto: string) {
  const clean = texto.trim();
  if (!clean) throw new Error('Mensaje vacío');
  const { error } = await supabase.from('messages').insert({
    pet_id: petId, from_user: fromUser, to_user: toUser, texto: clean,
  });
  if (error) throw error;
}

export async function listMessages(petId: string, me: string, other: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('pet_id', petId)
    .or(`and(from_user.eq.${me},to_user.eq.${other}),and(from_user.eq.${other},to_user.eq.${me})`)
    .order('creado_en', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export type ConversationKey = {
  petId: string;
  otherUser: string;
  lastTexto: string;
  lastAt: string;
};

export type Conversation = ConversationKey & {
  otherNombre: string;
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
  const petIds = [...new Set(base.map((t) => t.petId))];
  const [profsRes, petsRes] = await Promise.all([
    supabase.from('profiles').select('id, nombre').in('id', userIds),
    supabase.from('pets').select('id, estado, especie').in('id', petIds),
  ]);
  const nombreById = new Map<string, string>((profsRes.data ?? []).map((p: any) => [p.id, p.nombre]));
  const petById = new Map<string, string>(
    (petsRes.data ?? []).map((p: any) => [p.id, `${p.estado} · ${p.especie}`]),
  );

  return base.map((t) => ({
    ...t,
    otherNombre: nombreById.get(t.otherUser) ?? 'Usuario',
    petLabel: petById.get(t.petId) ?? 'Mascota',
  }));
}

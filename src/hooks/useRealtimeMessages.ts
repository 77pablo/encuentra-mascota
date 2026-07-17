import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listMessages, Message } from '../services/messages';

export function useRealtimeMessages(petId: string, me: string, other: string): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let active = true;
    listMessages(petId, me, other).then((m) => active && setMessages(m));

    const channel = supabase
      .channel(`chat-${petId}-${me}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `pet_id=eq.${petId}` },
        (payload) => {
          const msg = payload.new as Message;
          const entreNosotros =
            (msg.from_user === me && msg.to_user === other) ||
            (msg.from_user === other && msg.to_user === me);
          if (entreNosotros) setMessages((prev) => [...prev, msg]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [petId, me, other]);

  return messages;
}

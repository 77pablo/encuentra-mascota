import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listMessages, Message } from '../services/messages';

export function useRealtimeMessages(petId: string | null, me: string, other: string): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let active = true;
    listMessages(petId, me, other)
      .then((m) => {
        if (active) setMessages(m);
      })
      .catch((e) => console.error('No se pudieron cargar los mensajes:', e));

    // Con el reporte borrado, `pet_id` es NULL: un filtro `pet_id=eq.${petId}`
    // se convertiria en `pet_id=eq.null`, que Postgres no matchea nunca contra
    // NULL. Ahi filtramos por `is.null` para seguir recibiendo en vivo los
    // mensajes de un hilo sin reporte.
    const filtroPetId = petId === null ? 'pet_id=is.null' : `pet_id=eq.${petId}`;
    const channel = supabase
      .channel(`chat-${petId ?? 'sin-reporte'}-${me}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: filtroPetId },
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

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { HiloCtx, listMessages, mensajePerteneceAlHilo, Message } from '../services/messages';

export function useRealtimeMessages(ctx: HiloCtx, me: string, other: string): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);

  // Clave estable del hilo para las dependencias del efecto: `ctx` es un objeto
  // nuevo en cada render, asi que no sirve como dependencia directa (relanzaria
  // la suscripcion en cada render). La clave resume el contexto en un string.
  const claveCtx =
    ctx.tipo === 'pet' ? `p:${ctx.id}` : ctx.tipo === 'adopcion' ? `a:${ctx.id}` : 'del';

  useEffect(() => {
    let active = true;
    listMessages(ctx, me, other)
      .then((m) => {
        if (active) setMessages(m);
      })
      .catch((e) => console.error('No se pudieron cargar los mensajes:', e));

    // El filtro del servidor solo admite UNA condicion. Para un reporte borrado
    // se escucha `pet_id=is.null`, que tambien entregaria mensajes de adopcion
    // (tienen pet_id null); por eso ademas del filtro grueso se valida con
    // `mensajePerteneceAlHilo` del lado del cliente. Para reporte/adopcion el
    // filtro por su id ya es exacto.
    const filtroRealtime =
      ctx.tipo === 'pet'
        ? `pet_id=eq.${ctx.id}`
        : ctx.tipo === 'adopcion'
          ? `adoption_id=eq.${ctx.id}`
          : 'pet_id=is.null';
    const channel = supabase
      .channel(`chat-${claveCtx}-${me}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: filtroRealtime },
        (payload) => {
          const msg = payload.new as Message;
          const entreNosotros =
            (msg.from_user === me && msg.to_user === other) ||
            (msg.from_user === other && msg.to_user === me);
          // `mensajePerteneceAlHilo` cierra la grieta del filtro grueso de
          // `pet_borrado`: sin el, un mensaje de adopcion se colaria en el hilo
          // del reporte borrado (la trampa del contexto no explicito).
          if (entreNosotros && mensajePerteneceAlHilo(msg, ctx)) {
            setMessages((prev) => [...prev, msg]);
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveCtx, me, other]);

  return messages;
}

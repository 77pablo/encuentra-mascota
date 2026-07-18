import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { countUnread } from '../services/messages';
import { useAuth } from './useAuth';

interface UnreadState {
  count: number;
  refresh: () => void;
}

const UnreadContext = createContext<UnreadState | undefined>(undefined);

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!user) {
      setCount(0);
      return;
    }
    countUnread(user.id)
      .then((c) => setCount(c))
      .catch((e) => console.error('No se pudo obtener el conteo de mensajes sin leer:', e));
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`unread-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_user=eq.${user.id}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `to_user=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  return <UnreadContext.Provider value={{ count, refresh }}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadState {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error('useUnread debe usarse dentro de <UnreadProvider>');
  return ctx;
}

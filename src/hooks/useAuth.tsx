import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerPushToken } from '../services/pushTokens';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  recovering: boolean;
  clearRecovering: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  // Registrar el token de push no debe tumbar la sesión si falla, pero tampoco
  // puede fallar MUDO: un `.catch(() => {})` acá fue lo que dejó a `send-push`
  // semanas sin desplegar sin que nadie se enterara. Se traga el error para no
  // romper el arranque, y lo deja escrito.
  const registrarPush = (userId: string) => {
    registerPushToken(userId).catch((e) => {
      console.error('No se pudo registrar el token de push:', e?.message ?? e);
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        registrarPush(data.session.user.id);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
      }
      if (s?.user) {
        registrarPush(s.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const clearRecovering = () => setRecovering(false);

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, loading, recovering, clearRecovering, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

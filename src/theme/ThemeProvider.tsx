import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Colors, darkColors, lightColors } from './index';
import { getTemaPref, setTemaPref, ModoTema } from '../lib/temaPref';

export type Esquema = 'light' | 'dark';

// Pura: dado el modo elegido y el esquema del sistema, resuelve el esquema
// efectivo. 'auto' sigue al sistema (y cae a 'light' si el sistema no informa).
export function resolverEsquema(modo: ModoTema, sistema: Esquema | null | undefined): Esquema {
  if (modo === 'claro') return 'light';
  if (modo === 'oscuro') return 'dark';
  return sistema === 'dark' ? 'dark' : 'light';
}

type TemaCtx = {
  colors: Colors;
  esquema: Esquema;
  modo: ModoTema;
  setModo: (m: ModoTema) => void;
};

const Ctx = createContext<TemaCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sistema = useColorScheme(); // 'light' | 'dark' | null
  const [modo, setModoState] = useState<ModoTema>('auto');

  useEffect(() => {
    getTemaPref().then(setModoState);
  }, []);

  const setModo = useCallback((m: ModoTema) => {
    setModoState(m);
    setTemaPref(m); // persiste sin bloquear el cambio en vivo
  }, []);

  const esquema = resolverEsquema(modo, sistema as Esquema | null);
  const colors = esquema === 'dark' ? darkColors : lightColors;

  const value = useMemo<TemaCtx>(() => ({ colors, esquema, modo, setModo }), [colors, esquema, modo, setModo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useTema(): TemaCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useColors/useTheme deben usarse dentro de <ThemeProvider>');
  return ctx;
}

// Hook de conveniencia: la mayoría de los componentes solo necesita los colores.
export function useColors(): Colors {
  return useTema().colors;
}

// Hook completo: para el selector de apariencia y la navegación/StatusBar.
export function useTheme(): TemaCtx {
  return useTema();
}

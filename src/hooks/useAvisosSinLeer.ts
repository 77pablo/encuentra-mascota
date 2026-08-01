import { useCallback, useEffect, useRef, useState } from 'react';
import { contarSinLeer } from '../lib/avisosBandeja';
import { ultimaVisitaAvisos } from '../lib/visitaAvisos';
import { misAvisos } from '../services/avisos';
import { useAuth } from './useAuth';

// EL CONTADOR DEL BADGE DE AVISOS.
//
// Compara los avisos que devuelve `mis_avisos()` contra una marca de "última
// visita" guardada LOCAL (src/lib/visitaAvisos.ts): sin columna nueva y sin
// migración extra para el badge.
//
// 🔴 ESTE HOOK NO PUEDE TIRAR NUNCA. Lo monta `ProfileScreen`, y el Perfil es la
// pantalla donde vive medio producto. Con la migración 0051 sin aplicar, la RPC
// no existe (PGRST202) y el badge tiene que quedarse en 0 sin llevarse por
// delante nada más. Por eso el `try/catch` envuelve TAMBIÉN la llamada
// sincrónica: si `supabase.rpc` reventara antes de devolver una promesa, un
// `.catch()` solo no lo agarraría.

export interface AvisosSinLeer {
  sinLeer: number;
  recargar: () => void;
}

export function useAvisosSinLeer(): AvisosSinLeer {
  const { user } = useAuth();
  const [sinLeer, setSinLeer] = useState(0);
  // Sin esto, una respuesta que llega después de desmontar hace `setState` sobre
  // un componente que ya no está.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const recargar = useCallback(() => {
    if (!user) {
      setSinLeer(0);
      return;
    }
    const correr = async () => {
      const [avisos, visita] = await Promise.all([misAvisos(), ultimaVisitaAvisos()]);
      if (vivo.current) setSinLeer(contarSinLeer(avisos, visita));
    };
    try {
      correr().catch((e: any) => {
        // Sin migración es lo esperado y no hace falta gritarlo, pero tampoco se
        // calla del todo: un badge que no cuenta nunca es un síntoma.
        console.warn('No se pudo contar los avisos sin leer:', e?.message ?? e);
        if (vivo.current) setSinLeer(0);
      });
    } catch (e: any) {
      console.warn('No se pudo contar los avisos sin leer:', e?.message ?? e);
      if (vivo.current) setSinLeer(0);
    }
  }, [user]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { sinLeer, recargar };
}

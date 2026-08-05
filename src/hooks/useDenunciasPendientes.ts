import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { bandeja } from '../services/moderacionAdmin';

export interface DenunciasPendientes {
  cantidad: number;
  recargar: () => Promise<void>;
}

// Cuenta lo pendiente de moderación para el badge de la fila "Moderación" del
// Perfil (tarea C3, tanda 13). Solo pregunta si sos admin —la RPC lanza "no
// autorizado" para el resto, así que ni vale la pena llamarla— y nunca rompe
// la pantalla: sin red o sin permiso, el contador queda en cero y listo.
export function useDenunciasPendientes(esAdmin: boolean): DenunciasPendientes {
  const [cantidad, setCantidad] = useState(0);
  // Sin esto, una respuesta que llega después de desmontar hace `setState`
  // sobre un componente que ya no está (mismo patrón que useAvisosSinLeer).
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const recargar = useCallback(async () => {
    if (!esAdmin) {
      if (vivo.current) setCantidad(0);
      return;
    }
    try {
      const filas = await bandeja();
      if (vivo.current) setCantidad(filas.length);
    } catch (e: any) {
      // No es un `.catch` mudo: queda escrito en consola por qué el badge
      // se quedó en cero (ver __tests__/lib/sinCatchMudos.test.ts). Nunca se
      // relanza: es un contador de fondo, no algo que deba tumbar el Perfil
      // si la red falla o la migración 0060 todavía no está. Y SIEMPRE
      // resetea a 0: un error deja un valor viejo pegado, mostrando
      // denuncias que quizá ya no existen (deuda tanda 13, D2 · Step 3).
      console.warn('No se pudo contar las denuncias pendientes:', e?.message ?? e);
      if (vivo.current) setCantidad(0);
    }
  }, [esAdmin]);

  useFocusEffect(
    useCallback(() => {
      recargar();
      return undefined;
    }, [recargar]),
  );

  return { cantidad, recargar };
}

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { bandeja } from '../services/moderacionAdmin';

// Cuenta lo pendiente de moderación para el badge de la fila "Moderación" del
// Perfil (tarea C3, tanda 13). Solo pregunta si sos admin —la RPC lanza "no
// autorizado" para el resto, así que ni vale la pena llamarla— y nunca rompe
// la pantalla: sin red o sin permiso, el contador queda en cero y listo.
export function useDenunciasPendientes(esAdmin: boolean): number {
  const [pendientes, setPendientes] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      if (!esAdmin) {
        setPendientes(0);
        return undefined;
      }
      bandeja()
        .then((filas) => {
          if (vivo) setPendientes(filas.length);
        })
        .catch((e: any) => {
          // No es un `.catch` mudo: queda escrito en consola por qué el badge
          // se quedó en cero (ver __tests__/lib/sinCatchMudos.test.ts). Nunca
          // se relanza: es un contador de fondo, no algo que deba tumbar el
          // Perfil si la red falla o la migración 0060 todavía no está.
          console.warn('No se pudo contar las denuncias pendientes:', e?.message ?? e);
        });
      return () => {
        vivo = false;
      };
    }, [esAdmin]),
  );
  return pendientes;
}

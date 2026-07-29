import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pet } from '../services/pets';
import { AlertZone, getMyZone } from '../services/alertZones';
import { countNewPetsInZone } from '../lib/alerts';
import { getLastVisit, markVisitedNow } from '../lib/lastVisit';
import { useAuth } from './useAuth';

export interface ZoneAlertResult {
  count: number; // reportes nuevos en la zona desde la última visita
  dismiss: () => void; // ocultar y marcar visto (reinicia el conteo)
}

// Calcula, para el banner in-app, cuántos reportes nuevos hay dentro de la zona
// de alerta del usuario desde su última visita. Degrada sin ruido: si no hay
// sesión, ni zona, o algo falla, `count` queda en 0 y no se muestra nada.
export function useZoneAlert(pets: Pet[]): ZoneAlertResult {
  const { user } = useAuth();
  const [zone, setZone] = useState<AlertZone | null>(null);
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (!user) {
      setZone(null);
      setReady(false);
      return;
    }
    Promise.all([getMyZone(user.id).catch(() => null), getLastVisit()])
      .then(async ([z, visited]) => {
        if (cancel) return;
        setZone(z);
        // Primera vez en este dispositivo: marcamos "ahora" para no avisar de
        // todo el histórico de golpe. A partir de aquí, solo lo que llegue nuevo.
        if (!visited) {
          const now = await markVisitedNow();
          if (!cancel) setLastVisit(now);
        } else {
          setLastVisit(visited);
        }
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, [user]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    markVisitedNow()
      .then((now) => setLastVisit(now))
      .catch((e) => {
        // El banner ya se ocultó en esta sesión (`setDismissed`), así que la
        // persona no ve nada raro ahora; lo que falla es RECORDARLO, y el
        // aviso vuelve en la próxima visita. Sin este log, "el banner me
        // aparece siempre" no tendría dónde diagnosticarse.
        console.warn('No se pudo recordar que descartaste el aviso de zona:', e?.message ?? e);
      });
  }, []);

  // Memoizado: recalcular el Haversine sobre toda la lista solo cuando cambian
  // los reportes, la zona o la última visita (no en cada render de Inicio).
  const count = useMemo(
    () => (ready && !dismissed ? countNewPetsInZone(pets, zone, lastVisit ?? undefined) : 0),
    [ready, dismissed, pets, zone, lastVisit],
  );

  return { count, dismiss };
}

import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { LatLng } from '../lib/geo';

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied';

export interface UseMyLocationResult {
  coords: LatLng | null;
  status: LocationStatus;
  request: () => Promise<void>;
}

// Pide permiso de ubicación (foreground) y devuelve la posición actual.
// Nunca lanza: si el usuario niega el permiso o algo falla, deja
// status en 'denied' y coords en null para que la pantalla haga fallback.
export function useMyLocation(auto = false): UseMyLocationResult {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  const request = useCallback(async () => {
    setStatus('loading');
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== 'granted') {
        setStatus('denied');
        setCoords(null);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      setStatus('granted');
    } catch {
      setStatus('denied');
      setCoords(null);
    }
  }, []);

  useEffect(() => {
    if (auto) {
      request().catch(() => {
        setStatus('denied');
        setCoords(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return { coords, status, request };
}

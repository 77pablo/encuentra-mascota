import { Pet } from '../services/pets';
import { AlertZone } from '../services/alertZones';
import { distanceKm } from './geo';

export interface PetInZone {
  pet: Pet;
  distanceKm: number;
}

// Devuelve los reportes que caen dentro del radio de la zona, ordenados de más
// cerca a más lejos del centro. Si se pasa `sinceISO`, solo incluye los creados
// estrictamente después de esa fecha (para calcular "nuevos desde tu última
// visita"). Lógica pura (sin red) para poder testearla y reutilizarla.
//
// Si la zona es null o no tiene centro fijado, no hay nada que comparar y
// devuelve []. No mira `zone.activo` a propósito: eso lo decide quien la llama
// (así el mismo cálculo sirve para vistas previas aunque la zona esté en pausa).
export function petsInZone(
  pets: Pet[],
  zone: AlertZone | null | undefined,
  sinceISO?: string,
): PetInZone[] {
  if (!zone || zone.lat === null || zone.lng === null) return [];
  const center = { lat: zone.lat, lng: zone.lng };
  const since = sinceISO ? new Date(sinceISO).getTime() : null;

  return pets
    .filter((p) => {
      if (since === null) return true;
      const t = new Date(p.creado_en).getTime();
      return Number.isFinite(t) && t > since;
    })
    .map((p) => ({
      pet: p,
      distanceKm: distanceKm(center, { lat: p.lat, lng: p.lng }),
    }))
    .filter((m) => m.distanceKm <= zone.radio_km)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// Cuenta cuántos reportes nuevos hay en la zona desde `sinceISO`. Respeta el
// interruptor: si la zona está en pausa (activo=false), no hay avisos → 0.
export function countNewPetsInZone(
  pets: Pet[],
  zone: AlertZone | null | undefined,
  sinceISO?: string,
): number {
  if (!zone || !zone.activo) return 0;
  return petsInZone(pets, zone, sinceISO).length;
}

// Texto amable para el banner in-app. Devuelve null cuando no hay nada que
// mostrar, así la pantalla simplemente no renderiza el aviso.
export function zoneAlertMessage(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return '1 reporte nuevo cerca de tu zona';
  return `${count} reportes nuevos cerca de tu zona`;
}

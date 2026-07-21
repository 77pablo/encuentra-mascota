import { distanceKm } from './geo';
import { COMUNAS } from '../data/comunas';

export interface Comuna {
  nombre: string;
  region: string;
  lat: number;
  lng: number;
}

// Normaliza para comparar/buscar: sin tildes, minúsculas, sin bordes.
function normalizar(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// La comuna cuyo centro está más cerca del punto. Se usa para auto-sugerir la
// comuna desde el punto que el usuario marcó en el mapa. null si no hay lista.
export function comunaDeCoords(lat: number, lng: number, lista: Comuna[] = COMUNAS): Comuna | null {
  let mejor: Comuna | null = null;
  let mejorD = Infinity;
  for (const c of lista) {
    const d = distanceKm({ lat, lng }, { lat: c.lat, lng: c.lng });
    if (d < mejorD) {
      mejorD = d;
      mejor = c;
    }
  }
  return mejor;
}

// Las `n` comunas con el centro más cercano al de `nombre`, en orden de cercanía
// y sin incluirla a ella. Para sugerir "comunas vecinas" al publicar (alcance).
// Comuna desconocida → lista vacía.
export function comunasCercanas(nombre: string, n = 4, lista: Comuna[] = COMUNAS): Comuna[] {
  const base = lista.find((c) => c.nombre === nombre);
  if (!base) return [];
  return lista
    .filter((c) => c.nombre !== base.nombre)
    .map((c) => ({ c, d: distanceKm({ lat: base.lat, lng: base.lng }, { lat: c.lat, lng: c.lng }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.c);
}

// Filtra comunas por nombre para el selector buscable. Query vacía → toda la
// lista. Ignora tildes y mayúsculas.
export function buscarComunas(query: string, lista: Comuna[] = COMUNAS): Comuna[] {
  const q = normalizar(query);
  if (!q) return lista;
  return lista.filter((c) => normalizar(c.nombre).includes(q));
}

import { Pet } from '../services/pets';
import { Sighting } from '../services/sightings';

// Historial del reporte: la historia del caso contada con datos que ya
// existen (publicación, avistamientos y reencuentro). Sin red ni base nueva,
// para poder probarla y reutilizarla desde cualquier pantalla.

export type TimelineTipo = 'publicado' | 'avistamiento' | 'reunido';

export interface TimelineEvent {
  tipo: TimelineTipo;
  fecha: string; // ISO — cuándo ocurrió el evento
  titulo: string;
  detalle?: string;
}

// Solo necesitamos unos pocos campos de cada entidad; con Pick el módulo queda
// desacoplado y las fixtures de test pueden ser mínimas.
type PetTimeline = Pick<Pet, 'estado' | 'creado_en' | 'reunida_en'>;
type SightingTimeline = Pick<Sighting, 'nota' | 'creado_en'>;

function tieneFecha(v: string | null | undefined): v is string {
  return v != null && v !== '';
}

// Arma y ORDENA cronológicamente (más antiguo → más nuevo) los eventos del
// caso: la publicación, cada avistamiento y —si volvió a casa— el reencuentro.
export function buildTimeline(pet: PetTimeline, sightings: SightingTimeline[]): TimelineEvent[] {
  const eventos: TimelineEvent[] = [];

  // 1) Publicado: siempre existe.
  eventos.push({
    tipo: 'publicado',
    fecha: pet.creado_en,
    titulo:
      pet.estado === 'perdida'
        ? 'Se reportó como perdida'
        : 'Se publicó una mascota encontrada',
  });

  // 2) Avistamientos: uno por cada reporte "lo vi por acá".
  for (const s of sightings) {
    const nota = s.nota?.trim();
    eventos.push({
      tipo: 'avistamiento',
      fecha: s.creado_en,
      titulo: 'Lo vieron por acá',
      ...(nota ? { detalle: nota } : {}),
    });
  }

  // 3) Reencuentro: solo si tiene fecha de vuelta a casa.
  if (tieneFecha(pet.reunida_en)) {
    eventos.push({
      tipo: 'reunido',
      fecha: pet.reunida_en,
      titulo: 'Volvió a casa',
    });
  }

  // Orden cronológico ascendente. Array.sort es estable en Node, así que ante
  // fechas iguales se conserva el orden de inserción (publicado antes que sus
  // avistamientos, y el reencuentro al final).
  return eventos.sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
  );
}

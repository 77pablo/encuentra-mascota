import {
  sortByRecency,
  latestSighting,
  sightingDistanceKm,
  summaryLabel,
} from '../../src/lib/sightings';
import { Sighting } from '../../src/services/sightings';

// Fixture mínima de un avistamiento; se sobrescribe lo relevante por caso.
function sighting(over: Partial<Sighting>): Sighting {
  return {
    id: 's',
    pet_id: 'pet',
    user_id: 'u',
    lat: -33.45,
    lng: -70.66,
    nota: null,
    foto: null,
    creado_en: '2026-07-01T00:00:00Z',
    ...over,
  };
}

describe('sortByRecency', () => {
  it('ordena del más reciente al más antiguo', () => {
    const viejo = sighting({ id: 'viejo', creado_en: '2026-07-01T00:00:00Z' });
    const nuevo = sighting({ id: 'nuevo', creado_en: '2026-07-05T00:00:00Z' });
    const medio = sighting({ id: 'medio', creado_en: '2026-07-03T00:00:00Z' });
    const orden = sortByRecency([viejo, nuevo, medio]).map((s) => s.id);
    expect(orden).toEqual(['nuevo', 'medio', 'viejo']);
  });

  it('no muta el arreglo original', () => {
    const a = sighting({ id: 'a', creado_en: '2026-07-01T00:00:00Z' });
    const b = sighting({ id: 'b', creado_en: '2026-07-05T00:00:00Z' });
    const original = [a, b];
    sortByRecency(original);
    expect(original.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('con lista vacía devuelve []', () => {
    expect(sortByRecency([])).toEqual([]);
  });
});

describe('latestSighting', () => {
  it('devuelve el avistamiento más reciente', () => {
    const viejo = sighting({ id: 'viejo', creado_en: '2026-07-01T00:00:00Z' });
    const nuevo = sighting({ id: 'nuevo', creado_en: '2026-07-05T00:00:00Z' });
    expect(latestSighting([viejo, nuevo])?.id).toBe('nuevo');
  });

  it('devuelve null si no hay avistamientos', () => {
    expect(latestSighting([])).toBeNull();
  });
});

describe('sightingDistanceKm', () => {
  it('mide 0 cuando el avistamiento está en el punto del reporte', () => {
    const origin = { lat: -33.45, lng: -70.66 };
    expect(sightingDistanceKm(origin, { lat: -33.45, lng: -70.66 })).toBeCloseTo(0, 5);
  });

  it('crece con la distancia', () => {
    const origin = { lat: 0, lng: 0 };
    const cerca = sightingDistanceKm(origin, { lat: 0.01, lng: 0 });
    const lejos = sightingDistanceKm(origin, { lat: 0.05, lng: 0 });
    expect(lejos).toBeGreaterThan(cerca);
  });
});

describe('summaryLabel', () => {
  const origin = { lat: 0, lng: 0 };
  // 3 horas después de la fecha del avistamiento, para el "hace 3 h".
  const now = new Date('2026-07-01T03:00:00Z').getTime();

  it('resume el último avistamiento con distancia y tiempo relativo', () => {
    const s = sighting({ creado_en: '2026-07-01T00:00:00Z', lat: 0.01, lng: 0 });
    const label = summaryLabel(origin, [s], now);
    expect(label).toContain('Último avistamiento');
    expect(label).toContain('km');
    expect(label).toContain('hace 3 h');
    expect(label).toContain('·');
  });

  it('usa el más reciente cuando hay varios', () => {
    const viejo = sighting({ creado_en: '2026-06-01T00:00:00Z', lat: 0.5, lng: 0 });
    const reciente = sighting({ creado_en: '2026-07-01T00:00:00Z', lat: 0.01, lng: 0 });
    const label = summaryLabel(origin, [viejo, reciente], now);
    expect(label).toContain('hace 3 h');
  });

  it('devuelve null cuando no hay avistamientos', () => {
    expect(summaryLabel(origin, [], now)).toBeNull();
  });
});

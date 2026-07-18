import { countNewPetsInZone, petsInZone, zoneAlertMessage } from '../../src/lib/alerts';
import { Pet } from '../../src/services/pets';
import { AlertZone } from '../../src/services/alertZones';

// Fábrica de reportes de prueba. Santiago centro ≈ (-33.45, -70.66).
function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    user_id: 'u1',
    estado: 'perdida',
    especie: 'perro',
    raza: null,
    nombre: null,
    descripcion: 'perrito',
    fotos: [],
    lat: -33.45,
    lng: -70.66,
    recompensa: null,
    activo: true,
    oculto: false,
    creado_en: '2026-07-10T12:00:00Z',
    ...overrides,
  };
}

function makeZone(overrides: Partial<AlertZone> = {}): AlertZone {
  return {
    user_id: 'u1',
    lat: -33.45,
    lng: -70.66,
    radio_km: 5,
    activo: true,
    actualizado_en: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('petsInZone', () => {
  it('devuelve [] si la zona es null o no tiene centro', () => {
    const pets = [makePet()];
    expect(petsInZone(pets, null)).toEqual([]);
    expect(petsInZone(pets, undefined)).toEqual([]);
    expect(petsInZone(pets, makeZone({ lat: null }))).toEqual([]);
    expect(petsInZone(pets, makeZone({ lng: null }))).toEqual([]);
  });

  it('incluye solo los reportes dentro del radio', () => {
    const cerca = makePet({ id: 'cerca', lat: -33.46, lng: -70.66 }); // ~1 km
    const lejos = makePet({ id: 'lejos', lat: -33.9, lng: -70.66 }); // ~50 km
    const result = petsInZone([cerca, lejos], makeZone({ radio_km: 5 }));
    expect(result.map((r) => r.pet.id)).toEqual(['cerca']);
  });

  it('ordena de más cerca a más lejos', () => {
    const a = makePet({ id: 'a', lat: -33.47, lng: -70.66 }); // ~2.2 km
    const b = makePet({ id: 'b', lat: -33.455, lng: -70.66 }); // ~0.5 km
    const c = makePet({ id: 'c', lat: -33.46, lng: -70.66 }); // ~1.1 km
    const result = petsInZone([a, b, c], makeZone({ radio_km: 10 }));
    expect(result.map((r) => r.pet.id)).toEqual(['b', 'c', 'a']);
    // Las distancias vienen calculadas y crecientes.
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
    expect(result[1].distanceKm).toBeLessThan(result[2].distanceKm);
  });

  it('un radio mayor incluye más reportes', () => {
    const lejos = makePet({ id: 'lejos', lat: -33.9, lng: -70.66 });
    expect(petsInZone([lejos], makeZone({ radio_km: 5 }))).toHaveLength(0);
    expect(petsInZone([lejos], makeZone({ radio_km: 100 }))).toHaveLength(1);
  });

  it('con sinceISO solo cuenta los creados después de esa fecha', () => {
    const viejo = makePet({ id: 'viejo', creado_en: '2026-07-01T00:00:00Z' });
    const nuevo = makePet({ id: 'nuevo', creado_en: '2026-07-15T00:00:00Z' });
    const result = petsInZone([viejo, nuevo], makeZone(), '2026-07-10T00:00:00Z');
    expect(result.map((r) => r.pet.id)).toEqual(['nuevo']);
  });

  it('el corte por fecha es estricto (misma fecha NO cuenta como nuevo)', () => {
    const igual = makePet({ id: 'igual', creado_en: '2026-07-10T00:00:00Z' });
    const result = petsInZone([igual], makeZone(), '2026-07-10T00:00:00Z');
    expect(result).toHaveLength(0);
  });

  it('sin sinceISO incluye todos los que estén en el radio', () => {
    const p1 = makePet({ id: 'p1' });
    const p2 = makePet({ id: 'p2' });
    expect(petsInZone([p1, p2], makeZone())).toHaveLength(2);
  });
});

describe('countNewPetsInZone', () => {
  it('cuenta los nuevos dentro de la zona', () => {
    const viejo = makePet({ id: 'viejo', creado_en: '2026-07-01T00:00:00Z' });
    const nuevo1 = makePet({ id: 'n1', creado_en: '2026-07-15T00:00:00Z' });
    const nuevo2 = makePet({ id: 'n2', creado_en: '2026-07-16T00:00:00Z' });
    const count = countNewPetsInZone([viejo, nuevo1, nuevo2], makeZone(), '2026-07-10T00:00:00Z');
    expect(count).toBe(2);
  });

  it('devuelve 0 si la zona está en pausa (activo=false)', () => {
    const nuevo = makePet({ id: 'n', creado_en: '2026-07-15T00:00:00Z' });
    expect(countNewPetsInZone([nuevo], makeZone({ activo: false }), '2026-07-10T00:00:00Z')).toBe(0);
  });

  it('devuelve 0 si la zona es null', () => {
    expect(countNewPetsInZone([makePet()], null)).toBe(0);
  });

  it('devuelve 0 cuando no hay reportes en la zona', () => {
    const lejos = makePet({ lat: -33.9, lng: -70.66 });
    expect(countNewPetsInZone([lejos], makeZone({ radio_km: 5 }))).toBe(0);
  });
});

describe('zoneAlertMessage', () => {
  it('devuelve null cuando no hay nuevos', () => {
    expect(zoneAlertMessage(0)).toBeNull();
    expect(zoneAlertMessage(-3)).toBeNull();
  });

  it('usa singular para 1', () => {
    expect(zoneAlertMessage(1)).toBe('1 reporte nuevo cerca de tu zona');
  });

  it('usa plural para más de 1', () => {
    expect(zoneAlertMessage(4)).toBe('4 reportes nuevos cerca de tu zona');
  });
});

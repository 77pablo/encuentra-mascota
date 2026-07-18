import { findMatches, especieCompatible } from '../../src/lib/matches';
import { Pet } from '../../src/services/pets';

// Fixture mínima de un Pet; se sobrescribe lo relevante por caso.
function pet(over: Partial<Pet>): Pet {
  return {
    id: 'pet',
    user_id: 'u',
    estado: 'perdida',
    especie: 'perro',
    raza: null,
    nombre: null,
    descripcion: 'desc',
    fotos: [],
    lat: -33.45,
    lng: -70.66,
    recompensa: null,
    activo: true,
    oculto: false,
    creado_en: '2026-07-01T00:00:00Z',
    ...over,
  };
}

describe('especieCompatible', () => {
  it('coincide la misma especie', () => {
    expect(especieCompatible('perro', 'perro')).toBe(true);
    expect(especieCompatible('gato', 'gato')).toBe(true);
  });

  it('no coincide distinta especie concreta', () => {
    expect(especieCompatible('perro', 'gato')).toBe(false);
  });

  it('"otro" actúa como comodín en ambos sentidos', () => {
    expect(especieCompatible('otro', 'perro')).toBe(true);
    expect(especieCompatible('gato', 'otro')).toBe(true);
  });
});

describe('findMatches', () => {
  it('para una PERDIDA sugiere ENCONTRADAS de la misma especie cercanas', () => {
    const target = pet({ id: 'lost', estado: 'perdida', especie: 'perro' });
    const cerca = pet({ id: 'found-cerca', estado: 'encontrada', especie: 'perro', lat: -33.451, lng: -70.661 });
    const matches = findMatches(target, [cerca]);
    expect(matches.map((m) => m.pet.id)).toEqual(['found-cerca']);
    expect(matches[0].distanceKm).toBeGreaterThanOrEqual(0);
  });

  it('para una ENCONTRADA sugiere PERDIDAS (dirección inversa)', () => {
    const target = pet({ id: 'found', estado: 'encontrada', especie: 'gato' });
    const perdida = pet({ id: 'lost-cerca', estado: 'perdida', especie: 'gato', lat: -33.452, lng: -70.662 });
    const matches = findMatches(target, [perdida]);
    expect(matches.map((m) => m.pet.id)).toEqual(['lost-cerca']);
  });

  it('descarta el mismo estado, distinta especie, a sí mismo y los lejanos', () => {
    const target = pet({ id: 'lost', estado: 'perdida', especie: 'perro' });
    const candidatos = [
      target, // a sí mismo
      pet({ id: 'mismo-estado', estado: 'perdida', especie: 'perro' }), // no es opuesto
      pet({ id: 'otra-especie', estado: 'encontrada', especie: 'gato' }), // especie incompatible
      pet({ id: 'lejano', estado: 'encontrada', especie: 'perro', lat: -33.05, lng: -71.62 }), // ~90 km
      pet({ id: 'valido', estado: 'encontrada', especie: 'perro', lat: -33.455, lng: -70.665 }),
    ];
    const matches = findMatches(target, candidatos);
    expect(matches.map((m) => m.pet.id)).toEqual(['valido']);
  });

  it('ordena de más cerca a más lejos', () => {
    const target = pet({ id: 'lost', estado: 'perdida', especie: 'perro', lat: 0, lng: 0 });
    const lejos = pet({ id: 'lejos', estado: 'encontrada', especie: 'perro', lat: 0.05, lng: 0 });
    const cerca = pet({ id: 'cerca', estado: 'encontrada', especie: 'perro', lat: 0.01, lng: 0 });
    const matches = findMatches(target, [lejos, cerca]);
    expect(matches.map((m) => m.pet.id)).toEqual(['cerca', 'lejos']);
  });

  it('"otro" coincide con cualquier especie dentro del radio', () => {
    const target = pet({ id: 'lost', estado: 'perdida', especie: 'otro', lat: 0, lng: 0 });
    const found = pet({ id: 'found', estado: 'encontrada', especie: 'gato', lat: 0.001, lng: 0 });
    const matches = findMatches(target, [found]);
    expect(matches.map((m) => m.pet.id)).toEqual(['found']);
  });

  it('respeta maxKm y limit', () => {
    const target = pet({ id: 'lost', estado: 'perdida', especie: 'perro', lat: 0, lng: 0 });
    const candidatos = [
      pet({ id: 'a', estado: 'encontrada', especie: 'perro', lat: 0.001, lng: 0 }),
      pet({ id: 'b', estado: 'encontrada', especie: 'perro', lat: 0.002, lng: 0 }),
      pet({ id: 'c', estado: 'encontrada', especie: 'perro', lat: 0.003, lng: 0 }),
    ];
    expect(findMatches(target, candidatos, { limit: 2 }).map((m) => m.pet.id)).toEqual(['a', 'b']);
    expect(findMatches(target, candidatos, { maxKm: 0.0001 })).toEqual([]);
  });
});

import {
  tieneRecompensa,
  matchesReward,
  matchesTimeRange,
  filterByExtras,
  RangoTiempo,
} from '../../src/lib/petFilters';
import { Pet } from '../../src/services/pets';

// Fixture mínima; se sobrescribe lo relevante por caso.
function pet(over: Partial<Pet>): Pet {
  return {
    id: 'p',
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
    creado_en: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

const DIA_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-07-17T12:00:00.000Z').getTime();

describe('tieneRecompensa', () => {
  it('false cuando es null', () => {
    expect(tieneRecompensa(pet({ recompensa: null }))).toBe(false);
  });

  it('false cuando es cadena vacía o solo espacios', () => {
    expect(tieneRecompensa(pet({ recompensa: '' }))).toBe(false);
    expect(tieneRecompensa(pet({ recompensa: '   ' }))).toBe(false);
  });

  it('true cuando tiene texto real', () => {
    expect(tieneRecompensa(pet({ recompensa: '$50.000' }))).toBe(true);
  });
});

describe('matchesReward', () => {
  it('deja pasar todo cuando el toggle está apagado', () => {
    expect(matchesReward(pet({ recompensa: null }), false)).toBe(true);
    expect(matchesReward(pet({ recompensa: '$10' }), false)).toBe(true);
  });

  it('con el toggle activo filtra las sin recompensa', () => {
    expect(matchesReward(pet({ recompensa: null }), true)).toBe(false);
    expect(matchesReward(pet({ recompensa: '  ' }), true)).toBe(false);
    expect(matchesReward(pet({ recompensa: 'Recompensa' }), true)).toBe(true);
  });
});

describe('matchesTimeRange', () => {
  it('"todo" siempre pasa', () => {
    expect(matchesTimeRange(pet({ creado_en: '2000-01-01T00:00:00.000Z' }), 'todo', now)).toBe(true);
  });

  describe('"hoy" (últimas 24 h)', () => {
    it('justo dentro de las 24 h pasa', () => {
      const iso = new Date(now - DIA_MS + 1000).toISOString();
      expect(matchesTimeRange(pet({ creado_en: iso }), 'hoy', now)).toBe(true);
    });

    it('exactamente en el borde de 24 h pasa (inclusive)', () => {
      const iso = new Date(now - DIA_MS).toISOString();
      expect(matchesTimeRange(pet({ creado_en: iso }), 'hoy', now)).toBe(true);
    });

    it('justo fuera de las 24 h no pasa', () => {
      const iso = new Date(now - DIA_MS - 1000).toISOString();
      expect(matchesTimeRange(pet({ creado_en: iso }), 'hoy', now)).toBe(false);
    });
  });

  describe('"semana" (últimos 7 días)', () => {
    it('justo dentro de los 7 días pasa', () => {
      const iso = new Date(now - 7 * DIA_MS + 1000).toISOString();
      expect(matchesTimeRange(pet({ creado_en: iso }), 'semana', now)).toBe(true);
    });

    it('exactamente en el borde de 7 días pasa (inclusive)', () => {
      const iso = new Date(now - 7 * DIA_MS).toISOString();
      expect(matchesTimeRange(pet({ creado_en: iso }), 'semana', now)).toBe(true);
    });

    it('justo fuera de los 7 días no pasa', () => {
      const iso = new Date(now - 7 * DIA_MS - 1000).toISOString();
      expect(matchesTimeRange(pet({ creado_en: iso }), 'semana', now)).toBe(false);
    });
  });

  it('fechas futuras (reloj desfasado) no se esconden', () => {
    const iso = new Date(now + DIA_MS).toISOString();
    expect(matchesTimeRange(pet({ creado_en: iso }), 'hoy', now)).toBe(true);
  });

  it('fecha inválida no pasa en rangos acotados', () => {
    expect(matchesTimeRange(pet({ creado_en: 'no-es-fecha' }), 'hoy', now)).toBe(false);
  });
});

describe('filterByExtras', () => {
  const reciente = pet({ id: 'reciente', recompensa: '$20', creado_en: new Date(now - 2 * 60 * 60 * 1000).toISOString() });
  const semanaSinRecompensa = pet({ id: 'semana', recompensa: null, creado_en: new Date(now - 3 * DIA_MS).toISOString() });
  const viejoConRecompensa = pet({ id: 'viejo', recompensa: 'Sí', creado_en: new Date(now - 30 * DIA_MS).toISOString() });

  const todos = [reciente, semanaSinRecompensa, viejoConRecompensa];

  it('sin filtros devuelve todos', () => {
    const r = filterByExtras(todos, { conRecompensa: false, rango: 'todo' }, now);
    expect(r.map((p) => p.id)).toEqual(['reciente', 'semana', 'viejo']);
  });

  it('combina recompensa + rango', () => {
    const r = filterByExtras(todos, { conRecompensa: true, rango: 'semana' }, now);
    expect(r.map((p) => p.id)).toEqual(['reciente']);
  });

  it('solo con recompensa (cualquier fecha)', () => {
    const r = filterByExtras(todos, { conRecompensa: true, rango: 'todo' }, now);
    expect(r.map((p) => p.id)).toEqual(['reciente', 'viejo']);
  });

  it('solo rango "hoy"', () => {
    const r = filterByExtras(todos, { conRecompensa: false, rango: 'hoy' }, now);
    expect(r.map((p) => p.id)).toEqual(['reciente']);
  });

  it('no muta el arreglo original', () => {
    const original = [...todos];
    filterByExtras(todos, { conRecompensa: true, rango: 'hoy' }, now);
    expect(todos).toEqual(original);
  });

  it('lista vacía devuelve []', () => {
    const rango: RangoTiempo = 'semana';
    expect(filterByExtras([], { conRecompensa: true, rango }, now)).toEqual([]);
  });
});

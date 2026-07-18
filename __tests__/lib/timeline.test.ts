import { buildTimeline, TimelineEvent } from '../../src/lib/timeline';
import { Pet } from '../../src/services/pets';
import { Sighting } from '../../src/services/sightings';

// Fixtures mínimas; se sobrescribe lo relevante por caso.
function pet(over: Partial<Pet>): Pet {
  return {
    id: 'pet',
    user_id: 'u',
    estado: 'perdida',
    especie: 'perro',
    raza: null,
    nombre: null,
    descripcion: '',
    fotos: [],
    lat: -33.45,
    lng: -70.66,
    recompensa: null,
    activo: true,
    oculto: false,
    creado_en: '2026-07-01T00:00:00Z',
    reunida_en: null,
    ...over,
  };
}

function sighting(over: Partial<Sighting>): Sighting {
  return {
    id: 's',
    pet_id: 'pet',
    user_id: 'u',
    lat: -33.45,
    lng: -70.66,
    nota: null,
    foto: null,
    creado_en: '2026-07-02T00:00:00Z',
    ...over,
  };
}

describe('buildTimeline', () => {
  it('sin avistamientos ni reencuentro: solo la publicación', () => {
    const t = buildTimeline(pet({ estado: 'perdida' }), []);
    expect(t).toHaveLength(1);
    expect(t[0].tipo).toBe('publicado');
    expect(t[0].titulo).toBe('Se reportó como perdida');
    expect(t[0].fecha).toBe('2026-07-01T00:00:00Z');
  });

  it('el título de "publicado" cambia según el estado', () => {
    const perdida = buildTimeline(pet({ estado: 'perdida' }), []);
    const encontrada = buildTimeline(pet({ estado: 'encontrada' }), []);
    expect(perdida[0].titulo).toBe('Se reportó como perdida');
    expect(encontrada[0].titulo).toBe('Se publicó una mascota encontrada');
  });

  it('agrega un evento por cada avistamiento, con su nota como detalle', () => {
    const t = buildTimeline(pet({}), [
      sighting({ id: 'a', creado_en: '2026-07-02T00:00:00Z', nota: 'Cerca de la plaza' }),
      sighting({ id: 'b', creado_en: '2026-07-03T00:00:00Z', nota: null }),
    ]);
    const avistamientos = t.filter((e) => e.tipo === 'avistamiento');
    expect(avistamientos).toHaveLength(2);
    expect(avistamientos[0].titulo).toBe('Lo vieron por acá');
    expect(avistamientos[0].detalle).toBe('Cerca de la plaza');
    // Sin nota → sin detalle.
    expect(avistamientos[1].detalle).toBeUndefined();
  });

  it('ignora notas en blanco (solo espacios) como detalle', () => {
    const t = buildTimeline(pet({}), [sighting({ nota: '   ' })]);
    const av = t.find((e) => e.tipo === 'avistamiento');
    expect(av?.detalle).toBeUndefined();
  });

  it('incluye el reencuentro solo si reunida_en tiene fecha', () => {
    const sin = buildTimeline(pet({ activo: false, reunida_en: null }), []);
    expect(sin.some((e) => e.tipo === 'reunido')).toBe(false);

    const con = buildTimeline(
      pet({ activo: false, reunida_en: '2026-07-05T00:00:00Z' }),
      [],
    );
    const reunido = con.find((e) => e.tipo === 'reunido');
    expect(reunido).toBeDefined();
    expect(reunido?.titulo).toBe('Volvió a casa');
    expect(reunido?.fecha).toBe('2026-07-05T00:00:00Z');
  });

  it('trata reunida_en vacío o undefined como sin reencuentro', () => {
    expect(buildTimeline(pet({ reunida_en: '' }), []).some((e) => e.tipo === 'reunido')).toBe(false);
    expect(
      buildTimeline(pet({ reunida_en: undefined }), []).some((e) => e.tipo === 'reunido'),
    ).toBe(false);
  });

  it('ordena cronológicamente: publicado → avistamientos → reencuentro', () => {
    const t = buildTimeline(
      pet({ estado: 'perdida', activo: false, creado_en: '2026-07-01T00:00:00Z', reunida_en: '2026-07-10T00:00:00Z' }),
      [
        sighting({ id: 'nuevo', creado_en: '2026-07-05T00:00:00Z' }),
        sighting({ id: 'viejo', creado_en: '2026-07-02T00:00:00Z' }),
      ],
    );
    expect(t.map((e) => e.tipo)).toEqual([
      'publicado',
      'avistamiento',
      'avistamiento',
      'reunido',
    ]);
    // Fechas estrictamente no decrecientes.
    const tiempos = t.map((e) => new Date(e.fecha).getTime());
    const ordenado = [...tiempos].sort((a, b) => a - b);
    expect(tiempos).toEqual(ordenado);
  });

  it('no muta el arreglo de avistamientos original', () => {
    const original = [
      sighting({ id: 'a', creado_en: '2026-07-05T00:00:00Z' }),
      sighting({ id: 'b', creado_en: '2026-07-02T00:00:00Z' }),
    ];
    const copia = [...original];
    buildTimeline(pet({}), original);
    expect(original).toEqual(copia);
  });

  it('el tipo TimelineEvent expone tipo/fecha/titulo', () => {
    const t: TimelineEvent[] = buildTimeline(pet({}), []);
    expect(t[0]).toEqual(
      expect.objectContaining({ tipo: 'publicado', fecha: expect.any(String), titulo: expect.any(String) }),
    );
  });
});

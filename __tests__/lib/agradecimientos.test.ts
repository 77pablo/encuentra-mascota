import { fraseGracias, resumenAyudantes } from '../../src/lib/agradecimientos';
import type { Tip } from '../../src/lib/tips';
import type { Sighting } from '../../src/services/sightings';

// CERRAR EL CÍRCULO DEL REENCUENTRO (B5.1).
//
// Cuando una mascota vuelve a casa, la app celebraba con el dueño y nadie más:
// quien dejó una pista o marcó un avistamiento en ese reporte ayudó y no se
// enteraba de que la historia terminó bien. Acá vive la parte pura de ese
// agradecimiento: quién ayudó, cómo se lo nombra y qué frase se muestra.
//
// Los datos de entrada son los MISMOS que ya carga `PetDetailScreen`
// (`listarTips` y `listSightings`), no una forma inventada para el test.

const pista = (over: Partial<Tip>): Tip => ({
  id: 'p1',
  petId: 'pet-1',
  userId: 'u-ana',
  texto: 'La vi cruzando la plaza',
  creadoEn: '2026-07-01T10:00:00Z',
  ...over,
});

const avistamiento = (over: Partial<Sighting>): Sighting => ({
  id: 's1',
  pet_id: 'pet-1',
  user_id: 'u-beto',
  lat: -33.4,
  lng: -70.6,
  nota: null,
  foto: null,
  creado_en: '2026-07-02T10:00:00Z',
  ...over,
});

const DUENO = 'u-dueno';

describe('quién ayudó', () => {
  it('sin pistas ni avistamientos no hay a quién agradecer', () => {
    expect(resumenAyudantes([], [], DUENO)).toEqual({ nombres: [], anonimos: 0, total: 0 });
  });

  it('toma el nombre de quien dejó una pista firmada', () => {
    const r = resumenAyudantes([pista({ autorNombre: 'Ana' })], [], DUENO);
    expect(r).toEqual({ nombres: ['Ana'], anonimos: 0, total: 1 });
  });

  it('el dueño no se agradece a sí mismo', () => {
    const r = resumenAyudantes(
      [pista({ userId: DUENO, autorNombre: 'Yo' })],
      [avistamiento({ user_id: DUENO })],
      DUENO,
    );
    expect(r.total).toBe(0);
  });

  it('un avistamiento suma como vecino sin nombre (la fila no trae nombre)', () => {
    const r = resumenAyudantes([], [avistamiento({})], DUENO);
    expect(r).toEqual({ nombres: [], anonimos: 1, total: 1 });
  });

  it('la misma persona que dejó pista y avistamiento cuenta UNA vez, con nombre', () => {
    const r = resumenAyudantes(
      [pista({ userId: 'u-ana', autorNombre: 'Ana' })],
      [avistamiento({ id: 's1', user_id: 'u-ana' })],
      DUENO,
    );
    expect(r).toEqual({ nombres: ['Ana'], anonimos: 0, total: 1 });
  });

  it('dos pistas del mismo vecino cuentan una vez', () => {
    const r = resumenAyudantes(
      [pista({ id: 'p1', autorNombre: 'Ana' }), pista({ id: 'p2', autorNombre: 'Ana' })],
      [],
      DUENO,
    );
    expect(r.total).toBe(1);
  });

  it('quien borró su cuenta se cuenta como vecino sin nombre, no con su nombre viejo', () => {
    // La ayuda existió y se agradece; el nombre ya no es de nadie.
    const r = resumenAyudantes(
      [pista({ autorNombre: 'Ana', autorEliminadoEn: '2026-07-20T00:00:00Z' })],
      [],
      DUENO,
    );
    expect(r).toEqual({ nombres: [], anonimos: 1, total: 1 });
  });

  it('una pista sin nombre resoluble (invitado leyendo) va como vecino sin nombre', () => {
    const r = resumenAyudantes([pista({ autorNombre: null })], [], DUENO);
    expect(r).toEqual({ nombres: [], anonimos: 1, total: 1 });
  });

  it('un nombre en blanco no se muestra como nombre', () => {
    const r = resumenAyudantes([pista({ autorNombre: '   ' })], [], DUENO);
    expect(r).toEqual({ nombres: [], anonimos: 1, total: 1 });
  });
});

describe('cómo se lo dice', () => {
  it('sin nadie a quien agradecer, no hay frase', () => {
    expect(fraseGracias({ nombres: [], anonimos: 0, total: 0 })).toBe('');
  });

  it('un solo vecino con nombre', () => {
    expect(fraseGracias({ nombres: ['Ana'], anonimos: 0, total: 1 })).toBe(
      'Gracias a Ana por ayudar a que volviera a casa.',
    );
  });

  it('dos nombres van con “y”, sin coma', () => {
    expect(fraseGracias({ nombres: ['Ana', 'Beto'], anonimos: 0, total: 2 })).toBe(
      'Gracias a Ana y Beto por ayudar a que volviera a casa.',
    );
  });

  it('tres nombres: coma y “y” al final', () => {
    expect(fraseGracias({ nombres: ['Ana', 'Beto', 'Caro'], anonimos: 0, total: 3 })).toBe(
      'Gracias a Ana, Beto y Caro por ayudar a que volviera a casa.',
    );
  });

  it('con más de tres nombres, los que sobran se cuentan', () => {
    const frase = fraseGracias({ nombres: ['Ana', 'Beto', 'Caro', 'Dani', 'Eli'], anonimos: 0, total: 5 });
    expect(frase).toBe('Gracias a Ana, Beto, Caro y 2 vecinos más por ayudar a que volviera a casa.');
  });

  it('un nombre y un anónimo: el anónimo se suma al conteo', () => {
    expect(fraseGracias({ nombres: ['Ana'], anonimos: 1, total: 2 })).toBe(
      'Gracias a Ana y 1 vecino más por ayudar a que volviera a casa.',
    );
  });

  it('solo anónimos, uno', () => {
    expect(fraseGracias({ nombres: [], anonimos: 1, total: 1 })).toBe(
      'Gracias al vecino que ayudó a que volviera a casa.',
    );
  });

  it('solo anónimos, varios', () => {
    expect(fraseGracias({ nombres: [], anonimos: 4, total: 4 })).toBe(
      'Gracias a los 4 vecinos que ayudaron a que volviera a casa.',
    );
  });
});

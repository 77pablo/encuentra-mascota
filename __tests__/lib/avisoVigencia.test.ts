import { avisoDeVigencia } from '../../src/lib/avisoVigencia';
import {
  DIAS_PRIMER_NUDGE,
  DIAS_SEGUNDO_NUDGE,
  DIAS_VENCIMIENTO,
} from '../../src/lib/cicloVida';
import { Pet } from '../../src/services/pets';

// NADIE AVISA QUE TU REPORTE SE VENCE.
//
// A los 45 días el reporte sale de las búsquedas (0028) y del motor de
// coincidencias (0029), en silencio. El único aviso que existía era el nudge
// DENTRO de la ficha: el dueño tenía que abrir su propio reporte para
// enterarse, justo lo que deja de hacer cuando se le apaga la esperanza.
//
// Los umbrales NO se escriben a mano acá: se importan de `cicloVida`, que es
// donde vive la verdad (y donde `DIAS_SEGUNDO_NUDGE` estaba muerto). Si alguien
// mueve un umbral, este test se mueve con él en vez de fosilizar el número.

const NOW = new Date('2026-08-01T12:00:00Z').getTime();
const DIA = 24 * 60 * 60 * 1000;
const haceDias = (d: number) => new Date(NOW - d * DIA).toISOString();

function reporte(over: Partial<Pet> & { dias: number }): Pet {
  const { dias, ...resto } = over;
  return {
    id: 'r',
    user_id: 'yo',
    estado: 'perdida',
    especie: 'perro',
    nombre: 'Rocco',
    raza: null,
    descripcion: 'x',
    fotos: [],
    lat: -33.4,
    lng: -70.6,
    recompensa: null,
    creado_en: haceDias(dias),
    renovado_en: haceDias(dias),
    activo: true,
    reunida_en: null,
    ...resto,
  } as unknown as Pet;
}

describe('avisoDeVigencia — cuándo aparece', () => {
  it('no avisa nada si no hay reportes', () => {
    expect(avisoDeVigencia([], NOW)).toBeNull();
  });

  it('no avisa en el PRIMER tramo: de eso ya se encarga el nudge de la ficha', () => {
    expect(avisoDeVigencia([reporte({ dias: DIAS_PRIMER_NUDGE })], NOW)).toBeNull();
    expect(avisoDeVigencia([reporte({ dias: DIAS_SEGUNDO_NUDGE - 1 })], NOW)).toBeNull();
  });

  it('avisa justo al cruzar el SEGUNDO umbral', () => {
    const aviso = avisoDeVigencia([reporte({ dias: DIAS_SEGUNDO_NUDGE })], NOW);
    expect(aviso).not.toBeNull();
    expect(aviso!.tipo).toBe('porVencer');
    expect(aviso!.diasRestantes).toBe(DIAS_VENCIMIENTO - DIAS_SEGUNDO_NUDGE);
  });

  it('al vencer cambia de tono: ya salió de las búsquedas', () => {
    const aviso = avisoDeVigencia([reporte({ dias: DIAS_VENCIMIENTO })], NOW);
    expect(aviso!.tipo).toBe('vencido');
    expect(aviso!.detalle).toMatch(/búsquedas/i);
  });

  it('un reporte ya cerrado o reunido nunca genera aviso', () => {
    expect(avisoDeVigencia([reporte({ dias: 60, activo: false })], NOW)).toBeNull();
    expect(
      avisoDeVigencia([reporte({ dias: 60, activo: false, reunida_en: haceDias(1) } as any)], NOW),
    ).toBeNull();
  });
});

describe('avisoDeVigencia — qué dice cuando hay varios', () => {
  it('lo vencido gana sobre lo por vencer (el daño ya está ocurriendo)', () => {
    const aviso = avisoDeVigencia(
      [
        reporte({ id: 'a', dias: DIAS_SEGUNDO_NUDGE + 2, nombre: 'PorVencer' }),
        reporte({ id: 'b', dias: DIAS_VENCIMIENTO + 3, nombre: 'Vencido' }),
      ],
      NOW,
    );
    expect(aviso!.tipo).toBe('vencido');
    expect(aviso!.cantidad).toBe(1);
    expect(aviso!.titulo).toContain('Vencido');
  });

  it('dentro del mismo grupo nombra al más urgente y cuenta el resto', () => {
    const aviso = avisoDeVigencia(
      [
        reporte({ id: 'a', dias: DIAS_SEGUNDO_NUDGE + 1, nombre: 'Menos' }),
        reporte({ id: 'b', dias: DIAS_VENCIMIENTO - 1, nombre: 'Mas' }),
      ],
      NOW,
    );
    expect(aviso!.tipo).toBe('porVencer');
    expect(aviso!.cantidad).toBe(2);
    expect(aviso!.diasRestantes).toBe(1);
    // Con más de uno no se nombra a ninguno: se dice cuántos son.
    expect(aviso!.titulo).toContain('2');
    expect(aviso!.titulo).not.toContain('Mas');
  });

  it('un reporte sin nombre no deja el texto colgando', () => {
    const aviso = avisoDeVigencia(
      [reporte({ dias: DIAS_SEGUNDO_NUDGE + 1, nombre: null, especie: 'gato' } as any)],
      NOW,
    );
    expect(aviso!.titulo).toContain('gato');
    expect(aviso!.titulo).not.toMatch(/\s{2,}/);
  });
});

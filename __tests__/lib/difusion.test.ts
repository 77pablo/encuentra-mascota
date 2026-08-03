import {
  agruparDestinos,
  Destino,
  ETIQUETA_MAX,
  resumenDifusion,
  sugerenciasDePersonas,
  validarEtiqueta,
} from '../../src/lib/difusion';

function destino(over: Partial<Destino> = {}): Destino {
  return {
    id: 'd1', petId: 'p1', tipo: 'persona', etiqueta: 'grupo del edificio',
    lugarId: null, institucionId: null, estado: 'pendiente',
    avisadoEn: null, creadoEn: '2026-08-03T10:00:00Z', ...over,
  };
}

describe('validarEtiqueta', () => {
  it('rechaza vacio y solo espacios', () => {
    expect(validarEtiqueta('').ok).toBe(false);
    expect(validarEtiqueta('   ').ok).toBe(false);
  });

  it('rechaza mas largo que el CHECK de la base', () => {
    expect(validarEtiqueta('a'.repeat(ETIQUETA_MAX + 1)).ok).toBe(false);
  });

  it('acepta el largo exacto del tope', () => {
    expect(validarEtiqueta('a'.repeat(ETIQUETA_MAX)).ok).toBe(true);
  });

  it('acepta un caso real', () => {
    expect(validarEtiqueta('el grupo de la junta de vecinos').ok).toBe(true);
  });
});

describe('agruparDestinos', () => {
  it('separa pendientes de avisados sin perder ninguno', () => {
    const ds = [
      destino({ id: 'a' }),
      destino({ id: 'b', estado: 'avisado', avisadoEn: '2026-08-03T11:00:00Z' }),
      destino({ id: 'c' }),
    ];
    const g = agruparDestinos(ds);
    expect(g.pendientes.map((d) => d.id)).toEqual(['a', 'c']);
    expect(g.avisados.map((d) => d.id)).toEqual(['b']);
    expect(g.pendientes.length + g.avisados.length).toBe(ds.length);
  });
});

describe('resumenDifusion — el tono importa', () => {
  it('sin destinos NO reprocha', () => {
    const t = resumenDifusion([]);
    expect(t).not.toMatch(/nadie|todavía no avisaste|deberías/i);
  });

  it('no gamifica: sin porcentajes, sin puntajes, sin felicitaciones', () => {
    const ds = [destino({ id: 'a' }), destino({ id: 'b', estado: 'avisado', avisadoEn: 'x' })];
    const t = resumenDifusion(ds);
    expect(t).not.toMatch(/%|puntos|nivel|felicit|¡bien|racha/i);
  });

  it('cuenta bien en singular y en plural (regla del español: n === 1)', () => {
    const uno = resumenDifusion([destino({ estado: 'avisado', avisadoEn: 'x' })]);
    expect(uno).toMatch(/1 (aviso|contacto|destino)/);
    expect(uno).not.toMatch(/1 avisos/);
    const cero = resumenDifusion([destino()]);
    expect(cero).not.toMatch(/1 avisos?/);
  });
});

describe('sugerenciasDePersonas', () => {
  it('nombra la comuna cuando la hay', () => {
    const s = sugerenciasDePersonas({ comuna: 'Ñuñoa' });
    expect(s.join(' ')).toContain('Ñuñoa');
  });

  it('sin comuna no deja un hueco ni dice "undefined"', () => {
    const s = sugerenciasDePersonas({ comuna: null });
    expect(s.join(' ')).not.toMatch(/undefined|null|\s{2,}/);
    expect(s.length).toBeGreaterThan(0);
  });

  it('ninguna sugerencia pasa el tope de la base', () => {
    for (const s of sugerenciasDePersonas({ comuna: 'Pedro Aguirre Cerda' })) {
      expect(s.length).toBeLessThanOrEqual(ETIQUETA_MAX);
    }
  });
});

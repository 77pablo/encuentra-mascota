import {
  diasDesdeRenovacion,
  debeNudgear,
  vencido,
  DIAS_PRIMER_NUDGE,
  DIAS_SEGUNDO_NUDGE,
  DIAS_VENCIMIENTO,
} from './cicloVida';

// Fecha base fija para que los cálculos de días sean estables.
const NOW = new Date('2026-07-21T12:00:00Z').getTime();
const DIA = 24 * 60 * 60 * 1000;
// Un reporte cuya última renovación (o creación) fue hace `d` días.
const haceDias = (d: number) => new Date(NOW - d * DIA).toISOString();

// Base vigente (activo, no reunido). Cada test le pisa la fecha ancla.
const vigente = (renovado_en: string, extra: Partial<Parameters<typeof debeNudgear>[0]> = {}) => ({
  activo: true,
  reunida_en: null,
  creado_en: renovado_en,
  renovado_en,
  ...extra,
});

describe('umbrales', () => {
  it('están en un solo lugar y valen 14 / 30 / 45', () => {
    expect(DIAS_PRIMER_NUDGE).toBe(14);
    expect(DIAS_SEGUNDO_NUDGE).toBe(30);
    expect(DIAS_VENCIMIENTO).toBe(45);
  });
});

describe('diasDesdeRenovacion', () => {
  it('cuenta desde renovado_en cuando existe', () => {
    expect(diasDesdeRenovacion({ creado_en: haceDias(100), renovado_en: haceDias(3) }, NOW)).toBe(3);
  });

  it('cae a creado_en para reportes viejos sin renovado_en', () => {
    expect(diasDesdeRenovacion({ creado_en: haceDias(20), renovado_en: null }, NOW)).toBe(20);
    expect(
      diasDesdeRenovacion({ creado_en: haceDias(20), renovado_en: undefined }, NOW),
    ).toBe(20);
  });
});

describe('debeNudgear — umbral de 14 días (justo antes / después)', () => {
  it('no nudgea a los 13 días', () => {
    expect(debeNudgear(vigente(haceDias(13)), NOW)).toBe(false);
  });

  it('nudgea justo a los 14 días', () => {
    expect(debeNudgear(vigente(haceDias(14)), NOW)).toBe(true);
  });
});

describe('debeNudgear — sigue vigente en el segundo tramo (30 días)', () => {
  it('sigue nudgeando a los 29 y a los 30 días', () => {
    expect(debeNudgear(vigente(haceDias(29)), NOW)).toBe(true);
    expect(debeNudgear(vigente(haceDias(30)), NOW)).toBe(true);
  });

  it('sigue nudgeando a los 44 (aún no vencido)', () => {
    expect(debeNudgear(vigente(haceDias(44)), NOW)).toBe(true);
  });
});

describe('debeNudgear — deja de nudgear al vencer (45 días)', () => {
  it('no nudgea a los 45 días: ya está vencido y sale de las búsquedas', () => {
    expect(debeNudgear(vigente(haceDias(45)), NOW)).toBe(false);
  });
});

describe('debeNudgear — un reporte reunido nunca nudgea', () => {
  it('no nudgea aunque tenga muchos días', () => {
    expect(
      debeNudgear(
        { activo: false, reunida_en: haceDias(1), creado_en: haceDias(60), renovado_en: haceDias(60) },
        NOW,
      ),
    ).toBe(false);
  });

  it('tampoco nudgea un reporte cerrado sin reencuentro', () => {
    expect(
      debeNudgear(
        { activo: false, reunida_en: null, creado_en: haceDias(20), renovado_en: haceDias(20) },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('vencido — umbral de 45 días (justo antes / después)', () => {
  it('no está vencido a los 44 días', () => {
    expect(vencido(vigente(haceDias(44)), NOW)).toBe(false);
  });

  it('está vencido justo a los 45 días', () => {
    expect(vencido(vigente(haceDias(45)), NOW)).toBe(true);
  });

  it('un reporte reunido nunca vence', () => {
    expect(
      vencido(
        { activo: false, reunida_en: haceDias(1), creado_en: haceDias(90), renovado_en: haceDias(90) },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('renovar reinicia el reloj', () => {
  it('un reporte vencido deja de estar vencido tras renovar (renovado_en = ahora)', () => {
    const viejo = vigente(haceDias(60));
    expect(vencido(viejo, NOW)).toBe(true);

    const renovado = { ...viejo, renovado_en: haceDias(0) };
    expect(vencido(renovado, NOW)).toBe(false);
    expect(debeNudgear(renovado, NOW)).toBe(false); // recién renovado: 0 días
  });
});

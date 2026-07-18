import { isReunited, reunionLabel } from './reunion';

// Fecha base fija para que los tiempos relativos sean estables en los tests.
const NOW = new Date('2026-07-18T12:00:00Z').getTime();
const isoHace = (ms: number) => new Date(NOW - ms).toISOString();

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

describe('isReunited', () => {
  it('es true cuando el reporte está cerrado y tiene fecha de reencuentro', () => {
    expect(isReunited({ activo: false, reunida_en: isoHace(DIA) })).toBe(true);
  });

  it('es false si el reporte sigue activo aunque tenga fecha', () => {
    expect(isReunited({ activo: true, reunida_en: isoHace(DIA) })).toBe(false);
  });

  it('es false si está cerrado pero sin fecha de reencuentro (cierre común)', () => {
    expect(isReunited({ activo: false, reunida_en: null })).toBe(false);
    expect(isReunited({ activo: false, reunida_en: undefined })).toBe(false);
    expect(isReunited({ activo: false, reunida_en: '' })).toBe(false);
  });
});

describe('reunionLabel', () => {
  it('devuelve cadena vacía si no hay fecha de reencuentro', () => {
    expect(reunionLabel({ reunida_en: null }, NOW)).toBe('');
    expect(reunionLabel({ reunida_en: undefined }, NOW)).toBe('');
  });

  it('arma la frase con el tiempo relativo en días', () => {
    expect(reunionLabel({ reunida_en: isoHace(2 * DIA) }, NOW)).toBe('Volvió a casa hace 2 días');
  });

  it('usa singular para un día', () => {
    expect(reunionLabel({ reunida_en: isoHace(DIA) }, NOW)).toBe('Volvió a casa hace 1 día');
  });

  it('muestra horas cuando es reciente', () => {
    expect(reunionLabel({ reunida_en: isoHace(3 * HORA) }, NOW)).toBe('Volvió a casa hace 3 h');
  });

  it('dice "recién" cuando acaba de ocurrir', () => {
    expect(reunionLabel({ reunida_en: isoHace(10_000) }, NOW)).toBe('Volvió a casa recién');
  });
});

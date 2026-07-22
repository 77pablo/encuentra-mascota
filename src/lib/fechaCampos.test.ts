import { armarFechaISO } from './fechaCampos';

describe('armarFechaISO', () => {
  it('los 3 campos vacíos → null (nada cargado)', () => {
    expect(armarFechaISO('', '', '')).toBeNull();
    expect(armarFechaISO('  ', '  ', '  ')).toBeNull();
  });

  it('los 3 cargados y válidos → YYYY-MM-DD, con ceros a la izquierda', () => {
    expect(armarFechaISO('5', '3', '2024')).toBe('2024-03-05');
    expect(armarFechaISO('05', '03', '2024')).toBe('2024-03-05');
  });

  it('incompleta (falta alguno) → undefined (error de validación)', () => {
    expect(armarFechaISO('5', '3', '')).toBeUndefined();
    expect(armarFechaISO('', '3', '2024')).toBeUndefined();
    expect(armarFechaISO('5', '', '2024')).toBeUndefined();
  });

  it('fecha calendario inválida (32 de enero, mes 13) → undefined', () => {
    expect(armarFechaISO('32', '1', '2024')).toBeUndefined();
    expect(armarFechaISO('1', '13', '2024')).toBeUndefined();
  });

  it('29 de febrero en año bisiesto es válido; en año no bisiesto no', () => {
    expect(armarFechaISO('29', '2', '2024')).toBe('2024-02-29');
    expect(armarFechaISO('29', '2', '2023')).toBeUndefined();
  });

  it('año con menos de 4 dígitos → undefined', () => {
    expect(armarFechaISO('5', '3', '24')).toBeUndefined();
  });
});

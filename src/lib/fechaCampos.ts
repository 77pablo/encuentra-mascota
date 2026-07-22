// Arma una fecha 'YYYY-MM-DD' desde 3 campos de texto sueltos (día/mes/año),
// el mismo patrón que ya usa RegisterScreen para la fecha de nacimiento: sin
// DateTimePicker nativo en el repo, tres inputs numéricos funcionan igual en
// web y en móvil.
//
// Contrato (pensado para el carnet de "Mi mascota", donde las 4 fechas son
// OPCIONALES):
//   - los 3 vacíos            → null       (nada cargado, campo se omite)
//   - alguno cargado y otro no → undefined  (fecha a medio llenar: error)
//   - los 3 cargados pero no arman una fecha real (32 de enero, 29 de
//     febrero en año no bisiesto, etc.) → undefined
//   - los 3 cargados y válidos → 'YYYY-MM-DD'
//
// El año NO se rellena con ceros a propósito (mismo motivo que
// RegisterScreen): si el usuario escribe menos de 4 dígitos, no adivinamos un
// año absurdo como 0005, lo tratamos como incompleto.
export function armarFechaISO(dia: string, mes: string, anio: string): string | null | undefined {
  const d = dia.trim();
  const m = mes.trim();
  const a = anio.trim();

  if (!d && !m && !a) return null;
  if (!d || !m || !a) return undefined;
  if (!/^\d{4}$/.test(a)) return undefined;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m)) return undefined;

  const diaN = Number(d);
  const mesN = Number(m);
  const anioN = Number(a);
  if (mesN < 1 || mesN > 12 || diaN < 1 || diaN > 31) return undefined;

  // Validamos que la fecha sea real construyéndola y verificando que no haya
  // "desbordado" (p. ej. 31 de febrero se corre a marzo).
  const fecha = new Date(anioN, mesN - 1, diaN);
  if (
    fecha.getFullYear() !== anioN ||
    fecha.getMonth() !== mesN - 1 ||
    fecha.getDate() !== diaN
  ) {
    return undefined;
  }

  return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

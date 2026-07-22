// Edad legible en español a partir de una fecha de nacimiento (carnet de "Mi
// mascota", Función 6). Lógica pura, sin red y sin `Date.now()` suelto: `hoy`
// SIEMPRE llega como parámetro para que sea testeable de forma determinista.
//
// Reglas de formato (de más a menos granular):
//   - 1+ año: "2 años" o "2 años y 3 meses" (si además hay meses sueltos).
//   - menos de 1 año, 1+ mes: "8 meses" / "1 mes".
//   - menos de 1 mes, 1+ semana: "3 semanas" / "1 semana".
//   - menos de 1 semana: "2 días" / "1 día", y "recién nacida" si es hoy mismo.
//   - fecha futura o inválida: null (nunca lanza).

const DIA_MS = 24 * 60 * 60 * 1000;

function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? singular : plural_;
}

export function edadDesde(fechaNacimiento: string, hoy: Date): string | null {
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return null;
  if (nacimiento.getTime() > hoy.getTime()) return null;

  let años = hoy.getFullYear() - nacimiento.getFullYear();
  let meses = hoy.getMonth() - nacimiento.getMonth();
  const díasCalendario = hoy.getDate() - nacimiento.getDate();
  if (díasCalendario < 0) meses -= 1;
  if (meses < 0) {
    años -= 1;
    meses += 12;
  }

  if (años >= 1) {
    const base = `${años} ${plural(años, 'año', 'años')}`;
    return meses > 0 ? `${base} y ${meses} ${plural(meses, 'mes', 'meses')}` : base;
  }

  if (meses >= 1) {
    return `${meses} ${plural(meses, 'mes', 'meses')}`;
  }

  const díasTotales = Math.floor((hoy.getTime() - nacimiento.getTime()) / DIA_MS);
  if (díasTotales === 0) return 'recién nacida';

  const semanas = Math.floor(díasTotales / 7);
  if (semanas >= 1) return `${semanas} ${plural(semanas, 'semana', 'semanas')}`;

  return `${díasTotales} ${plural(díasTotales, 'día', 'días')}`;
}

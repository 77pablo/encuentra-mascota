// Elige singular o plural para una etiqueta que acompaña a un número.
//
// La regla del español no es "n > 1" sino "n === 1": con cero va el PLURAL
// ("0 reencuentros", no "0 reencuentro"), al revés de lo que uno copiaría de
// una librería pensada en inglés.
export function pluralizar(n: number, singular: string, plural: string): string {
  return Math.abs(n) === 1 ? singular : plural;
}

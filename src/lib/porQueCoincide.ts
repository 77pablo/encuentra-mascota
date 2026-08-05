// POR QUE COINCIDE — traduce el desglose de `buscar_coincidencias` (0065).
//
// Hasta la tanda 14 el `puntaje` se calculaba, la RPC lo devolvia, estaba
// tipado en services/busqueda.ts y NINGUNA pantalla lo leia: el orden de las
// coincidencias era inexplicable para quien lo miraba.
//
// EL TONO: esto explica por que dos fichas se parecen. NO afirma identidad.
// Decir "es tu mascota" a quien esta buscando y equivocarse es cruel, y el
// chip mismo puede estar mal tipeado.

const RAZONES: Array<[string, string]> = [
  ['chip', 'El número de chip coincide'],
  ['foto', 'La foto se parece'],
  ['color', 'Coincide el color'],
  ['tamano', 'Coincide el tamaño'],
  ['cerca', 'Fue visto cerca'],
];

export function porQueCoincide(porque: Record<string, boolean> | null): string[] {
  if (!porque) return [];
  return RAZONES.filter(([clave]) => porque[clave] === true).map(([, texto]) => texto);
}

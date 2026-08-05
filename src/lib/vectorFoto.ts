// VECTOR DE FOTO — logica pura del area B (tanda 14).
//
// PURO A PROPOSITO: no importa el modelo ni toca la red, asi que jest lo puede
// probar sin bajar 40 MB. El que carga el modelo es services/vectorFoto.ts.

export const DIMENSIONES = 512;

export function normalizar(v: number[]): number[] {
  let suma = 0;
  for (const x of v) suma += x * x;
  const norma = Math.sqrt(suma);
  // Un vector de ceros dividido por su norma es NaN en toda posicion, y un NaN
  // adentro de pgvector rompe el indice entero, no solo esa fila.
  if (norma === 0) return v.slice();
  return v.map((x) => x / norma);
}

export function coseno(a: number[], b: number[]): number {
  // Largos distintos no es un caso "raro": es un modelo cambiado a mitad de
  // camino. Devolver 0 lo deja fuera del match en vez de inventar un parecido.
  if (a.length !== b.length || a.length === 0) return 0;
  let punto = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    punto += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return punto / (Math.sqrt(na) * Math.sqrt(nb));
}

export function esVectorValido(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length !== DIMENSIONES) return false;
  return v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

// EL MENSAJE DEL BOTÓN "Sumar mis fotos" (PetDetailScreen), final fix B6.
// `calcularYGuardar` es best-effort por foto: con varias fotos, algunas
// pueden sumar y otras no (una caída de red a mitad de camino, por ejemplo).
// Antes sólo existían "todas" ("Listo") o "ninguna" ("No se pudo calcular,
// probá de nuevo") — el caso de en medio (3 de 5) caía en la rama de éxito
// total y mentía sobre las 2 que fallaron.
export function resumenSumarVector(
  exitos: number,
  total: number,
): { titulo: string; mensaje: string } {
  if (total === 0 || exitos === total) {
    return { titulo: 'Listo', mensaje: 'Tus fotos ya suman al matching.' };
  }
  if (exitos === 0) {
    return { titulo: 'No se pudo calcular', mensaje: 'Probá de nuevo en un rato.' };
  }
  return {
    titulo: 'Listo a medias',
    mensaje: `Sumamos ${exitos} de ${total} fotos. Probá de nuevo más tarde con el resto.`,
  };
}

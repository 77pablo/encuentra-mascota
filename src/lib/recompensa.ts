// LA RECOMPENSA SE ANUNCIA, EL MONTO NO SE PUBLICA.
//
// PetFBI es explícito: nunca se publica la cifra. Atrae estafadores ("tengo a tu
// perro, transferime"), incentiva a perseguir al animal —que con un perro asustado
// es la forma más rápida de que termine debajo de un auto— y habilita la extorsión.
// Lost Dogs of America va más lejos y directamente desaconseja ofrecer recompensa.
//
// Nos quedamos en el medio: se puede señalar que HAY recompensa (sirve, mueve
// gente), nunca cuánto.
//
// Los reportes VIEJOS tienen la cifra guardada en `pets.recompensa` y ahí se
// queda: no hay migración destructiva, no se borra el dato de nadie. Lo que
// cambia es la vista, y por eso `tieneRecompensa()` solo mira si hay algo, sin
// devolver nunca el contenido.

// Lo único que se dibuja donde antes iba la cifra.
export const ETIQUETA_RECOMPENSA = 'Hay recompensa';

// Lo que guarda el interruptor de los formularios. La columna sigue siendo `text`
// (cambiarla a boolean sería destructivo para los reportes viejos), así que el
// "sí" es un centinela: hace verdadero el filtro del servidor
// (`coalesce(trim(p.recompensa), '') <> ''`, migraciones 0014/0015/0021/0028) sin
// ser una cifra.
export const RECOMPENSA_SI = 'sí';

// ¿Este reporte ofrece recompensa? Devuelve un booleano A PROPÓSITO: quien la
// llama no se queda con el texto en la mano, así que no puede imprimirlo sin
// querer. Vale igual para el centinela nuevo y para el "$50.000" de un reporte
// de hace seis meses.
export function tieneRecompensa(valor: string | null | undefined): boolean {
  return (valor ?? '').trim().length > 0;
}

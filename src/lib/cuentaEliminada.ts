// Cómo se nombra a alguien que borró su cuenta.
//
// La lápida guarda `nombre = 'Cuenta eliminada'` porque la base no permite un
// nombre vacío, pero la decisión de qué mostrar es de la interfaz y depende del
// contexto: en el chat conviene decir "Cuenta eliminada" (explica por qué no se
// puede responder), y en las pistas "Un vecino" (ahí el dato es lo que importa,
// no quién lo dejó). Por eso mandamos siempre sobre `eliminadoEn` y nunca sobre
// el texto del nombre.

export const ETIQUETA_CUENTA_ELIMINADA = 'Cuenta eliminada';

export function nombreDeAutor(nombre: string | null, eliminadoEn: string | null): string {
  if (eliminadoEn) return ETIQUETA_CUENTA_ELIMINADA;
  const limpio = (nombre ?? '').trim();
  return limpio || 'Usuario';
}

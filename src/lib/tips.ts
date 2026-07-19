// PISTAS DEL BARRIO — lógica pura: validación, ordenamiento, permisos y firma.
// Sin red ni imports de Supabase, para poder probarla sola.

// Una pista es un dato suelto ("lo vi cruzando la plaza"), no un relato: con
// 500 caracteres sobra y evita paredes de texto en la ficha.
export const TIP_MAX = 500;

export type Tip = {
  id: string;
  petId: string;
  userId: string;
  texto: string;
  creadoEn: string;
  /** Nombre del autor cuando la sesión permite resolverlo; null para el invitado. */
  autorNombre?: string | null;
  /** Fecha en que el autor borró su cuenta, si la borró. */
  autorEliminadoEn?: string | null;
};

export type ValidacionTip = { ok: true; texto: string } | { ok: false; error: string };

// Limpia los bordes y verifica que quede algo publicable.
export function validarTip(texto: string): ValidacionTip {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: 'Escribí algo para dejar tu pista.' };
  if (limpio.length > TIP_MAX) {
    return { ok: false, error: `La pista es muy larga: máximo ${TIP_MAX} caracteres.` };
  }
  return { ok: true, texto: limpio };
}

// Más nuevas primero. No muta el arreglo que recibe.
export function ordenarTips(tips: Tip[]): Tip[] {
  return [...tips].sort(
    (a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime(),
  );
}

// Borra el autor de la pista o el dueño del reporte (mismo criterio que la RLS
// de 0012). El invitado (userId nulo) nunca puede borrar.
export function puedeBorrarTip(tip: Tip, userId: string | null, duenoPetId: string): boolean {
  if (!userId) return false;
  return userId === tip.userId || userId === duenoPetId;
}

// Cómo se firma la pista. Sin sesión no se puede leer `profiles`, así que la
// pista igual se muestra: el texto es lo que importa. Si el autor borró su
// cuenta pasa lo mismo — la pista le sigue sirviendo a quien busca su mascota.
export function firmaAutor(nombre: string | null, eliminadoEn?: string | null): string {
  if (eliminadoEn) return 'Un vecino';
  const limpio = (nombre ?? '').trim();
  return limpio || 'Un vecino';
}

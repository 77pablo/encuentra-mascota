// CICLO DE VIDA DE UNA PUBLICACIÓN DE ADOPCIÓN — lógica pura (sin red).
//
// Espejo de `cicloVida.ts` (reportes perdidos, migración 0028), con el mismo
// reparto de responsabilidades: la verdad de la VISIBILIDAD la tiene Postgres
// (`buscar_adopciones` con la condición de vigencia, migración 0052); acá
// derivamos el flag para realzar y ofrecer "reactivar" en Mis publicaciones.
//
// Dos diferencias con los reportes, y ninguna es cosmética:
//
//  1. EL UMBRAL ES MÁS LARGO. Un reporte de mascota perdida se resuelve o se
//     enfría en semanas; una publicación de adopción es un catálogo. Un refugio
//     con 40 animales no puede renovar cada mes y medio, y si el auto-archivado
//     se le come las publicaciones le rompimos la app justo a quien queremos
//     servir. 90 días ≈ una estación: suficiente para que un aviso abandonado
//     salga solo, holgado para quien de verdad sigue buscando familia.
//
//  2. `renovado_en` AUSENTE ≠ `renovado_en` EN NULL. Ausente (undefined)
//     significa que la migración 0052 todavía no corrió: PostgREST ni siquiera
//     devuelve la clave. En ese caso NADA está en pausa, porque la RPC vieja
//     tampoco filtra por vigencia y la publicación sigue perfectamente visible.
//     Si cayéramos a `creado_en`, le diríamos "en pausa" a algo que está al
//     aire y mandaríamos al dueño a tocar un botón que no puede funcionar (el
//     update escribiría en una columna que no existe).

export const DIAS_VIGENCIA_ADOPCION = 90;

const DIA_MS = 24 * 60 * 60 * 1000;

// Lo mínimo que hace falta de una publicación. `renovado_en` es opcional Y
// nullable a propósito: ver el punto 2 de arriba.
export interface VigenciaAdopcion {
  creado_en: string;
  renovado_en?: string | null;
  adoptada_en?: string | null;
}

/**
 * Días enteros desde la última renovación (o desde la creación, si la fila es
 * anterior al backfill). `null` cuando la columna no vino: no hay reloj que
 * leer y ningún llamador debería inventarse uno.
 */
export function diasDesdeRenovacionAdopcion(
  a: { creado_en: string; renovado_en?: string | null },
  now: number = Date.now(),
): number | null {
  if (!('renovado_en' in a)) return null;
  const base = a.renovado_en ?? a.creado_en;
  return Math.floor((now - new Date(base).getTime()) / DIA_MS);
}

/**
 * "En pausa" = pasaron 90+ días sin renovar, así que la publicación ya salió
 * sola del feed. La que encontró familia nunca entra acá: está cerrada con su
 * final feliz, no archivada por abandono.
 */
export function enPausa(a: VigenciaAdopcion, now: number = Date.now()): boolean {
  if (a.adoptada_en) return false;
  const dias = diasDesdeRenovacionAdopcion(a, now);
  if (dias === null) return false;
  return dias >= DIAS_VIGENCIA_ADOPCION;
}

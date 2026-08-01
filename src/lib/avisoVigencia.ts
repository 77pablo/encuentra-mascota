import { Pet } from '../services/pets';
import {
  CicloFields,
  DIAS_SEGUNDO_NUDGE,
  DIAS_VENCIMIENTO,
  diasDesdeRenovacion,
  vencido,
} from './cicloVida';
import { isReunited } from './reunion';

// AVISO DE VIGENCIA — lógica pura (sin red) para un banner que se ve SIN tener
// que abrir la ficha del reporte.
//
// El problema: a los 45 días el reporte sale de las búsquedas (migración 0028)
// y del motor de coincidencias (0029), en silencio total. El único aviso que
// existía era `NudgeVigencia`, que solo se pinta si el dueño entra a su propio
// reporte — justo lo que deja de hacer cuando pasan las semanas y se le apaga
// la esperanza. Se entera de que su reporte está apagado cuando ya lo está.
//
// Por qué acá y no en la cola de avisos: "tu reporte vence en X días" es un
// hecho real y sería un push legítimo, pero un tipo nuevo de aviso exige
// migración + tocar la Edge Function, y esta tanda va sin migraciones. Esto es
// lo honesto que se puede hacer solo del lado del cliente.
//
// El primer tramo (14 días) NO dispara este banner: de eso ya se encarga el
// nudge dentro de la ficha, y duplicarlo en Inicio sería ruido. El banner
// arranca en el SEGUNDO umbral (30 días), que hasta ahora estaba declarado y
// no lo usaba ninguna lógica.

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'tu perro',
  gato: 'tu gato',
  otro: 'tu mascota',
};

export type TipoAvisoVigencia = 'porVencer' | 'vencido';

export interface AvisoVigencia {
  tipo: TipoAvisoVigencia;
  /** Cuántos reportes propios están en ese estado. */
  cantidad: number;
  /** Días que le quedan al MÁS urgente antes de salir de las búsquedas (0 si ya venció). */
  diasRestantes: number;
  titulo: string;
  detalle: string;
}

type ReporteVigencia = CicloFields & Pick<Pet, 'nombre' | 'especie'>;

function comoSeLlama(pet: ReporteVigencia): string {
  return pet.nombre?.trim() || especieLabel[pet.especie];
}

// Los reportes propios que siguen en juego: ni cerrados ni con final feliz.
function enJuego(pet: ReporteVigencia): boolean {
  return pet.activo !== false && !isReunited(pet);
}

export function avisoDeVigencia(
  reportes: ReporteVigencia[],
  now: number = Date.now(),
): AvisoVigencia | null {
  const vivos = reportes.filter(enJuego);
  // Del más viejo al más nuevo: el primero de cada grupo es el más urgente.
  const porDias = [...vivos].sort(
    (a, b) => diasDesdeRenovacion(b, now) - diasDesdeRenovacion(a, now),
  );

  const vencidos = porDias.filter((p) => vencido(p, now));
  // Lo vencido gana: ese reporte YA está fuera de las búsquedas y del motor de
  // coincidencias. El daño no es futuro, está ocurriendo.
  if (vencidos.length > 0) {
    const uno = vencidos.length === 1;
    return {
      tipo: 'vencido',
      cantidad: vencidos.length,
      diasRestantes: 0,
      titulo: uno
        ? `El reporte de ${comoSeLlama(vencidos[0])} está en pausa`
        : `${vencidos.length} reportes tuyos están en pausa`,
      detalle: uno
        ? 'Pasaron los días sin renovarlo y salió de las búsquedas y del mapa. Lo traés de vuelta con un toque.'
        : 'Pasaron los días sin renovarlos y salieron de las búsquedas y del mapa. Los traés de vuelta con un toque.',
    };
  }

  const porVencer = porDias.filter((p) => diasDesdeRenovacion(p, now) >= DIAS_SEGUNDO_NUDGE);
  if (porVencer.length === 0) return null;

  const diasRestantes = DIAS_VENCIMIENTO - diasDesdeRenovacion(porVencer[0], now);
  const uno = porVencer.length === 1;
  const cuantos = diasRestantes === 1 ? 'queda 1 día' : `quedan ${diasRestantes} días`;
  return {
    tipo: 'porVencer',
    cantidad: porVencer.length,
    diasRestantes,
    titulo: uno
      ? `A ${comoSeLlama(porVencer[0])} le ${cuantos} de búsqueda`
      : `${porVencer.length} reportes tuyos están por vencer`,
    detalle: uno
      ? 'Si no lo renovás, sale de las búsquedas y del mapa. Contanos que sigue perdido y el reloj vuelve a cero.'
      : `Al más viejo le ${cuantos}. Si no los renovás, salen de las búsquedas y del mapa.`,
  };
}

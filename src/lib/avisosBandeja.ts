// LA PARTE PURA DE LA BANDEJA DE AVISOS (migración 0051).
//
// Nada de red ni de Supabase acá: solo "cómo se lee un aviso" y "cuántos hay sin
// leer". Es lo que se puede probar sin montar React, y es justo lo que importa
// cuando el correo y el push no llegaron — el texto de esta tarjeta pasa a ser
// la única forma de enterarse.
//
// El TONO: quien lee acaba de perder a su animal. Nada de signos de exclamación
// ni de celebrar antes de tiempo; una coincidencia es una posibilidad, no una
// buena noticia confirmada.

export interface Aviso {
  id: string;
  // `string` y no una unión cerrada a propósito: el CHECK de
  // `notification_events.tipo` lo amplían otras migraciones (y otra tarea de
  // esta misma tanda suma 'avistamiento_anonimo'). Un tipo que este cliente no
  // conoce tiene que MOSTRARSE con un texto genérico, no desaparecer.
  tipo: string;
  pet_id: string | null;
  datos: Record<string, unknown>;
  creado_en: string;
}

export interface AvisoPresentado {
  titulo: string;
  detalle: string | null;
  icono: string;
}

// Tope del detalle. La cola guarda extractos ya recortados (120 o 500 según el
// encolador), pero el recorte del que muestra no puede depender de que el que
// escribe se haya acordado.
const TOPE_DETALLE = 200;

function texto(datos: Record<string, unknown>, clave: string): string | null {
  const v = datos[clave];
  if (typeof v !== 'string') return null;
  const limpio = v.trim();
  if (!limpio) return null;
  return limpio.length > TOPE_DETALLE ? `${limpio.slice(0, TOPE_DETALLE - 1)}…` : limpio;
}

// Cómo se lee cada aviso. `datos` viene tal cual de la cola, así que todo se
// lee a la defensiva: una clave que falta da un texto sin ella, nunca
// "undefined" en pantalla.
export function textoDeAviso(a: Aviso): AvisoPresentado {
  const d = a.datos ?? {};

  switch (a.tipo) {
    case 'avistamiento':
      return {
        titulo: 'Alguien la vio',
        detalle:
          texto(d, 'nota') ??
          'Marcaron un punto donde la vieron. Abrí el reporte para ver dónde.',
        icono: 'eye-outline',
      };

    case 'pista':
      return {
        titulo: 'Te dejaron una pista',
        detalle: texto(d, 'extracto') ?? 'Alguien escribió algo en tu reporte.',
        icono: 'chatbubble-ellipses-outline',
      };

    case 'coincidencia': {
      // `match_estado` es el estado del OTRO reporte, el que calza. Sin él no se
      // puede afirmar de qué se trata, así que se dice de forma neutra.
      const otro = texto(d, 'match_estado');
      const detalle =
        otro === 'encontrada'
          ? 'Publicaron una mascota encontrada que se parece a la que buscás. Fijate si es.'
          : otro === 'perdida'
            ? 'Publicaron una mascota perdida que se parece a la que encontraste. Fijate si es.'
            : 'Hay un reporte cerca que se parece al tuyo. Fijate si es.';
      return { titulo: 'Puede que sea la tuya', detalle, icono: 'git-compare-outline' };
    }

    case 'escaneo_collar': {
      const nombre = texto(d, 'nombre_mascota');
      return {
        titulo: nombre ? `Escanearon la placa de ${nombre}` : 'Escanearon la placa de tu mascota',
        detalle: texto(d, 'nota') ?? 'Alguien leyó el código del collar.',
        icono: 'qr-code-outline',
      };
    }

    case 'busqueda_guardada': {
      const comuna = texto(d, 'comuna');
      const estado = texto(d, 'estado');
      const que =
        estado === 'perdida'
          ? 'Publicaron una mascota perdida'
          : estado === 'encontrada'
            ? 'Publicaron una mascota encontrada'
            : 'Publicaron un reporte';
      return {
        titulo: 'Apareció algo de lo que buscás',
        detalle: comuna ? `${que} en ${comuna}.` : `${que} que calza con tu búsqueda.`,
        icono: 'search-outline',
      };
    }

    default:
      // Tipo desconocido para esta versión del cliente. Se muestra igual: un
      // aviso que no se sabe nombrar sigue siendo un aviso, y esconderlo es
      // volver al problema que esta pantalla vino a resolver.
      return {
        titulo: 'Tenés una novedad',
        detalle: texto(d, 'nota') ?? texto(d, 'extracto'),
        icono: 'notifications-outline',
      };
  }
}

// Cuántos avisos son posteriores a la última vez que la persona abrió la
// bandeja. La "última visita" se guarda LOCAL (ver src/lib/visitaAvisos.ts): no
// hace falta ninguna columna ni migración extra para el badge.
//
// Estrictamente MAYOR: el aviso que tiene la marca exacta de la visita ya se
// vio. Con `>=`, el badge se quedaría pegado en 1 después de entrar.
//
// Una marca ilegible (o ausente) se trata como "nunca entró", o sea todos
// nuevos. Es la degradación segura: un badge de menos es un aviso que nadie
// mira nunca.
export function contarSinLeer(avisos: { creado_en: string }[], ultimaVisita: string | null): number {
  const corte = ultimaVisita ? Date.parse(ultimaVisita) : NaN;
  if (Number.isNaN(corte)) return avisos.length;
  return avisos.filter((a) => {
    const t = Date.parse(a.creado_en);
    // Una fecha rota del lado del aviso también cuenta como nueva, por el mismo
    // motivo.
    return Number.isNaN(t) || t > corte;
  }).length;
}

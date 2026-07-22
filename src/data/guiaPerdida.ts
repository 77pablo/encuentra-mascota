// Contenido de la guía "recién se me perdió": una checklist calmada para la
// primera hora, cuando la persona está angustiada y no sabe por dónde empezar.
//
// Vive como DATOS (no hardcodeado en la pantalla) para poder testearlo y
// reordenarlo sin tocar la UI. Cada paso puede tener una `accion` opcional que
// engancha con algo que la app YA hace hoy. Regla de diseño importante: los
// pasos que mencionan otras funciones (coincidencias, mi mascota, ciclo de
// vida) son SOLO texto —sin `accion`— para que la guía funcione sola aunque
// esas funciones todavía no estén; nunca navegamos a una pantalla que no exista.

// Pantallas que ya existen en la app y a las que un paso puede navegar. Si un
// enlace apuntaría a algo que aún no existe, el paso queda como texto sin acción.
export const RUTAS_GUIA = ['Publicar', 'Explorar', 'Ayuda'] as const;

export type RutaGuia = (typeof RUTAS_GUIA)[number];

export interface GuiaAccion {
  /** Texto del botón, cálido y en primera persona. */
  label: string;
  /** Pantalla ya existente a la que se navega. */
  ruta: RutaGuia;
  /** Parámetros opcionales de navegación. */
  params?: Record<string, unknown>;
}

export interface GuiaPaso {
  /** Slug estable (se usa como clave del progreso guardado). */
  id: string;
  titulo: string;
  detalle: string;
  /** Acción opcional; si falta, el paso es solo lectura. */
  accion?: GuiaAccion;
}

export const GUIA_PERDIDA: readonly GuiaPaso[] = [
  {
    id: 'respira-y-busca-cerca',
    titulo: 'Respira y busca cerca primero',
    detalle:
      'La mayoría aparece a pocas cuadras. Recorre la casa y el barrio con calma, ' +
      'revisa rincones, patios y autos donde pueda esconderse, y llámala con tu ' +
      'tono de siempre. Muchas veces está más cerca de lo que crees.',
  },
  {
    id: 'publica-el-reporte',
    titulo: 'Publica el reporte',
    detalle:
      'Deja un reporte con foto, señas y la última zona donde la viste. Es lo que ' +
      'hace que el barrio y quienes andan cerca puedan reconocerla y avisarte.',
    accion: {
      label: 'Publicar mi reporte',
      ruta: 'Publicar',
      params: { estado: 'perdida' },
    },
  },
  {
    id: 'difunde-con-el-afiche',
    titulo: 'Difunde con un afiche',
    detalle:
      'Desde tu reporte puedes crear un afiche para imprimir y pegar en almacenes, ' +
      'plazas y postes de la cuadra. Una foto grande y clara, con tu comuna, ayuda ' +
      'a que alguien la reconozca al pasar.',
  },
  {
    id: 'avisa-a-tu-barrio',
    titulo: 'Avisa a tu barrio',
    detalle:
      'Comparte el reporte en tus grupos de vecinos y sigue tu comuna para estar al ' +
      'tanto de lo que se mueve cerca. Mientras más ojos, mejor: el barrio es tu ' +
      'mejor aliado en las primeras horas.',
    accion: {
      label: 'Ir a mi comunidad',
      ruta: 'Explorar',
    },
  },
  {
    id: 'llama-veterinarias-y-refugios',
    titulo: 'Llama a veterinarias y refugios cercanos',
    detalle:
      'Pregunta si llegó una mascota con sus señas y deja tu contacto por si aparece. ' +
      'Si tiene chip, ten el número a mano: en una veterinaria pueden leerlo y dar ' +
      'contigo. Vuelve a llamar los días siguientes; a veces llegan después.',
    accion: {
      label: 'Ver veterinarias y refugios',
      ruta: 'Ayuda',
    },
  },
  {
    id: 'revisa-avistamientos',
    titulo: 'Revisa los avistamientos',
    detalle:
      'Vuelve a tu reporte para leer los avistamientos y pistas que deje la gente. ' +
      'Si alguien la vio, cada dato de dónde y cuándo te acerca. Te avisamos cuando ' +
      'aparezca algo que calce con lo que buscas.',
  },
  {
    id: 'no-te-rindas',
    titulo: 'No te rindas los primeros días',
    detalle:
      'Muchas vuelven a casa después de varios días. Mantén el reporte al día con la ' +
      'última información y sigue difundiendo. Cuídate tú también: descansa y come ' +
      'algo; la búsqueda es más larga de lo que parece.',
  },
];

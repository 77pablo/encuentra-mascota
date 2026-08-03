// Contenido de la guía "recién se me perdió": una checklist calmada para la
// primera hora, cuando la persona está angustiada y no sabe por dónde empezar.
//
// Vive como DATOS (no hardcodeado en la pantalla) para poder testearlo y
// reordenarlo sin tocar la UI. Cada paso puede tener una `accion` opcional que
// engancha con algo que la app YA hace hoy. Regla de diseño importante: los
// pasos que mencionan otras funciones (coincidencias, mi mascota, ciclo de
// vida) son SOLO texto —sin `accion`— para que la guía funcione sola aunque
// esas funciones todavía no estén; nunca navegamos a una pantalla que no exista.
//
// Estos mismos pasos los REUSA `src/lib/planBusqueda.ts` (el plan con reloj por
// especie), que los ubica en la ventana de tiempo que les corresponde y les
// suma los pasos específicos de perro o de gato. Si tocás un texto de acá, lo
// tocás también allá: por eso el plan no copia nada, referencia por id.

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
    titulo: 'Respirá y buscá cerca primero',
    detalle:
      'La mayoría aparece a pocas cuadras. Recorré la casa y el barrio con calma, ' +
      'revisá rincones, patios y autos donde pueda esconderse, y llamalo con tu ' +
      'tono de siempre. Muchas veces está más cerca de lo que creés.',
  },
  {
    id: 'publica-el-reporte',
    titulo: 'Publicá el reporte',
    detalle:
      'Dejá un reporte con foto, señas y la última zona donde lo viste. Es lo que ' +
      'hace que el barrio y quienes andan cerca puedan reconocerlo y avisarte.',
    accion: {
      label: 'Publicar mi reporte',
      ruta: 'Publicar',
      params: { estado: 'perdida' },
    },
  },
  {
    id: 'difunde-con-el-afiche',
    titulo: 'Pegá afiches grandes en las esquinas',
    detalle:
      'Desde tu reporte podés crear un afiche para imprimir. Que sea grande y en ' +
      'papel fluorescente: una hoja blanca tamaño carta no la lee nadie desde un ' +
      'auto. Pegalos en las esquinas de más tráfico —semáforos, paraderos, la ' +
      'entrada del almacén—, con la foto enorme y tu teléfono en números gigantes.',
  },
  {
    id: 'avisa-a-tu-barrio',
    titulo: 'Avisá a tu barrio',
    // Reducido a propósito (tanda 14, A4): el "a quién avisarle" —el grupo de
    // WhatsApp, la junta de vecinos, el almacén— ya lo sugiere y lo REGISTRA
    // el tablero de difusión de tu reporte, con casillas de "ya avisé". Acá
    // sólo queda el porqué; repetir la lista sería duplicar lo que el tablero
    // vino a resolver.
    detalle:
      'Mientras más ojos, mejor: el barrio es tu mejor aliado en las primeras horas. ' +
      'Anotá en el tablero a quién le fuiste avisando, así no repetís ni te olvidás ' +
      'de nadie.',
    accion: {
      label: 'Ir a mi comunidad',
      ruta: 'Explorar',
    },
  },
  {
    id: 'llama-veterinarias-y-refugios',
    titulo: 'Llamá a veterinarias y refugios cercanos',
    // Reducido a propósito (tanda 14, A4): la lista de veterinarias y refugios
    // CERCA TUYO, con dirección y botón a Maps, ya la arma el tablero de
    // difusión (que además registra a cuáles ya llamaste). Acá sólo queda lo
    // que el tablero no dice: qué contar por teléfono y el chip.
    detalle:
      'Contá las señas y dejá tu contacto. Si tiene chip, tené el número a mano: en ' +
      'una veterinaria pueden leerlo y dar con vos.',
    accion: {
      label: 'Ver veterinarias y refugios',
      ruta: 'Ayuda',
    },
  },
  {
    id: 'revisa-avistamientos',
    titulo: 'Revisá los avistamientos',
    detalle:
      'Volvé a tu reporte para leer los avistamientos y pistas que deje la gente. ' +
      'Si alguien lo vio, cada dato de dónde y cuándo te acerca. Te avisamos cuando ' +
      'aparezca algo que calce con lo que buscás.',
  },
  {
    id: 'no-te-rindas',
    titulo: 'No te rindas los primeros días',
    detalle:
      'Muchos vuelven a casa después de varios días. Mantené el reporte al día con la ' +
      'última información y seguí difundiendo. Cuidate vos también: descansá y comé ' +
      'algo; la búsqueda es más larga de lo que parece.',
  },
];

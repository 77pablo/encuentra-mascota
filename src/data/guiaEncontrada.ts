// Contenido de la guía "encontré una mascota" (Función 4, espejo de
// guiaPerdida.ts): checklist calmada para quien se encuentra una mascota y no
// sabe bien qué hacer. Mismo criterio de diseño que la guía de perdida: vive
// como DATOS (testeable, reordenable sin tocar la UI), y los pasos que
// mencionan algo que la app no hace hoy quedan como texto sin `accion`.

// Pantallas ya existentes a las que un paso puede navegar (dentro de la app).
export const RUTAS_GUIA_ENCONTRADA = ['Publicar', 'Ayuda', 'Explorar'] as const;
export type RutaGuiaEncontrada = (typeof RUTAS_GUIA_ENCONTRADA)[number];

export interface GuiaEncontradaAccion {
  /** Texto del botón, cálido y en primera persona. */
  label: string;
  /** Pantalla ya existente a la que se navega (dentro de la app). */
  ruta?: RutaGuiaEncontrada;
  /** Parámetros opcionales de navegación. */
  params?: Record<string, unknown>;
  /**
   * Link EXTERNO (fuera de la app), p.ej. el Registro Nacional de Mascotas.
   * Si está presente, `ruta` se ignora: la pantalla abre `url` con
   * `Linking.openURL` en vez de navegar.
   */
  url?: string;
}

export interface GuiaEncontradaPaso {
  /** Slug estable (se usa como clave del progreso guardado). */
  id: string;
  titulo: string;
  detalle: string;
  /** Acción opcional; si falta, el paso es solo lectura. */
  accion?: GuiaEncontradaAccion;
}

export const GUIA_ENCONTRADA: readonly GuiaEncontradaPaso[] = [
  {
    id: 'asegurala-sin-riesgo',
    titulo: 'Asegúrala sin arriesgarte',
    detalle:
      'Acércate con calma y ofrécele algo de comer o agua si tienes a mano. No la ' +
      'persigas ni la arrincones si se asusta: podría cruzar la calle o esconderse ' +
      'más lejos. Tu seguridad primero, la suya después.',
  },
  {
    id: 'revisa-el-chip',
    titulo: 'Revisá si tiene chip',
    detalle:
      'Muchas mascotas llevan un microchip que en segundos dice quién es su dueño. ' +
      'Cualquier veterinaria puede leerlo, y hacerlo es gratis: no hace falta que ' +
      'seas cliente para pedirlo.',
    accion: {
      label: 'Ver ayuda rápida',
      ruta: 'Ayuda',
    },
  },
  {
    id: 'sacale-fotos-claras',
    titulo: 'Sacale fotos claras',
    detalle:
      'De cuerpo entero y de la cara, con buena luz. Son las que van a hacer que ' +
      'alguien la reconozca en el reporte: mientras más nítidas, mejor.',
  },
  {
    id: 'publica-como-encontrada',
    titulo: 'Publicá el reporte como "Encontrada"',
    detalle:
      'Con foto, dónde la encontraste y sus señas. Es lo que hace que su dueño, si ' +
      'anda buscándola, pueda dar contigo.',
    accion: {
      label: 'Publicar como encontrada',
      ruta: 'Publicar',
      params: { estado: 'encontrada' },
    },
  },
  {
    id: 'avisa-en-la-comuna',
    titulo: 'Avisá en la comuna',
    detalle:
      'Revisá si alguien reportó una mascota perdida parecida cerca de donde la ' +
      'encontraste. Cuantos más ojos se enteren, más rápido aparece quien la busca.',
    accion: {
      label: 'Ver mi comunidad',
      ruta: 'Explorar',
    },
  },
  {
    id: 'cuidado-temporal',
    titulo: 'Dale un cuidado temporal responsable',
    detalle:
      'Mientras aparece su familia, mantenla segura, con agua y comida, separada de ' +
      'otras mascotas si no sabés cómo reacciona. Si no podés quedártela, un refugio ' +
      'o veterinaria de tu comuna puede ayudarte a alojarla unos días.',
  },
  {
    id: 'registro-nacional-de-mascotas',
    titulo: 'Registro Nacional de Mascotas',
    detalle:
      'Si tiene chip pero nadie responde, el Registro Nacional (Ley 21.020) puede ' +
      'ayudar a identificar a su dueño con ese número.',
    accion: {
      label: 'Ir al Registro Nacional de Mascotas',
      url: 'https://registratumascota.cl/',
    },
  },
];

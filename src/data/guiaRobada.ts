// Contenido de la guía "te la robaron" (Tanda 17). Espejo de guiaPerdida, pero
// con lo específico del robo: denuncia formal, no negociar ni pagar (la estafa
// más común es "tengo a tu perro, transferime"), y reunir pruebas de propiedad.
//
// Mismo tipo `GuiaPaso` que la guía de perdida, para reusar la pantalla y el
// patrón de acciones. Regla de diseño idéntica: un paso solo navega a pantallas
// que YA existen (RUTAS_GUIA); si no, queda como texto.
import type { GuiaPaso } from './guiaPerdida';

export const GUIA_ROBADA: readonly GuiaPaso[] = [
  {
    id: 'denuncia',
    titulo: 'Denunciá el robo a Carabineros o la PDI',
    detalle:
      'Hacé la denuncia formal y guardá el número de parte. Es lo que te respalda ' +
      'si después aparece en venta o alguien la tiene, y deja registro con fecha. ' +
      'Llevá una foto reciente y el número de chip si lo tenés.',
  },
  {
    id: 'no-negociar',
    titulo: 'No pagues ni negocies por adelantado',
    detalle:
      'Pedir dinero por devolverla es la estafa más común: “tengo a tu mascota, ' +
      'transferime”. No transfieras ni muestres el monto de una recompensa. Si ' +
      'alguien pide plata por adelantado, cortá y avisá a Carabineros — pedí ' +
      'siempre una prueba en vivo antes de cualquier encuentro, en un lugar público.',
  },
  {
    id: 'pruebas-de-propiedad',
    titulo: 'Reuní pruebas de que es tuya',
    detalle:
      'Juntá el número de chip, fotos con fecha, el carné de vacunas y cualquier ' +
      'testigo. Sirven para la denuncia y para reclamarla sin discusión si aparece.',
  },
  {
    id: 'difundir-robada',
    titulo: 'Difundí con la marca «Robada»',
    detalle:
      'Publicá el reporte marcándolo como robada y compartilo en los grupos del ' +
      'barrio y en Facebook. Un robo moviliza distinto que una pérdida: la gente ' +
      'mira las ventas de segunda mano y avisa.',
    accion: {
      label: 'Publicar el reporte',
      ruta: 'Publicar',
      params: { estado: 'perdida' },
    },
  },
  {
    id: 'registro-y-barrio',
    titulo: 'Avisá al Registro y a la red del barrio',
    detalle:
      'Registro Nacional de Mascotas, veterinarias de la zona y grupos vecinales. ' +
      'Cuantos más ojos, más difícil es que la vendan o la trasladen sin que alguien ' +
      'la reconozca.',
    accion: {
      label: 'Veterinarias y ayuda cerca',
      ruta: 'Ayuda',
    },
  },
];

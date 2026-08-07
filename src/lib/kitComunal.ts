import { RESPALDO_WEB } from './afiche';

// Kit de arranque comunal (Tanda 21): lo que una persona necesita para traer
// la app a su comuna — textos listos para pegar. Ataca el problema real de
// hoy: el arranque en frío. Tono cálido, sin humo, sin pedir nada.

// Metro solo inlinea `process.env.EXPO_PUBLIC_X` escrito LITERAL (lección de
// producción del 18-jul): no pasar `process.env` entero ni indexar dinámico.
export function urlSitio(): string {
  return process.env.EXPO_PUBLIC_WEB_URL || RESPALDO_WEB;
}

export interface MensajeKit {
  id: 'vecinos' | 'facebook' | 'veterinaria';
  titulo: string;
  texto: string;
}

export function mensajesKit(url: string = urlSitio()): MensajeKit[] {
  return [
    {
      id: 'vecinos',
      titulo: 'Para tu junta de vecinos o grupo del barrio',
      texto:
        `Vecinos: cuando se pierde una mascota en el barrio, ahora hay un lugar para avisar y buscar juntos: ${url}\n\n` +
        'Se publica gratis, cualquiera puede avisar que la vio SIN crear cuenta, y a los vecinos ' +
        'que quieran les llegan alertas de la zona. Mientras más seamos acá, más rápido vuelven a casa.',
    },
    {
      id: 'facebook',
      titulo: 'Para el grupo de Facebook de tu comuna',
      texto:
        `🐾 Si se te perdió tu mascota (o encontraste una), publicala acá: ${url}\n\n` +
        'Es gratis, hecho en Chile y no hace falta cuenta para avisar que la viste. Los avisos ' +
        'llegan a los vecinos de la misma zona, con mapa y afiche listo para imprimir.',
    },
    {
      id: 'veterinaria',
      titulo: 'Para dejar en una veterinaria o refugio',
      texto:
        `Hola: somos Encuentra tu Mascota (${url}), una app comunitaria y gratuita para reunir ` +
        'mascotas perdidas con su familia. Si les sirve, pueden mostrar las mascotas perdidas de la ' +
        `comuna en su propio sitio web con un widget gratis: ${url}/widget/ — y si llega alguien con ` +
        'una mascota encontrada, en la app puede avisar sin crear cuenta.',
    },
  ];
}

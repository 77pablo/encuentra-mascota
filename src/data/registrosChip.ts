// EL CONSULTOR DE MICROCHIP CHILENO — contenido y enlaces.
//
// Por qué existe: con chip, un perro perdido vuelve a casa en el 52,2% de los
// casos contra el 21,9% sin chip; en gatos la brecha es todavía más brutal
// (~38% contra ~2%). O sea que "¿tiene chip?" es, de lejos, la pregunta más
// rentable que puede hacerse alguien que se encontró una mascota.
//
// El problema chileno: el dato está PARTIDO. No hay una consulta unificada, y
// de los seis registros que circulan por las guías de internet, la mitad ya no
// existe. Lo que sigue se verificó A MANO el 1-ago-2026 (petición HTTP real,
// inspección del HTML del formulario):
//
//   VIVOS
//   · registratumascota.cl  → el registro del Estado (Ley 21.020). La consulta
//     pública vive en /consultas.xhtml y su formulario es JSF/PrimeFaces: POST
//     con ViewState y token CSRF. NO se puede pre-cargar el número por URL.
//     El campo se llama `consultasForm:microchip`, acepta 15 dígitos. Buscar es
//     libre; para que te den el contacto de la familia pide RUT + N° de serie
//     de la cédula chilena.
//   · datapet.cl/busca-un-chip → registro privado, sitio Wix. El buscador es un
//     widget de la propia página; tampoco acepta el número por URL.
//
//   MUERTOS (por eso están abajo, con el motivo: sirve para que la persona no
//   los googlee y termine en cualquier parte)
//   · microtag.cl, registroanimalchile.cl, registrocivildemascotas.cl,
//     zoodata.cl, chipmascotas.cl. Ver REGISTROS_CAIDOS.
//
// CONCLUSIÓN DE LA INVESTIGACIÓN: hoy NINGÚN registro chileno se puede
// consultar con el número en la URL. La pantalla rutea a mano y lo dice. El
// tipo deja el hueco abierto (`aceptaNumeroEnLaUrl` + `paramNumero`) para el
// día que alguno publique un GET: se cambia el dato, no la pantalla.
//
// Regla de este archivo: NO se enlaza un dominio sin haberlo abierto.
// `__tests__/lib/enlacesDeRegistrosChip.test.ts` lo vigila para todo `src/`.

/** Registro que hoy SÍ se puede abrir y consultar. */
export interface RegistroChip {
  /** Slug estable. */
  id: string;
  nombre: string;
  /** Qué te da consultarlo, en una frase honesta. */
  detalle: string;
  /** Página exacta de la consulta, verificada. Siempre https. */
  url: string;
  /** true = es el registro del Estado (Ley 21.020). */
  oficial: boolean;
  /** ¿Se puede mandar el número de chip en la URL? Hoy: ninguno. */
  aceptaNumeroEnLaUrl: boolean;
  /** Nombre del parámetro, si algún día alguno lo acepta. */
  paramNumero?: string;
}

/** Registro que figura en las guías de internet pero YA NO FUNCIONA. */
export interface RegistroCaido {
  id: string;
  /** Dominio pelado, sin esquema: no se enlaza a propósito. */
  dominio: string;
  /** Qué pasó cuando se verificó. Se le muestra a la persona. */
  motivo: string;
}

/** Página de inscripción del Registro Nacional (Ley 21.020). Gratis. */
export const URL_REGISTRO_NACIONAL = 'https://registratumascota.cl/inicio.xhtml';

/** Consulta pública por número de microchip del Registro Nacional. */
export const URL_CONSULTA_NACIONAL = 'https://registratumascota.cl/consultas.xhtml';

export const REGISTROS_CONSULTABLES: readonly RegistroChip[] = [
  {
    id: 'registro-nacional',
    nombre: 'Registro Nacional de Mascotas',
    detalle:
      'El del Estado, por la Ley 21.020. Buscás el número y, si está inscrito, te ' +
      'muestra especie, color y raza. Para que te pasen el contacto de la familia ' +
      'te va a pedir tu RUT y el número de serie de tu cédula.',
    url: URL_CONSULTA_NACIONAL,
    oficial: true,
    aceptaNumeroEnLaUrl: false,
  },
  {
    id: 'datapet',
    nombre: 'DATAPET',
    detalle:
      'Registro privado de microchips. Si el número está en su base, la ficha ' +
      'aparece al toque; si no, no muestra nada. Vale la pena probarlo: muchas ' +
      'veterinarias inscriben acá y no en el registro del Estado.',
    url: 'https://www.datapet.cl/busca-un-chip',
    oficial: false,
    aceptaNumeroEnLaUrl: false,
  },
];

export const REGISTROS_CAIDOS: readonly RegistroCaido[] = [
  {
    id: 'microtag',
    dominio: 'microtag.cl',
    motivo: 'El dominio ya no existe.',
  },
  {
    id: 'registro-animal-chile',
    dominio: 'registroanimalchile.cl',
    motivo:
      'Lo tomó una red de publicidad: su buscador de chip hoy devuelve una página ' +
      'de casinos online.',
  },
  {
    id: 'registro-civil-de-mascotas',
    dominio: 'registrocivildemascotas.cl',
    motivo:
      'Dominio estacionado y a la venta. Nunca tuvo relación con el Registro Civil.',
  },
  {
    id: 'zoodata',
    dominio: 'zoodata.cl',
    motivo: 'El sitio no responde.',
  },
  {
    id: 'chipmascotas',
    dominio: 'chipmascotas.cl',
    motivo: 'Redirige a una tienda de bicicletas.',
  },
];

/** Se DERIVA de la lista de arriba: nunca una segunda lista escrita a mano. */
export const DOMINIOS_CAIDOS: readonly string[] = REGISTROS_CAIDOS.map((r) => r.dominio);

/** Búsqueda del mapa del teléfono. Mismo patrón que AyudaScreen y `lib/mapas`:
 *  no mantenemos direcciones curadas porque se desactualizan solas. */
export interface BusquedaLector {
  id: string;
  titulo: string;
  sub: string;
  /** Lo que se escribe en el mapa. Genérico a propósito. */
  query: string;
}

export const BUSQUEDAS_LECTOR: readonly BusquedaLector[] = [
  {
    id: 'veterinaria',
    titulo: 'Veterinarias cerca',
    sub: 'Casi todas tienen lector y lo pasan gratis, seas cliente o no',
    query: 'veterinaria',
  },
  {
    id: 'municipalidad',
    titulo: 'Tu municipalidad',
    sub: 'Tenencia responsable: también tienen lector, y suelen inscribir gratis',
    query: 'municipalidad tenencia responsable de mascotas',
  },
  {
    id: 'urgencia',
    titulo: 'Veterinaria de urgencia',
    sub: 'Si es de noche o fin de semana',
    query: 'veterinaria de urgencia abierta ahora',
  },
];

/** Qué es un chip, para quien nunca escuchó del tema. Se lee de pie, en la calle. */
export const QUE_ES_UN_CHIP: readonly string[] = [
  'Es del tamaño de un grano de arroz y va bajo la piel, entre los omóplatos. Ni se nota ni le molesta.',
  'No es un GPS. No tiene batería ni antena, no sigue a nadie y no dice dónde está la mascota: solo guarda un número.',
  'Ese número es la llave. Si su familia lo inscribió, con él se llega a sus datos de contacto.',
  'Leerlo es gratis y toma segundos. Cualquier veterinaria tiene el lector y no hace falta que seas cliente.',
];

/** Host de una URL, en minúsculas y sin `www.`. '' si no es una URL. */
export function dominioDe(url: string): string {
  const m = /^https?:\/\/([^/?#\s]+)/i.exec(url.trim());
  if (!m) return '';
  return m[1].toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
}

/**
 * URL para consultar un número en un registro. Mientras ninguno acepte el
 * número por URL, devuelve la página pelada y la persona lo pega a mano.
 */
export function urlDeConsulta(registro: RegistroChip, numero?: string): string {
  const limpio = (numero ?? '').trim();
  if (!registro.aceptaNumeroEnLaUrl || !registro.paramNumero || !limpio) return registro.url;
  const sep = registro.url.includes('?') ? '&' : '?';
  return `${registro.url}${sep}${registro.paramNumero}=${encodeURIComponent(limpio)}`;
}

/** ¿Hay que copiar y pegar el número en cada sitio? Hoy sí, en todos. */
export function hayQuePegarElNumeroAMano(
  registros: readonly RegistroChip[] = REGISTROS_CONSULTABLES,
): boolean {
  return registros.every((r) => !r.aceptaNumeroEnLaUrl);
}

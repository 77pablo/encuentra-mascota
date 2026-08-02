// PLAN DE BÚSQUEDA CON RELOJ, POR ESPECIE.
//
// Por qué existe: la búsqueda física del vecindario resuelve el 49% de los
// casos en perros y el 30% en gatos —muy por encima de cualquier base de
// datos—, y la mediana de recuperación es de 2 días en perros y 5 en gatos. O
// sea: un plan sirve si está medido en HORAS. `src/data/guiaPerdida.ts` dice
// bien QUÉ hacer, pero lo dice igual para todos y sin reloj.
//
// Este módulo es PURO: no lee la base, no toca almacenamiento y —regla del
// repo, ver `recordatorios.ts` y `edadDesde.ts`— nunca llama a `new Date()`
// adentro. `ahora` entra siempre como parámetro para poder testearlo.
//
// No duplica contenido: los pasos generales se REFERENCIAN por id desde
// GUIA_PERDIDA (`desdeGuia: true`) y sólo se escriben acá los pasos que la guía
// no tenía, que son los que dependen de la especie y del temperamento.

import { GUIA_PERDIDA, GuiaAccion } from '../data/guiaPerdida';

export type Especie = 'perro' | 'gato' | 'otro';

/** Cómo reacciona el perro ante la gente cuando está suelto y asustado. */
export type Temperamento = 'asustadizo' | 'sociable' | 'desconocido';

/** Si el gato vivía puertas adentro o salía solo a la calle. */
export type Ambito = 'interior' | 'exterior' | 'desconocido';

export interface PerfilBusqueda {
  especie: Especie;
  temperamento?: Temperamento;
  ambito?: Ambito;
}

export type VentanaId = 'ahora' | 'hoy' | 'dia2' | 'dia5';

/** Estado de una ventana respecto del reloj: ya pasó, es la de ahora, o viene. */
export type EstadoVentana = 'pasada' | 'actual' | 'proxima';

/** Acción que sólo la pantalla anfitriona sabe hacer (el generador de afiches). */
export type AccionLocal = 'afiche';

export interface PasoCatalogo {
  id: string;
  ventana: VentanaId;
  /** El texto y la acción salen de GUIA_PERDIDA: acá no se copia nada. */
  desdeGuia?: true;
  titulo?: string;
  detalle?: string;
  accion?: GuiaAccion;
  accionLocal?: AccionLocal;
  /** Filtros del perfil. `undefined` = vale para todos. */
  especies?: readonly Especie[];
  temperamentos?: readonly Exclude<Temperamento, 'desconocido'>[];
  ambitos?: readonly Exclude<Ambito, 'desconocido'>[];
}

export interface PasoPlan {
  id: string;
  titulo: string;
  detalle: string;
  ventana: VentanaId;
  accion?: GuiaAccion;
  accionLocal?: AccionLocal;
}

export interface VentanaPlan {
  id: VentanaId;
  titulo: string;
  estado: EstadoVentana;
  pasos: PasoPlan[];
}

export interface PlanBusqueda {
  /** Horas transcurridas desde la pérdida (0 si la fecha no sirve). */
  horas: number;
  ventanaActual: VentanaId;
  /** Las cuatro, siempre, en orden. Las que ya pasaron conservan sus pasos. */
  ventanas: VentanaPlan[];
}

// ── el reloj ────────────────────────────────────────────────────────────────

/** Orden fijo y borde superior (en horas, exclusivo) de cada ventana. */
const ORDEN: readonly { id: VentanaId; hasta: number }[] = [
  { id: 'ahora', hasta: 2 },
  { id: 'hoy', hasta: 24 },
  { id: 'dia2', hasta: 120 }, // días 2 a 4: la mediana en perros es de 2 días
  { id: 'dia5', hasta: Infinity }, // la mediana en gatos es de 5 días
];

export const VENTANAS: Record<VentanaId, { titulo: string; entrada: string }> = {
  ahora: {
    titulo: 'Las próximas 2 horas',
    entrada: 'Lo que más cambia el resultado se hace ahora, cerca de donde se separaron.',
  },
  hoy: {
    titulo: 'Hoy, antes de que oscurezca',
    entrada: 'Con luz todavía: que el barrio se entere y que quede tu rastro en la calle.',
  },
  dia2: {
    titulo: 'Del día 2 al 4',
    entrada: 'La mayoría aparece por acá. Es cuestión de repetir el recorrido, no de esperar.',
  },
  dia5: {
    titulo: 'Del día 5 en adelante',
    entrada: 'Sigue apareciendo gente que los encuentra a las semanas. Cambia el modo, no el ánimo.',
  },
};

const MS_HORA = 3600 * 1000;

/**
 * Horas entre la pérdida y `ahora`. Degrada limpio: una fecha inválida o
 * futura da 0, así el dueño igual recibe el plan desde el principio.
 */
export function horasDesde(desde: string | Date, ahora: Date): number {
  const d = desde instanceof Date ? desde : new Date(desde);
  const t = d.getTime();
  if (Number.isNaN(t) || Number.isNaN(ahora.getTime())) return 0;
  const horas = (ahora.getTime() - t) / MS_HORA;
  return horas > 0 ? horas : 0;
}

export function ventanaDeHoras(horas: number): VentanaId {
  for (const v of ORDEN) if (horas < v.hasta) return v.id;
  return 'dia5';
}

/**
 * Cuánto hace que se perdió, dicho como lo diría una persona. Sin cuenta
 * regresiva ni urgencia fabricada: es un dato, no una presión.
 */
export function etiquetaTiempo(horas: number): string {
  if (horas < 1) return 'Hace menos de una hora';
  if (horas < 2) return 'Hace una hora';
  if (horas < 24) return `Hace ${Math.floor(horas)} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'Hace 1 día' : `Hace ${dias} días`;
}

// ── el contenido ────────────────────────────────────────────────────────────
//
// Criterio rescatista, no palabrería. Lo que sigue son las cosas que de verdad
// mueven la aguja y que la app no decía en ninguna parte.

export const PASOS_PLAN: readonly PasoCatalogo[] = [
  // ── las próximas 2 horas ──────────────────────────────────────────────────
  {
    id: 'no-lo-persigas',
    ventana: 'ahora',
    especies: ['perro'],
    titulo: 'No lo persigas',
    detalle:
      'Es el error más común y el que más caro sale. Si lo ves, no corras hacia él, ' +
      'no lo llames a los gritos y no lo mires a los ojos: para un perro asustado ' +
      'todo eso es una amenaza y lo empuja lejos del lugar donde se separaron, que ' +
      'es justo adonde tiende a volver. Andá despacio, hablá bajo, quedate quieto.',
  },
  {
    id: 'si-lo-ves-agachate',
    ventana: 'ahora',
    especies: ['perro'],
    temperamentos: ['asustadizo'],
    titulo: 'Si lo ves, agachate y esperá',
    detalle:
      'Sentate o agachate de costado, con la vista en el piso y sin estirar la mano. ' +
      'Tirale un pedacito de algo rico hacia un lado y esperá sin moverte, aunque ' +
      'tarde un buen rato. Un perro en pánico no reconoce ni a su familia hasta que ' +
      'se le pasa: el que tiene que acercarse es él, no vos.',
  },
  {
    id: 'gato-esta-a-cien-metros',
    ventana: 'ahora',
    especies: ['gato'],
    ambitos: ['interior'],
    titulo: 'No se fue lejos',
    detalle:
      'Un gato que vivía puertas adentro casi nunca se aleja. Lo más probable es que ' +
      'esté a menos de 100 m, escondido, callado y sin moverse, esperando que baje el ' +
      'ruido. No sirve salir a recorrer cuadras: empezá por tu propio patio, el techo, ' +
      'abajo de los autos y los rincones de las casas pegadas a la tuya.',
  },
  {
    id: 'gato-su-ronda',
    ventana: 'ahora',
    especies: ['gato'],
    ambitos: ['exterior'],
    titulo: 'Empezá por su ronda de siempre',
    detalle:
      'Un gato que salía solo tiene un circuito conocido: los techos, el terreno ' +
      'baldío, la casa donde le convidan comida. Recorré ese circuito primero y ' +
      'preguntá en cada punto. Si algo lo asustó, va a estar escondido cerca de ese ' +
      'trayecto y no necesariamente cerca de tu puerta.',
  },
  {
    id: 'punto-exacto-de-perdida',
    ventana: 'ahora',
    titulo: 'Volvé al punto exacto',
    detalle:
      'Andá al lugar preciso donde se separaron y quedate un rato ahí, sentado y sin ' +
      'hacer ruido. Muchos animales rehacen el camino hasta ese punto, y si encuentran ' +
      'a alguien conocido esperando tranquilo, se acercan. Si tenés con quién, que otra ' +
      'persona se quede ahí mientras vos recorrés.',
  },
  {
    id: 'olor-en-la-puerta',
    ventana: 'ahora',
    titulo: 'Dejá su olor en la puerta de casa',
    detalle:
      'Poné afuera, junto a la entrada, su cama o su manta sin lavar, una prenda de ' +
      'ropa tuya usada y su comedero. El olor propio es lo que los orienta de vuelta ' +
      'desde varias cuadras, y no cuesta nada. Si se puede, que alguien se quede en ' +
      'casa: muchos vuelven solos de madrugada y encuentran la puerta cerrada.',
  },
  // NO se reusa `publica-el-reporte` de la guía, y es a propósito. La guía se
  // lee ANTES de publicar; este plan vive DENTRO de la ficha del reporte
  // (`PetDetailScreen` lo dibuja con el `pet` en la mano), así que el reporte
  // ya existe. Pedirle publicar a quien acaba de publicar no solo sobra: el
  // botón de ese paso lleva a `Publicar` con el formulario VACÍO, y quien lo
  // tocaba se llevaba un segundo reporte duplicado de la misma mascota. El paso
  // sigue en `guiaPerdida.ts`, que es donde sí corresponde.

  // ── hoy, antes de que oscurezca ───────────────────────────────────────────
  { id: 'llama-veterinarias-y-refugios', ventana: 'hoy', desdeGuia: true },
  { id: 'difunde-con-el-afiche', ventana: 'hoy', desdeGuia: true, accionLocal: 'afiche' },
  { id: 'avisa-a-tu-barrio', ventana: 'hoy', desdeGuia: true },
  {
    id: 'perro-a-pie-y-no-en-auto',
    ventana: 'hoy',
    especies: ['perro'],
    titulo: 'Recorré a pie, no en auto',
    detalle:
      'Desde adentro de un auto no vas a ver un perro metido abajo de un portón, ni él ' +
      'te va a reconocer al pasar. Caminá en círculos que se van abriendo desde el ' +
      'punto de partida, parando cada tanto a escuchar. Llevá su correa y algo de ' +
      'comer, y hablá con quien esté trabajando en la calle a esta hora.',
  },
  {
    id: 'gato-puerta-por-puerta',
    ventana: 'hoy',
    especies: ['gato'],
    titulo: 'Puerta por puerta, pidiendo permiso',
    detalle:
      'Tocá timbre en las casas de alrededor y pedí permiso para mirar vos mismo. Casi ' +
      'todo el mundo va a decirte que no lo vio sin haber revisado nada, y de buena fe. ' +
      'Mirá a ras del suelo: abajo de los autos, adentro de galpones, entretechos, ' +
      'sótanos, detrás de las plantas y en cualquier hueco que parezca demasiado chico.',
  },
  {
    id: 'gato-de-noche-en-silencio',
    ventana: 'hoy',
    especies: ['gato'],
    titulo: 'Prepará la salida de la noche',
    detalle:
      'Cuando se calla la calle es cuando un gato asustado se anima a moverse. Salí de ' +
      'madrugada con una linterna, en silencio, apuntando bajo para que se le enciendan ' +
      'los ojos, y quedate quieto escuchando. Llamalo suave, con la voz de todos los ' +
      'días. Gritar por la calle sólo hace que se quede más quieto.',
  },

  // ── del día 2 al 4 ────────────────────────────────────────────────────────
  { id: 'revisa-avistamientos', ventana: 'dia2', desdeGuia: true },
  {
    id: 'perro-amplia-el-radio',
    ventana: 'dia2',
    especies: ['perro'],
    titulo: 'Ampliá el radio',
    // Sin cifra a propósito: el número lo dice UNA sola pieza, la tarjeta
    // "Buscá X a la redonda" que está justo arriba (`ConsejoRadio`), y ahí se
    // amplía sola con los días. Cuando acá había un "tres o cinco kilómetros"
    // escrito a mano, al cuarto día la tarjeta sugería 12 km y este paso decía
    // 3-5: dos números para lo mismo, uno encima del otro.
    detalle:
      'Un perro suelto puede caminar varios kilómetros en un día. Estirá la búsqueda más ' +
      'allá del círculo de los primeros días y volvé a la misma hora en que se perdió: ' +
      'los que trabajan en la calle a esa hora —repartidores, gente de la basura, quien ' +
      'saca a pasear perros al amanecer— son los que lo van a haber visto.',
  },
  {
    id: 'gato-revisa-de-nuevo',
    ventana: 'dia2',
    especies: ['gato'],
    titulo: 'Revisá otra vez lo que ya revisaste',
    detalle:
      'Se mueven de noche y cambian de escondite. El rincón que mirás hoy y está vacío ' +
      'puede tener a tu gato mañana, así que repetí el mismo recorrido varios días ' +
      'seguidos, sin descartar nada. No es perder el tiempo: es literalmente la forma ' +
      'en que aparecen.',
  },
  {
    id: 'gato-comida-en-el-punto',
    ventana: 'dia2',
    especies: ['gato'],
    titulo: 'Dejá comida y su arenero sin limpiar',
    detalle:
      'Poné un plato de algo con olor fuerte —atún, sardina— donde desapareció y en la ' +
      'puerta de tu casa, y al lado su arenero usado. Si podés, dejá el teléfono ' +
      'grabando de noche apuntando al plato: así sabés si viene, a qué hora, y dónde ' +
      'conviene que estés esperándolo.',
  },

  // ── del día 5 en adelante ─────────────────────────────────────────────────
  { id: 'no-te-rindas', ventana: 'dia5', desdeGuia: true },
  {
    id: 'vuelve-en-persona',
    ventana: 'dia5',
    titulo: 'Volvé en persona, con el afiche en la mano',
    detalle:
      'Llamar por teléfono ya no alcanza: quien te atendió el primer día hoy no está y ' +
      'nadie se acuerda de una descripción hablada. Pasá por las veterinarias, la ' +
      'perrera municipal y los refugios con la foto impresa, y dejá una copia pegada en ' +
      'cada mostrador con tu número.',
  },
  {
    id: 'gato-el-hambre-lo-mueve',
    ventana: 'dia5',
    especies: ['gato'],
    titulo: 'Ahora sí empieza a moverse',
    // Igual que en el paso del perro: la distancia la dice `ConsejoRadio`, no
    // este texto. Acá decía "ampliá a unas tres cuadras" (~300 m) mientras la
    // tarjeta de arriba ya venía recomendando 2 km — llamaba "ampliar" a algo
    // siete veces más chico de lo que la app misma sugería.
    detalle:
      'Pasada la primera semana, el hambre y la sed lo sacan del escondite, y es justo ' +
      'cuando más aparecen. Ampliá el círculo, insistí de madrugada y volvé a pasar por ' +
      'las casas donde ya preguntaste: ahora la respuesta puede ser otra, porque recién ' +
      'ahora hay algo que ver.',
  },
  {
    id: 'perro-puede-estar-en-una-casa',
    ventana: 'dia5',
    especies: ['perro'],
    titulo: 'Puede estar adentro de una casa',
    detalle:
      'A esta altura es muy posible que alguien lo haya recogido y lo tenga puertas ' +
      'adentro sin saber de quién es. Revisá los grupos de compra y venta del barrio, ' +
      'las publicaciones de gente que encontró un perro y las páginas de adopción de la ' +
      'zona, y dejá el tuyo publicado también ahí.',
  },
];

// ── el armado ───────────────────────────────────────────────────────────────

const porIdEnLaGuia = new Map(GUIA_PERDIDA.map((p) => [p.id, p]));

// Sin dato, el perro se asume ASUSTADIZO (perseguirlo es el error caro) y el
// gato, CON CALLE.
//
// Lo del gato cambió y vale la pena el porqué: acá se había elegido "interior"
// por conservador (no mandar a recorrer cuadras a alguien cuyo gato está
// escondido en el patio de al lado), mientras `radioSugerido.ts` elegía
// "exterior" por conservador también (no achicar la búsqueda de quien no
// contestó). Los dos razonamientos son buenos por separado y juntos producían
// una contradicción en la misma pantalla: la tarjeta de arriba decía "buscá
// 1 km a la redonda" y el plan, veinte píxeles más abajo, "no se fue lejos, no
// sirve salir a recorrer cuadras", sobre el mismo animal.
//
// Cuando el dueño contestó, manda su respuesta (`perfil.ambito`) y no hay nada
// que adivinar. Cuando no contestó, las dos piezas asumen lo MISMO. Es peor
// darle dos consejos opuestos que darle uno imperfecto.
function normalizar(perfil: PerfilBusqueda) {
  const temperamento = perfil.temperamento === 'sociable' ? 'sociable' : 'asustadizo';
  const ambito = perfil.ambito === 'interior' ? 'interior' : 'exterior';
  return { especie: perfil.especie, temperamento, ambito } as const;
}

function aplica(paso: PasoCatalogo, p: ReturnType<typeof normalizar>): boolean {
  if (paso.especies && !paso.especies.includes(p.especie)) return false;
  if (paso.temperamentos && !paso.temperamentos.includes(p.temperamento)) return false;
  if (paso.ambitos && !paso.ambitos.includes(p.ambito)) return false;
  return true;
}

// Resuelve un paso del catálogo a algo mostrable. Si viene de la guía, el texto
// y la acción se leen de GUIA_PERDIDA; si el id no existiera allá, el paso se
// descarta en silencio en vez de dibujar una tarjeta vacía (hay un test que no
// deja que eso pase inadvertido).
function resolver(paso: PasoCatalogo): PasoPlan | null {
  if (paso.desdeGuia) {
    const base = porIdEnLaGuia.get(paso.id);
    if (!base) return null;
    return {
      id: base.id,
      titulo: base.titulo,
      detalle: base.detalle,
      ventana: paso.ventana,
      accion: base.accion,
      accionLocal: paso.accionLocal,
    };
  }
  if (!paso.titulo || !paso.detalle) return null;
  return {
    id: paso.id,
    titulo: paso.titulo,
    detalle: paso.detalle,
    ventana: paso.ventana,
    accion: paso.accion,
    accionLocal: paso.accionLocal,
  };
}

/**
 * El plan que corresponde AHORA. Devuelve siempre las cuatro ventanas en orden:
 * la actual va marcada, las anteriores quedan como `pasada` (pero con sus pasos
 * intactos, porque mucha gente llega a la app al tercer día) y las que vienen,
 * como `proxima`.
 */
export function planDeBusqueda(
  perfil: PerfilBusqueda,
  desde: string | Date,
  ahora: Date,
): PlanBusqueda {
  const horas = horasDesde(desde, ahora);
  const ventanaActual = ventanaDeHoras(horas);
  const p = normalizar(perfil);
  const indiceActual = ORDEN.findIndex((v) => v.id === ventanaActual);

  const ventanas = ORDEN.map((v, i): VentanaPlan => ({
    id: v.id,
    titulo: VENTANAS[v.id].titulo,
    estado: i < indiceActual ? 'pasada' : i === indiceActual ? 'actual' : 'proxima',
    pasos: PASOS_PLAN.filter((paso) => paso.ventana === v.id && aplica(paso, p))
      .map(resolver)
      .filter((paso): paso is PasoPlan => paso !== null),
  }));

  return { horas, ventanaActual, ventanas };
}

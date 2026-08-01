import { normalize } from './text';

// ¿ALGUIEN ESTÁ PIDIENDO PLATA POR ADELANTADO EN EL CHAT?
//
// La regla de diseño manda sobre cualquier ganancia de cobertura: UN FALSO
// POSITIVO CONTRA UN VECINO HONESTO ES PEOR QUE NO AVISAR. La enorme mayoría de
// la gente que escribe a un reporte de mascota perdida lo hace de buena fe, y
// muchas veces gastando plata de su bolsillo. Que la app le insinúe al dueño que
// esa persona es una chanta rompe justo lo que hace funcionar a la app.
//
// Por eso NO alcanza con nombrar la plata. Hace falta CO-OCURRENCIA de:
//   (A) plata (un verbo de pago o una palabra de dinero), Y
//   (B) una de tres señales duras:
//        · datos bancarios (nadie honesto le manda su número de cuenta al dueño
//          antes de devolverle el perro),
//        · un pedido explícito de pago ANTES de la entrega,
//        · el "te la mando por flete/encomienda" a distancia — que es
//          literalmente el caso que documenta la BBB: el que dice ser camionero
//          y encontró tu mascota a 500 km, y necesita el envío por adelantado.
//
// Y encima hay una red de negaciones: "no me transfieras nada por adelantado" usa
// exactamente las mismas palabras que el estafador, pero es lo contrario.
//
// Lo que se dibuja cuando esto da true NO acusa a nadie: le recuerda al dueño la
// seña y el "en persona". Ver `AvisoDuenoChat`.

// (A) Plata. Alternancias explícitas en vez de raíces cortas, para no cazar
// "transformar" con "transf" ni "página" con "pag".
const HAY_PLATA =
  /(transfer|transfier|transfir|deposit|\bpag[aou]|\bgir[ao]\b|\babon[ao]|\bplata\b|\bdinero\b|\befectivo\b|\bluca|\bpesos\b)/;

// (B1) Datos bancarios.
const DATOS_BANCARIOS = [
  'numero de cuenta',
  'n de cuenta',
  'nro de cuenta',
  'cuenta rut',
  'cuenta corriente',
  'cuenta vista',
  'datos de la cuenta',
  'datos bancarios',
  'mi cuenta es',
  'te paso mi cuenta',
  'te doy mi cuenta',
  'bancoestado',
  'banco estado',
  'mi rut es',
  'cbu',
];

// (B2) Pago ANTES de la entrega. Se comparan como frase completa: son lo bastante
// largas como para que un falso positivo sea improbable.
const PAGO_ADELANTADO = [
  'por adelantado',
  'por adelanto',
  'un adelanto',
  'un anticipo',
  'de anticipo',
  'antes de entregar',
  'antes de devolver',
  'antes de llevar',
  'antes de la entrega',
  'primero me transfier',
  'primero me deposit',
  'primero me pag',
  'primero el pago',
];

// (B3) Entrega a distancia por encargo.
const ENVIO_A_DISTANCIA = ['flete', 'encomienda', 'transportista', 'costo de envio', 'gastos de envio'];

// Red de seguridad: quien está diciendo que NO quiere plata usa el mismo
// vocabulario que quien la pide.
const NEGACIONES = [
  'no me transfieras',
  'no me transfiera',
  'no me deposit',
  'no me pagues',
  'no me pague',
  'no me pagas',
  'no me tienes que pagar',
  'no me tenes que pagar',
  'no quiero plata',
  'no quiero dinero',
  'no quiero nada',
  'no quiero recompensa',
  'no busco recompensa',
  'no busco plata',
  'no necesito plata',
  'no necesito dinero',
  'no hace falta que me pagues',
  'sin recompensa',
];

function algunaFrase(texto: string, frases: string[]): boolean {
  return frases.some((f) => texto.includes(f));
}

export function pideDineroPorAdelantado(texto: string | null | undefined): boolean {
  if (!texto || !texto.trim()) return false;
  const t = normalize(texto);

  if (algunaFrase(t, NEGACIONES)) return false;
  if (!HAY_PLATA.test(t)) return false;

  return (
    algunaFrase(t, DATOS_BANCARIOS) ||
    algunaFrase(t, PAGO_ADELANTADO) ||
    algunaFrase(t, ENVIO_A_DISTANCIA)
  );
}

// Estructura mínima que necesitamos de un mensaje (compatible con `Message`).
export interface MensajeMirable {
  from_user: string;
  texto: string | null;
}

// Solo mira lo que escribió LA OTRA PERSONA: el dueño escribiendo "no te voy a
// transferir nada" no se tiene que auto-avisar.
export function hayPedidoDeDinero(mensajes: MensajeMirable[], me: string): boolean {
  return mensajes.some((m) => m.from_user !== me && pideDineroPorAdelantado(m.texto));
}

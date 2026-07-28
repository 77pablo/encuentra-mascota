// Logica PURA del barrido de fotos de moderacion (Edge Function
// `moderar-borrar-foto`, migracion 0043).
//
// Este archivo es a proposito PURO (no toca `Deno` ni la red): asi lo puede
// importar el test de jest, que corre en Node. Es el mismo motivo por el que
// `cors.ts` esta separado. Lo que vive acá es justo lo que se rompe en
// silencio: validar que una ruta tenga la forma esperada y darse cuenta de que
// Storage borro MENOS de lo que se le pidio.

// Forma exacta que genera la app para cualquier foto: `<uuid del autor>/<id>.jpg`
// (ver src/services/storage.ts). Un solo segmento despues del uuid, y el uuid
// completo anclado a los dos extremos.
//
// Es la SEGUNDA barrera del mismo filtro que ya aplica la RPC (0043 encola solo
// rutas que empiezan con el uuid del autor del mensaje). Es a proposito: el
// `remove` corre con service_role y se saltea la RLS de Storage. Si algun dia
// la cola se llenara con una ruta arbitraria, esto evita que le borremos un
// archivo a otra persona; las dos capas tienen que fallar para que haya dano.
const RUTA_VALIDA = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/[^/]+$/;

export interface FotoPendiente {
  id: number;
  ruta: string;
}

export function rutaSegura(ruta: unknown): ruta is string {
  return typeof ruta === 'string' && RUTA_VALIDA.test(ruta);
}

/**
 * Valida la respuesta cruda de la RPC `moderacion_fotos_a_borrar`.
 *
 * Lanza si la forma no es la esperada en vez de seguir con cero rutas: este
 * archivo no lo revisa ningun typecheck (tsconfig excluye supabase/functions),
 * asi que un cambio de firma de la RPC se manifestaria como "borro 0 fotos y
 * dijo que todo bien", que es exactamente el fallo silencioso que hay que
 * evitar. Mismo criterio que `delete-account` con `mis_fotos_a_borrar`.
 */
export function normalizarPendientes(crudo: unknown): FotoPendiente[] {
  if (!Array.isArray(crudo)) {
    throw new Error('moderacion_fotos_a_borrar no devolvio un arreglo');
  }
  return crudo.map((f) => {
    const fila = f as { id?: unknown; ruta?: unknown };
    const id = typeof fila?.id === 'string' ? Number(fila.id) : fila?.id;
    if (typeof id !== 'number' || !Number.isFinite(id)) {
      throw new Error('moderacion_fotos_a_borrar devolvio una fila sin id numerico');
    }
    if (typeof fila?.ruta !== 'string' || fila.ruta.length === 0) {
      throw new Error('moderacion_fotos_a_borrar devolvio una ruta que no es texto');
    }
    return { id, ruta: fila.ruta };
  });
}

/**
 * Agrupa las filas pendientes por ruta.
 *
 * Deduplicar no es cosmetico: si la misma ruta se pidiera dos veces, Storage
 * devolveria una sola fila y el conteo de mas abajo lo leeria como borrado
 * parcial; esa foto se reintentaria hasta agotar los intentos sin que nada
 * estuviera fallando. Y como una ruta puede tener VARIOS ids en la cola (dos
 * mensajes distintos con la misma URL: `imagen_url` es texto que escribe el
 * usuario), borrar el archivo una vez tiene que cerrar todos esos ids.
 */
export function agruparPorRuta(filas: FotoPendiente[]): Map<string, number[]> {
  const mapa = new Map<string, number[]>();
  for (const f of filas) {
    const previos = mapa.get(f.ruta);
    if (previos) previos.push(f.id);
    else mapa.set(f.ruta, [f.id]);
  }
  return mapa;
}

export interface Clasificacion {
  confirmadas: string[];
  noConfirmadas: string[];
  formaInesperada: boolean;
}

/**
 * Compara lo que se le pidio a Storage contra lo que devolvio.
 *
 * `storage.remove()` devuelve `error` SOLO si se cae la request entera: los
 * objetos que no borro simplemente faltan en `data`. Un borrado parcial es,
 * entonces, invisible salvo que se comparen las dos listas — que es lo que hace
 * esto.
 *
 * Las que faltan pueden ser (a) rutas que ya no estaban en el bucket o (b)
 * fallos reales. Desde acá no se distinguen, asi que las dos vuelven como
 * `noConfirmadas` y la cola las reintenta unas pocas veces antes de
 * abandonarlas (0043): eso cubre (b) sin quedarse en un bucle eterno por (a).
 */
export function clasificarBorrado(
  solicitadas: string[],
  devueltas: unknown,
): Clasificacion {
  const filas = Array.isArray(devueltas) ? devueltas : [];
  const nombres = new Set(
    filas
      .map((o) => (o as { name?: unknown })?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0),
  );

  const confirmadas = solicitadas.filter((r) => nombres.has(r));

  // Red de seguridad ante un cambio de forma de la respuesta de Storage: si
  // devolvio tantas filas como rutas se pidieron pero ningun `name` coincide,
  // no hay ningun indicio de que haya fallado algo — lo que cambio es el nombre
  // del campo. Tratarlo como fallo total reintentaria para siempre borrados que
  // ya ocurrieron. Se toma como confirmado y se avisa con `formaInesperada`
  // para que quede en el log.
  if (confirmadas.length === 0 && solicitadas.length > 0 && filas.length === solicitadas.length) {
    return { confirmadas: [...solicitadas], noConfirmadas: [], formaInesperada: true };
  }

  return {
    confirmadas,
    noConfirmadas: solicitadas.filter((r) => !nombres.has(r)),
    formaInesperada: false,
  };
}

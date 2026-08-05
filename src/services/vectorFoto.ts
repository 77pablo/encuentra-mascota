import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { esVectorValido, normalizar } from '../lib/vectorFoto';

// SERVICIO DE VECTOR DE FOTO — carga el modelo y escribe en la base. SOLO WEB.
//
// LA TASK B1 CERRO LAS DOS RUTAS DE SERVIDOR: CLIP no corre en una Edge
// Function de Supabase (ningun backend de ONNX Runtime registra en Deno) ni en
// Cloudflare Workers AI (sin modelos de embedding que acepten imagenes). Pablo
// decidio calcular el vector EN EL NAVEGADOR con `@huggingface/transformers`
// (WASM), asi que en nativo esto no corre nunca — ver `hayModeloDisponible`.
//
// TODO ACA ES BEST-EFFORT A PROPOSITO: "nada bloquea publicar" es una regla
// global de la tanda. Un reporte sin vector sigue encontrando coincidencias
// por las señas de siempre, solo no suma el punto de la foto.

// El pipeline se guarda a nivel de modulo: bajar el modelo (~40 MB) dos veces
// para la misma pestaña seria absurdo. `null` = todavia no se intento cargar;
// una promesa cacheada evita que dos llamadas concurrentes bajen el modelo dos
// veces (la segunda espera la MISMA promesa en vez de disparar otra carga).
let pipelinePromise: Promise<any> | null = null;

const MODELO = 'Xenova/clip-vit-base-patch32';

async function crearPipeline(): Promise<any> {
  // Import DINAMICO: un `import` estatico arriba del archivo mete ~40 MB en
  // el bundle de TODOS, incluida la persona que jamas publica una foto.
  const { pipeline } = await import('@huggingface/transformers');
  return pipeline('image-feature-extraction', MODELO);
}

function cargarPipeline(): Promise<any> {
  if (!pipelinePromise) pipelinePromise = crearPipeline();
  return pipelinePromise;
}

// ¿Hay como calcular el vector en este entorno? La libreria es WASM y no corre
// en nativo (React Native no tiene ese runtime), asi que la funcion lo dice de
// entrada en vez de fallar recien cuando alguien intenta usarla. Un reporte
// publicado desde Android queda sin vector, y eso esta bien: la regla global
// "lo que falta nunca descarta" ya lo cubre.
export function hayModeloDisponible(): boolean {
  return Platform.OS === 'web';
}

// Calcula el embedding CLIP de una foto y lo guarda en `pet_fotos_vector`.
// Devuelve `false` (nunca lanza) ante cualquier tropiezo: modelo no
// disponible, carga fallida, vector invalido o escritura rechazada por la RLS
// silenciosa. Nada de esto puede romper la pantalla que llama a esta funcion.
export async function calcularYGuardar(petId: string, fotoUrl: string): Promise<boolean> {
  if (!hayModeloDisponible()) return false;

  try {
    const extractor = await cargarPipeline();
    const salida = await extractor(fotoUrl);
    const vector = normalizar(Array.from(salida.data as ArrayLike<number>));

    // Un NaN adentro de pgvector rompe el indice ENTERO, no solo esta fila:
    // se valida antes de escribir, no despues.
    if (!esVectorValido(vector)) return false;

    // INSERT LISO, PROHIBIDO el patron "upsert": el ensayo de B2 midio que
    // ese camino ("insert ... on conflict ... do update") da 42501 incluso al
    // dueño, porque plantear el `do update` exige privilegio de SELECT sobre
    // `embedding`, y esa columna esta recortada a proposito (es el
    // no-oraculo: ver 0064). Si algun dia hace falta recalcular el vector de
    // una `foto_url` ya vectorizada, es un
    // `.update(...).eq('pet_id', ...).eq('foto_url', ...).select('id')`
    // aparte, ya medido contra la base real.
    //
    // `.select('id')` con columna EXPLICITA, nunca un select sin argumentos:
    // sin argumentos supabase-js lo traduce a `select=*`, que toca `embedding`
    // y da 42501 aunque la escritura haya funcionado.
    const { data, error } = await supabase
      .from('pet_fotos_vector')
      .insert({ pet_id: petId, foto_url: fotoUrl, embedding: vector })
      .select('id');

    if (error) {
      // 23505: la fila ya existe (carrera benigna de dos escrituras
      // concurrentes para la misma foto). Es exito, no fracaso.
      if (error.code === '23505') return true;
      return false;
    }
    // La RLS de PostgREST rechaza en silencio: 200 con 0 filas, no 42501.
    if (!data || data.length === 0) return false;

    return true;
  } catch {
    // Modelo que no descarga, WASM que no inicializa, red caida: cualquier
    // tropiezo acá es "sin vector todavia", nunca una pantalla rota.
    return false;
  }
}

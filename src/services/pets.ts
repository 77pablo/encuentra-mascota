import { supabase } from '../lib/supabase';
import { PetInput } from '../schemas/pet';
import { ErrorAmigable, esColumnaFaltante } from '../lib/dbErrors';
import { difuminarUbicacion } from '../lib/difuminarUbicacion';
import { rutaDeFotoPropia } from '../lib/rutaStorage';

export interface Pet {
  id: string;
  user_id: string;
  estado: 'perdida' | 'encontrada';
  especie: 'perro' | 'gato' | 'otro';
  raza: string | null;
  nombre: string | null;
  descripcion: string;
  fotos: string[];
  lat: number;
  lng: number;
  recompensa: string | null;
  activo: boolean;
  oculto: boolean;
  creado_en: string;
  // Comuna "casa" del reporte y comunas de alcance (vecinas). Pueden faltar en
  // reportes viejos (anteriores a la Tanda 3).
  comuna?: string | null;
  comunas_alcance?: string[] | null;
  // Vínculo con la ficha "Mi mascota" que originó el reporte (Función 2), si lo hubo.
  origen_my_pet?: string | null;
  // Final feliz (verificación de reencuentro) — ver reunions.ts / lib/reunion.ts.
  reunida_en?: string | null;
  final_feliz?: string | null;
  final_foto?: string | null;
  // Ciclo de vida (migración 0028): última vez que el dueño confirmó que el
  // reporte sigue vigente (o la creación). A los 45 días sin renovar, el reporte
  // sale solo de las búsquedas. Puede faltar en reportes anteriores a la 0028.
  renovado_en?: string | null;
  // Cierre de casos (migración 0049): cuándo respondió el dueño la pregunta
  // "¿apareció?" y qué contestó. OJO CON LA DIFERENCIA ENTRE `null` Y AUSENTE:
  // `getPet` lee con `select('*')`, así que la CLAVE `preguntado_en` viene en
  // la fila (aunque valga null) solo si la columna existe en la base. Si la
  // 0049 no está aplicada, la clave directamente no llega, y eso es lo que usa
  // `lib/cierreCasos.hayColumnaDeSeguimiento` para no dibujar la tarjeta.
  preguntado_en?: string | null;
  cierre_motivo?: 'aparecio' | 'sigo_buscando' | 'ya_no_busco' | null;
  // Ámbito del animal (migración 0046), para calibrar el radio de búsqueda.
  // Llega `undefined` en TRES casos distintos y los tres significan lo mismo
  // para quien lo lee ("no sabemos"): la 0046 no está aplicada, el reporte es
  // anterior a ella, o la persona omitió la pregunta. Ver src/lib/radioSugerido.
  // OJO: `buscar_reportes` (RPC) NO lo devuelve; solo llega por `select('*')`.
  ambito?: 'interior' | 'exterior' | null;
  // Rasgos estructurados del animal (migración 0054), para que una coincidencia
  // deje de ser "misma especie + 15 km". Los cuatro son opcionales y llegan
  // `undefined` en los mismos TRES casos que `ambito` (sin migración / reporte
  // viejo / no contestaron), y los tres significan lo mismo para quien los lee:
  // no sabemos. Igual que `ambito`, la RPC de búsqueda NO los devuelve: llegan
  // por `select('*')`.
  //
  // El número de chip NO está acá y NO está en `pets`: vive en `pet_chips`,
  // cerrado al dueño (ver services/petChip.ts). El guardrail de la 0047 que
  // corre sobre esta interfaz lo cazaría igual, y con razón.
  colores?: string[] | null;
  tamano?: 'chico' | 'mediano' | 'grande' | null;
  sexo?: 'macho' | 'hembra' | 'no_se' | null;
  esterilizado?: 'si' | 'no' | 'no_se' | null;
}

// Columnas que pueden NO EXISTIR en la base, agrupadas por la migración que las
// trae. Es el mapa que usa la degradación de abajo.
//
// Que sean grupos y no una lista plana importa: PostgREST nombra UNA sola
// columna por error, así que con una lista plana harían falta tantos reintentos
// como columnas falten —y cada reintento de un insert es una chance de publicar
// dos veces—. Soltando el grupo entero de la migración que falta, alcanza con un
// intento por migración. Y al revés: una base puede tener la 0046 y no la 0054,
// así que soltar TODO junto le sacaría al reporte la calibración del radio sin
// ningún motivo.
const GRUPOS_OPCIONALES: readonly (readonly string[])[] = [
  ['ambito'], // migración 0046
  ['colores', 'tamano', 'sexo', 'esterilizado'], // migración 0054
];

/**
 * ¿El error dice que falta alguna de las columnas que estamos mandando? Si sí,
 * devuelve TODAS las del mismo grupo (para soltarlas juntas). Si no, null: el
 * error es otro y hay que dejarlo subir sin reintentar nada.
 */
function grupoFaltante(error: unknown, enviadas: string[]): readonly string[] | null {
  for (const grupo of GRUPOS_OPCIONALES) {
    const presentes = grupo.filter((c) => enviadas.includes(c));
    if (presentes.length === 0) continue;
    if (presentes.some((c) => esColumnaFaltante(error, c))) return grupo;
  }
  return null;
}

/** Los campos opcionales que de verdad tienen valor (sin dato, sin clave). */
function opcionalesDe(input: PetInput): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (input.ambito) extras.ambito = input.ambito;
  // Una lista vacía es lo mismo que no contestar, y mandar las dos formas haría
  // que la base guardara `{}` en unas filas y null en otras para el mismo
  // "no sé" — dos maneras de decir lo mismo se cruzan mal.
  if (input.colores && input.colores.length > 0) extras.colores = input.colores;
  if (input.tamano) extras.tamano = input.tamano;
  if (input.sexo) extras.sexo = input.sexo;
  if (input.esterilizado) extras.esterilizado = input.esterilizado;
  return extras;
}

// NOTA: acá vivía `activePetsCache`, una caché de 30s de "todos los reportes
// activos". La búsqueda del servidor (migraciones 0014/0015) la dejó sin uso:
// ninguna pantalla se trae la lista completa, todas piden páginas filtradas con
// `services/busqueda.ts`. Se quitó junto con `listActivePets()`, que ya no
// llamaba nadie. Si alguna vez hace falta cachear, conviene hacerlo POR
// CONSULTA (clave = filtros + cursor), no una lista global.

export async function createPet(
  input: PetInput,
  fotos: string[],
  userId: string,
  // Si el reporte nace desde una ficha "Mi mascota" (Función 2), guardamos el
  // vínculo para que la RPC del collar sepa que esta mascota está perdida ahora.
  origenMyPet?: string | null,
): Promise<Pet> {
  // La ubicacion se difumina ACA, en el borde de escritura, para que ninguna
  // pantalla pueda saltarse el paso por olvido. La coordenada exacta no se
  // guarda en ninguna parte: lo que no se guarda no se puede filtrar.
  const { lat, lng } = difuminarUbicacion({ lat: input.lat, lng: input.lng });
  // Los campos que pueden no existir en la base salen del resto a propósito:
  // `ambito` (0046) y las cuatro señas estructuradas (0054). Todo lo demás va
  // siempre. Ver GRUPOS_OPCIONALES.
  const { ambito, colores, tamano, sexo, esterilizado, ...resto } = input;
  const fila = { ...resto, lat, lng, fotos, user_id: userId, origen_my_pet: origenMyPet ?? null };
  const insertar = (datos: Record<string, unknown>) =>
    supabase.from('pets').insert(datos).select().single();

  const extras = opcionalesDe(input);

  // REGLA DURA: la web tiene que andar SIN estas migraciones aplicadas.
  // PostgREST rebota el insert ENTERO si no conoce una columna, así que un
  // reporte de mascota perdida —la función central de la app— quedaría sin
  // publicarse por una mejora del motor de coincidencias. Se reintenta sin el
  // grupo que falta: se pierde el dato, no el reporte.
  //
  // Cualquier OTRO error (RLS, límite anti-spam, red) sube tal cual y no se
  // reintenta: repetir el insert ahí sería publicar dos veces.
  //
  // El bucle termina siempre: cada vuelta borra al menos un grupo de `extras`, y
  // `grupoFaltante` solo devuelve grupos que todavía se están mandando.
  for (;;) {
    const enviadas = Object.keys(extras);
    const { data, error } = await insertar(
      enviadas.length > 0 ? { ...fila, ...extras } : fila,
    );
    if (!error) return data as Pet;
    const grupo = grupoFaltante(error, enviadas);
    if (!grupo) throw error;
    for (const columna of grupo) delete extras[columna];
  }
}

export async function listMyReports(userId: string, activo: boolean): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .eq('activo', activo)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Pet[];
}

export async function listLostBySpecies(especie: Pet['especie']): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('activo', true)
    .eq('estado', 'perdida')
    .eq('especie', especie)
    .eq('oculto', false)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Pet[];
}

// Trae un reporte por id. Usamos `maybeSingle` en vez de `single` a propósito:
// con `single`, un reporte inexistente o ya borrado devuelve el error crudo de
// PostgREST ("Cannot coerce the result to a single JSON object") y esa jerga
// terminaba en pantalla. Pasa de verdad: el afiche con QR sigue pegado en la
// calle después de que la mascota volvió a casa y el reporte se borró.
export const PET_NO_DISPONIBLE =
  'Este reporte ya no está disponible. Puede que la mascota ya haya vuelto a casa.';

export async function getPet(id: string): Promise<Pet> {
  const { data, error } = await supabase.from('pets').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorAmigable(PET_NO_DISPONIBLE);
  return data as Pet;
}

export async function closePet(id: string): Promise<void> {
  const { error } = await supabase.from('pets').update({ activo: false }).eq('id', id);
  if (error) throw error;
}

// CICLO DE VIDA (migración 0028). Renovar = "sigue perdida, mantenelo vivo":
// reinicia el reloj de 45 días poniendo `renovado_en = ahora`, y el reporte
// vuelve a aparecer en las búsquedas al instante. Se usa un timestamp del
// cliente igual que `markReunited` (la RLS ya permite el update al dueño).
export async function renovarReporte(id: string): Promise<void> {
  const { error } = await supabase
    .from('pets')
    .update({ renovado_en: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Archivar = "dejar vencer ya". En vez de un estado nuevo, se reusa la MISMA
// columna `renovado_en` poniéndola 46 días en el pasado: el reporte cae fuera
// del umbral de 45 días y sale de las búsquedas al instante, quedando en "Mis
// reportes" como reactivable con un toque (renovarReporte lo trae de vuelta).
export async function archivarReporte(id: string): Promise<void> {
  const hace46Dias = new Date(Date.now() - 46 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('pets')
    .update({ renovado_en: hace46Dias })
    .eq('id', id);
  if (error) throw error;
}

// Editar el reporte. Degrada igual que `createPet`: las señas estructuradas
// (0054) pueden no existir en la base, y guardar una corrección de la
// descripción no puede fallar por un extra.
//
// Acá el reintento es todavía más barato que al publicar: un UPDATE es
// idempotente, así que repetirlo no puede duplicar nada.
export async function updatePet(
  id: string,
  fields: Partial<
    Pick<
      Pet,
      | 'estado'
      | 'especie'
      | 'raza'
      | 'nombre'
      | 'descripcion'
      | 'recompensa'
      | 'colores'
      | 'tamano'
      | 'sexo'
      | 'esterilizado'
    >
  >,
): Promise<void> {
  const campos: Record<string, unknown> = { ...fields };
  for (;;) {
    const enviadas = Object.keys(campos);
    const { error } = await supabase.from('pets').update(campos).eq('id', id);
    if (!error) return;
    const grupo = grupoFaltante(error, enviadas);
    if (!grupo) throw error;
    for (const columna of grupo) delete campos[columna];
  }
}

// Borra el reporte y, con él, sus fotos del bucket público.
//
// El ORDEN importa: primero se leen las rutas, después se borra de Storage y al
// final la fila. Si se borrara la fila primero, las rutas se pierden y no hay
// reintento posible (es la lección literal del Critical #2 del borrado de
// cuenta, donde las fotos quedaban para siempre en un bucket público mientras
// respondíamos "listo").
//
// Si Storage falla, la fila se borra IGUAL: quedaría una foto huérfana, que es
// exactamente el estado de hoy, mientras que abortar dejaría a la persona sin
// poder borrar su propio reporte —que puede ser justo una urgencia de
// privacidad—. Se elige el estado malo visible por sobre el silencioso.
//
// "Visible" acá quiere decir: con registro. El mismo criterio que ya aplica
// `delete-account/index.ts:126-133` para rutas ajenas descartadas se aplica
// acá a dos huecos por los que este flujo podía fallar completamente en
// silencio (ver los `console.warn` de abajo): que el `select` que lee las
// rutas falle, y que el filtro `rutaDeFotoPropia` descarte TODAS las URLs que
// había. Ninguno de los dos aborta el borrado de la fila, por la misma razón
// de arriba.
export async function deletePet(id: string, userId: string): Promise<void> {
  const { data: fila, error: errLectura } = await supabase
    .from('pets')
    .select('fotos, final_foto')
    .eq('id', id)
    .maybeSingle();
  // Sin este aviso, un fallo de red acá borraría la fila sin haber tocado
  // ninguna foto y la app le diría "Borrado" a la persona igual.
  if (errLectura) {
    console.warn(
      `deletePet: no se pudieron leer las fotos del reporte ${id} antes de borrarlo (se borra el reporte de todas formas):`,
      errLectura.message,
    );
  }

  const urls: string[] = [...((fila?.fotos as string[]) ?? [])];
  // `final_foto` (el "final feliz", migración 0008) vive en su propia columna y
  // es fácil de olvidar: sin esto, cada reencuentro deja una huérfana.
  if (fila?.final_foto) urls.push(fila.final_foto as string);

  const rutasFiltradas = urls
    .map((u) => rutaDeFotoPropia(u, userId))
    .filter((r): r is string => r !== null);
  // Deduplicar: si `final_foto` también está dentro de `fotos`, la misma ruta
  // llegaría dos veces. Hermano del mismo paso en `delete-account/index.ts:140`.
  const rutas = [...new Set(rutasFiltradas)];

  // Había URLs pero el filtro las descartó TODAS: puede ser que `getPublicUrl`
  // haya cambiado de formato (self-hosted, CDN, otra convención) o que alguien
  // haya guardado a mano la URL de otra persona en su propio reporte. Sin este
  // aviso ninguno de los dos escenarios se distingue de "no había fotos".
  if (urls.length > 0 && rutas.length === 0) {
    console.warn(
      `deletePet: se descartaron las ${urls.length} foto(s) del reporte ${id}: ninguna es reconocible como propia de ${userId}`,
    );
  }

  if (rutas.length > 0) {
    const { error: errStorage } = await supabase.storage.from('pet-photos').remove(rutas);
    // A propósito no se corta el flujo: ver el comentario de arriba.
    if (errStorage) console.warn('No se pudieron borrar algunas fotos:', errStorage.message);
  }

  const { error } = await supabase.from('pets').delete().eq('id', id);
  if (error) throw error;
}

// Cuenta reencuentros confirmados para mostrar en la pantalla de Inicio.
// Mismo criterio que la RPC `impacto_comunidad` (mig. 0039): reunida_en no nulo
// y no oculto. Antes contaba `activo=false` a secas, lo que incluía reportes
// cerrados por otros motivos y no calzaba con la tarjeta de impacto.
export async function countReunidas(): Promise<number> {
  const { count, error } = await supabase
    .from('pets')
    .select('id', { count: 'exact', head: true })
    .not('reunida_en', 'is', null)
    .eq('oculto', false);
  if (error) throw error;
  return count ?? 0;
}

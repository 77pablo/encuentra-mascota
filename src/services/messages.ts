import { supabase } from '../lib/supabase';
import { nombreDeAutor } from '../lib/cuentaEliminada';

export interface Message {
  id: string;
  // Nullable desde la 0017: si el reporte se borro (borrando la cuenta o el
  // reporte suelto), el mensaje sobrevive con `pet_id = null` en vez de
  // desaparecer con el.
  pet_id: string | null;
  // Agregado en la 0030: un mensaje puede pertenecer a una adopcion en vez de a
  // un reporte. Un mensaje pertenece a UN contexto: reporte (`pet_id`), adopcion
  // (`adoption_id`), o reporte borrado (los DOS null, caso 0017).
  adoption_id: string | null;
  from_user: string;
  to_user: string;
  texto: string;
  leido: boolean;
  creado_en: string;
}

// Contexto EXPLICITO de un hilo. La 0030 generalizo el chat para que sirva a
// reportes y a adopciones, y un mensaje de adopcion tambien tiene `pet_id`
// null. Por eso no alcanza con "pet_id o null": hay que distinguir a proposito
// el reporte borrado (ambos null) de la adopcion (`adoption_id` set). Si se
// consultara un hilo de adopcion con `.is('pet_id', null)`, matchearia por
// error los mensajes de reportes borrados entre las mismas dos personas.
export type HiloCtx =
  | { tipo: 'pet'; id: string }
  | { tipo: 'pet_borrado' } // pet_id null Y adoption_id null
  | { tipo: 'adopcion'; id: string };

// Aplica el filtro de contexto del hilo a una consulta ya armada. Es el UNICO
// lugar donde se traduce el `HiloCtx` a columnas; el resto del servicio lo
// reusa para no repetir (ni desincronizar) los tres branches.
//
// - `pet`          → `.eq('pet_id', id)`
// - `adopcion`     → `.eq('adoption_id', id)`
// - `pet_borrado`  → `.is('pet_id', null).is('adoption_id', null)`  (los DOS)
//
// `.eq('pet_id', null)` genera `pet_id=eq.null`, que en PostgREST NO matchea
// filas con NULL (hay que pedirlo con `.is`). Y para el reporte borrado hay que
// exigir los dos null, si no un mensaje de adopcion (pet_id null, adoption_id
// set) se colaria.
function aplicarCtx(query: any, ctx: HiloCtx): any {
  switch (ctx.tipo) {
    case 'pet':
      return query.eq('pet_id', ctx.id);
    case 'adopcion':
      return query.eq('adoption_id', ctx.id);
    case 'pet_borrado':
      return query.is('pet_id', null).is('adoption_id', null);
  }
}

// Deriva el contexto de un mensaje ya traido de la base. Prioridad: un reporte
// vivo (`pet_id`) manda; si no, una adopcion (`adoption_id`); si ninguno, es un
// reporte borrado (0017).
function ctxDeMensaje(m: Pick<Message, 'pet_id' | 'adoption_id'>): HiloCtx {
  if (m.pet_id != null) return { tipo: 'pet', id: m.pet_id };
  if (m.adoption_id != null) return { tipo: 'adopcion', id: m.adoption_id };
  return { tipo: 'pet_borrado' };
}

// Clave de agrupado por contexto: `p:`/`a:`/`del`. Asi un hilo de adopcion, uno
// de reporte y uno de reporte-borrado entre las mismas dos personas NO se
// funden (cada uno tiene su propio prefijo).
function claveHilo(ctx: HiloCtx): string {
  switch (ctx.tipo) {
    case 'pet':
      return 'p:' + ctx.id;
    case 'adopcion':
      return 'a:' + ctx.id;
    case 'pet_borrado':
      return 'del';
  }
}

// ¿Un mensaje pertenece a este hilo? Se usa del lado del cliente (realtime),
// donde el filtro del servidor es grueso: para `pet_borrado` el canal escucha
// `pet_id=is.null`, que tambien entregaria mensajes de adopcion; este predicado
// cierra esa grieta exigiendo tambien `adoption_id` null.
export function mensajePerteneceAlHilo(m: Message, ctx: HiloCtx): boolean {
  switch (ctx.tipo) {
    case 'pet':
      return m.pet_id === ctx.id;
    case 'adopcion':
      return m.adoption_id === ctx.id;
    case 'pet_borrado':
      return m.pet_id == null && m.adoption_id == null;
  }
}

// Params de navegacion (`{ petId?, adoptionId? }`) → `HiloCtx`. La navegacion
// pasa datos serializables (no objetos discriminados), asi que ChatScreen
// reconstruye el ctx aca. Una adopcion manda sobre un reporte; sin ninguno de
// los dos es un reporte borrado.
export function ctxDeParams(p: { petId?: string | null; adoptionId?: string | null }): HiloCtx {
  if (p.adoptionId) return { tipo: 'adopcion', id: p.adoptionId };
  if (p.petId) return { tipo: 'pet', id: p.petId };
  return { tipo: 'pet_borrado' };
}

// `HiloCtx` → params de navegacion. Inversa de `ctxDeParams`: la lista de
// conversaciones guarda el ctx y lo convierte para abrir el chat.
export function paramsDeCtx(ctx: HiloCtx): { petId?: string; adoptionId?: string } {
  if (ctx.tipo === 'adopcion') return { adoptionId: ctx.id };
  if (ctx.tipo === 'pet') return { petId: ctx.id };
  return {};
}

export async function countUnread(me: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('to_user', me)
    .eq('leido', false);
  if (error) throw error;
  return count ?? 0;
}

export async function markThreadRead(ctx: HiloCtx, me: string, other: string): Promise<void> {
  const query = supabase
    .from('messages')
    .update({ leido: true })
    .eq('to_user', me)
    .eq('from_user', other)
    .eq('leido', false);
  const { error } = await aplicarCtx(query, ctx);
  if (error) throw error;
}

export async function sendMessage(ctx: HiloCtx, fromUser: string, toUser: string, texto: string) {
  const clean = texto.trim();
  if (!clean) throw new Error('Mensaje vacío');
  // Un mensaje pertenece a UN contexto: se setea la columna que corresponde y
  // la otra queda null. El reporte borrado deja las dos null.
  const { error } = await supabase.from('messages').insert({
    pet_id: ctx.tipo === 'pet' ? ctx.id : null,
    adoption_id: ctx.tipo === 'adopcion' ? ctx.id : null,
    from_user: fromUser,
    to_user: toUser,
    texto: clean,
  });
  if (error) throw error;
}

export async function listMessages(ctx: HiloCtx, me: string, other: string): Promise<Message[]> {
  const query = supabase
    .from('messages')
    .select('*')
    .or(`and(from_user.eq.${me},to_user.eq.${other}),and(from_user.eq.${other},to_user.eq.${me})`)
    .order('creado_en', { ascending: true });
  const { data, error } = await aplicarCtx(query, ctx);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export type ConversationKey = {
  // Contexto EXPLICITO del hilo (reporte / adopcion / reporte borrado). Reemplaza
  // al viejo `petId` nullable: con adopciones en juego, "pet_id null" ya no
  // identifica un hilo por si solo.
  ctx: HiloCtx;
  otherUser: string;
  lastTexto: string;
  lastAt: string;
};

export type Conversation = ConversationKey & {
  otherNombre: string;
  /** True si la otra parte borró su cuenta: no se le puede escribir. */
  otherEliminado: boolean;
  petLabel: string;
};

// Pliega una página de mensajes (ordenados de más nuevo a más viejo) DENTRO de
// un mapa acumulador. "El primero visto gana", por eso el orden desc importa: el
// primer mensaje que se ve de cada hilo es el más nuevo, y ese es el que queda
// como `lastTexto`/`lastAt`. Se separó de `foldConversations` para poder plegar
// página por página en `listConversations` sin tener que juntar TODOS los
// mensajes en memoria antes de agrupar.
function foldPageInto(threads: Map<string, ConversationKey>, msgs: Message[], me: string): void {
  for (const m of msgs) {
    const otherUser = m.from_user === me ? m.to_user : m.from_user;
    const ctx = ctxDeMensaje(m);
    // La clave separa por contexto (`p:`/`a:`/`del`) y por el otro usuario. Asi
    // un hilo de adopcion, uno de reporte y uno de reporte-borrado con la MISMA
    // persona no se funden. Los reportes borrados de una misma persona SI se
    // funden entre si (clave `del:<otro>`), a proposito (0017).
    const key = `${claveHilo(ctx)}:${otherUser}`;
    if (!threads.has(key)) {
      threads.set(key, { ctx, otherUser, lastTexto: m.texto, lastAt: m.creado_en });
    }
  }
}

// Pura: asume msgs ordenados de más nuevo a más viejo. Un hilo por (contexto, otro usuario).
export function foldConversations(msgs: Message[], me: string): ConversationKey[] {
  const threads = new Map<string, ConversationKey>();
  foldPageInto(threads, msgs, me);
  return [...threads.values()];
}

// Tamaño de página al barrer la historia de mensajes. Se pagina a propósito y
// NO se usa un `.limit(500)`: ese atajo corta por recencia de MENSAJE, no de
// CONVERSACIÓN, así que una conversación vieja pero viva (mucho tráfico de otros
// hilos por encima) desaparecería de la lista SIN ningún error —exactamente la
// clase de pérdida silenciosa que ya se coló tres veces en este proyecto—. Y
// tampoco se deja la consulta sin cota: una consulta sin `.range()` depende del
// tope de filas del servidor (PostgREST), que si algún día se configura truncaría
// la historia en silencio y volvería a esconder hilos. Paginando y plegando cada
// página se ven TODOS los mensajes, así que ningún hilo se pierde, sin tener que
// traerlos todos juntos a memoria de una vez.
//
// El agrupado real (una sola consulta con `distinct on` en el servidor) está
// diseñado en el spec de la Tanda D como paso siguiente; requiere una RPC y su
// migración. Mientras no exista, esto es correcto: no pierde hilos.
const PAGINA_MENSAJES = 1000;

export async function listConversations(me: string): Promise<Conversation[]> {
  const threads = new Map<string, ConversationKey>();
  // Barremos la historia por páginas y plegamos cada una. Se ordena además por
  // `id` para desempatar `creado_en` repetidos: sin ese segundo criterio, dos
  // mensajes con el mismo instante podrían caer en distinta página de forma no
  // determinista y saltearse en el borde (el mismo bug del cursor de distancia
  // que salteaba filas).
  for (let desde = 0; ; desde += PAGINA_MENSAJES) {
    const { data, error } = await supabase
      .from('messages')
      // Solo las columnas que necesita el agrupado y el enriquecido: sin `id`
      // ni `leido`, que la lista de conversaciones no usa. Se suma `adoption_id`
      // (0030) para poder distinguir el contexto de cada hilo.
      .select('pet_id, adoption_id, from_user, to_user, texto, creado_en')
      .or(`from_user.eq.${me},to_user.eq.${me}`)
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + PAGINA_MENSAJES - 1);
    if (error) throw error;
    const pagina = (data ?? []) as Message[];
    foldPageInto(threads, pagina, me);
    // Página incompleta = era la última. Es lo que corta el bucle.
    if (pagina.length < PAGINA_MENSAJES) break;
  }
  const base = [...threads.values()];
  if (base.length === 0) return [];

  const userIds = [...new Set(base.map((t) => t.otherUser))];
  // Se enriquecen por separado los hilos de reporte (contra `pets`) y los de
  // adopcion (contra `adoptions`). Los reportes borrados no consultan nada.
  const petIds = [
    ...new Set(base.filter((t) => t.ctx.tipo === 'pet').map((t) => (t.ctx as { id: string }).id)),
  ];
  const adoptionIds = [
    ...new Set(base.filter((t) => t.ctx.tipo === 'adopcion').map((t) => (t.ctx as { id: string }).id)),
  ];
  const consultaPerfiles = (select: string) =>
    supabase.from('profiles').select(select).in('id', userIds);

  // Si no hay hilos de reporte (o de adopcion) vivos, se evita el viaje de red:
  // `.in('id', [])` no aporta nada.
  const consultaPets = petIds.length > 0
    ? supabase.from('pets').select('id, estado, especie').in('id', petIds)
    : Promise.resolve({ data: [] as any[], error: null });
  const consultaAdopciones = adoptionIds.length > 0
    ? supabase.from('adoptions').select('id, especie, nombre').in('id', adoptionIds)
    : Promise.resolve({ data: [] as any[], error: null });

  const [profsIntento, petsRes, adoptionsRes] = await Promise.all([
    consultaPerfiles('id, nombre, eliminado_en'),
    consultaPets,
    consultaAdopciones,
  ]);
  let profsRes = profsIntento;
  if (profsRes.error) {
    // La consulta con `eliminado_en` fallo (probablemente porque la migracion
    // 0017 todavia no esta aplicada). PostgREST no devuelve datos parciales:
    // si no reintentamos sin esa columna, `data` llega null y TODOS los
    // usuarios pierden su nombre real (no solo las cuentas borradas), aunque
    // esten vivos. Reintentamos pidiendo solo `nombre` para mantener el
    // comportamiento de siempre hasta que la migracion se aplique. Cuando
    // lleve tiempo aplicada, este escalon queda muerto y se puede sacar.
    profsRes = await consultaPerfiles('id, nombre');
  }
  const perfilById = new Map<string, { nombre: string | null; eliminadoEn: string | null }>(
    (profsRes.data ?? []).map((p: any) => [p.id, { nombre: p.nombre, eliminadoEn: p.eliminado_en ?? null }]),
  );
  const petById = new Map<string, string>(
    (petsRes.data ?? []).map((p: any) => [p.id, `${p.estado} · ${p.especie}`]),
  );
  const adoptionById = new Map<string, string>(
    (adoptionsRes.data ?? []).map((a: any) => {
      const nombre = (a.nombre ?? '').trim();
      return [a.id, `En adopción · ${nombre || a.especie}`];
    }),
  );

  return base.map((t) => {
    const perfil = perfilById.get(t.otherUser) ?? { nombre: null, eliminadoEn: null };
    return {
      ...t,
      otherNombre: nombreDeAutor(perfil.nombre, perfil.eliminadoEn),
      otherEliminado: perfil.eliminadoEn !== null,
      petLabel: etiquetaHilo(t.ctx, petById, adoptionById),
    };
  });
}

// Etiqueta legible del contexto de un hilo para la lista de conversaciones.
// - reporte vivo   → "<estado> · <especie>" (o 'Mascota' si no se pudo cargar)
// - adopcion       → "En adopción · <nombre|especie>" (o 'En adopción')
// - reporte borrado → "Reporte eliminado": mas honesto que 'Mascota', que
//   sugeriria que el reporte todavia existe (ver messages_pet_id_fkey, 0017).
function etiquetaHilo(
  ctx: HiloCtx,
  petById: Map<string, string>,
  adoptionById: Map<string, string>,
): string {
  switch (ctx.tipo) {
    case 'pet':
      return petById.get(ctx.id) ?? 'Mascota';
    case 'adopcion':
      return adoptionById.get(ctx.id) ?? 'En adopción';
    case 'pet_borrado':
      return 'Reporte eliminado';
  }
}

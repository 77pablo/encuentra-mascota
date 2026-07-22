import { supabase } from '../lib/supabase';
import { ErrorAmigable } from '../lib/dbErrors';
import { moderarTextoUnico } from '../lib/moderarTexto';

// PREGUNTAS PÚBLICAS DE ADOPCIÓN — acceso a `adoption_questions` (F3, migración
// 0032). Mismo patrón que `tips.ts` (pistas del barrio): lectura con firma del
// autor vía join a `profiles`, con un escalón sin ese join para cuando la
// sesión (o la migración) no permite resolverlo.

export interface AdoptionQuestion {
  id: string;
  adoptionId: string;
  userId: string;
  pregunta: string;
  respuesta: string | null;
  creadoEn: string;
  respondidoEn: string | null;
  /** Nombre del autor cuando se puede resolver; null para el invitado. */
  autorNombre?: string | null;
  /** Fecha en que el autor borró su cuenta, si la borró. */
  autorEliminadoEn?: string | null;
}

// Fila cruda tal como llega de PostgREST. `profiles` viene como objeto en
// runtime, pero los tipos generados lo infieren como arreglo (mismo caso que
// `tips.ts`/`favorites`): se normalizan las dos formas en `aPregunta`.
type FilaPregunta = {
  id: string;
  adoption_id: string;
  user_id: string;
  pregunta: string;
  respuesta: string | null;
  creado_en: string;
  respondido_en: string | null;
  profiles?:
    | { nombre: string | null; eliminado_en?: string | null }
    | Array<{ nombre: string | null; eliminado_en?: string | null }>
    | null;
};

const SELECT_CON_AUTOR =
  'id, adoption_id, user_id, pregunta, respuesta, creado_en, respondido_en, profiles(nombre, eliminado_en)';
// Escalón sin el embed a `profiles`: sin sesión (modo invitado) el embed no
// siempre se puede resolver. El texto de la pregunta importa más que la firma.
const SELECT_SIN_AUTOR = 'id, adoption_id, user_id, pregunta, respuesta, creado_en, respondido_en';

function aPregunta(fila: FilaPregunta): AdoptionQuestion {
  const perfil = Array.isArray(fila.profiles) ? fila.profiles[0] ?? null : fila.profiles ?? null;
  return {
    id: fila.id,
    adoptionId: fila.adoption_id,
    userId: fila.user_id,
    pregunta: fila.pregunta,
    respuesta: fila.respuesta,
    creadoEn: fila.creado_en,
    respondidoEn: fila.respondido_en,
    autorNombre: perfil?.nombre ?? null,
    autorEliminadoEn: perfil?.eliminado_en ?? null,
  };
}

// Preguntas de una publicación, de la más nueva a la más vieja. Degrada a la
// forma sin firma si el embed a `profiles` no se puede resolver (invitado),
// y a vacío si la consulta falla por completo.
export async function listQuestions(adoptionId: string): Promise<AdoptionQuestion[]> {
  const consulta = (select: string) =>
    supabase
      .from('adoption_questions')
      .select(select)
      .eq('adoption_id', adoptionId)
      .order('creado_en', { ascending: false });

  try {
    const conAutor = await consulta(SELECT_CON_AUTOR);
    if (!conAutor.error) {
      return ((conAutor.data ?? []) as unknown as FilaPregunta[]).map(aPregunta);
    }
    const sinAutor = await consulta(SELECT_SIN_AUTOR);
    if (sinAutor.error) return [];
    return ((sinAutor.data ?? []) as unknown as FilaPregunta[]).map(aPregunta);
  } catch {
    return [];
  }
}

// Deja una pregunta a nombre de quien tiene la sesión abierta (la RLS exige
// que `user_id` sea el propio). Pasa por moderación ANTES de escribir en la
// base — mismo criterio que publicar/editar un reporte o una adopción.
export async function askQuestion(adoptionId: string, pregunta: string): Promise<AdoptionQuestion> {
  const limpia = pregunta.trim();
  if (!limpia) throw new ErrorAmigable('Escribí tu pregunta.');

  const moderacion = moderarTextoUnico(limpia);
  if (!moderacion.ok) throw new ErrorAmigable(moderacion.motivo);

  const { data: sesion } = await supabase.auth.getUser();
  const userId = sesion?.user?.id;
  if (!userId) throw new ErrorAmigable('Necesitás tener la sesión abierta para preguntar.');

  const { data, error } = await supabase
    .from('adoption_questions')
    .insert({ adoption_id: adoptionId, user_id: userId, pregunta: limpia })
    .select(SELECT_SIN_AUTOR)
    .single();
  if (error) throw error;
  return aPregunta(data as unknown as FilaPregunta);
}

// Responde una pregunta (solo el dueño de la publicación, por la RLS de
// 0032 — el `update` de columnas está además restringido a `respuesta` y
// `respondido_en`). Pasa por moderación igual que preguntar.
//
// Se pide `.select()` a propósito: cuando la RLS rechaza el update, PostgREST
// NO devuelve error, simplemente no actualiza ninguna fila. Sin este chequeo
// la pantalla diría "listo" y la pregunta seguiría sin respuesta.
export async function answerQuestion(id: string, respuesta: string): Promise<void> {
  const limpia = respuesta.trim();
  if (!limpia) throw new ErrorAmigable('Escribí una respuesta.');

  const moderacion = moderarTextoUnico(limpia);
  if (!moderacion.ok) throw new ErrorAmigable(moderacion.motivo);

  const { data, error } = await supabase
    .from('adoption_questions')
    .update({ respuesta: limpia, respondido_en: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ErrorAmigable('No se pudo responder: puede que ya no seas el dueño de esta publicación.');
  }
}

// Borra una pregunta (autor de la pregunta o dueño de la publicación, según la
// RLS de 0032). Mismo chequeo de "0 filas = RLS rechazó" que `answerQuestion`.
export async function deleteQuestion(id: string): Promise<void> {
  const { data, error } = await supabase.from('adoption_questions').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ErrorAmigable('No se pudo borrar la pregunta.');
  }
}

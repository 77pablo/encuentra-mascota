import { supabase } from '../lib/supabase';
import { ErrorAmigable } from '../lib/dbErrors';

// DENUNCIAR EN TODAS PARTES — acceso a `denuncias` (migracion 0003, extendida
// en la pieza 2 de la Tanda B con: tipo, objeto_id, usuario_denunciado, detalle).
//
// Apple 1.2 y Play piden poder denunciar el contenido y a las personas, no solo
// un reporte. Antes este archivo tenia una sola funcion (denunciarPet); ahora
// hay una por cada cosa denunciable, todas finitas y con el mismo tipo de motivo.
//
// Diseno completo en docs/superpowers/specs/2026-07-19-tanda-b-tiendas-design.md
// (pieza 2).

// Lista CERRADA de motivos, en español. No es texto libre: se agrupa y se valida
// tambien en el servidor. La UI ofrece exactamente estos.
export const MOTIVOS_DENUNCIA = [
  'Contenido ofensivo',
  'Estafa o pedido de dinero',
  'Información falsa',
  'Spam',
  'Otro',
] as const;
export type MotivoDenuncia = (typeof MOTIVOS_DENUNCIA)[number];

// Tipos de objeto denunciable. `reporte` es el historico (0003); el resto se
// agrego en la pieza 2. La columna `tipo` en la base tiene una CHECK con esta
// misma lista.
export type TipoDenuncia =
  | 'reporte'
  | 'usuario'
  | 'mensaje'
  | 'pista'
  | 'avistamiento'
  | 'adopcion'
  | 'pregunta_adopcion';

// El `detalle` es texto libre corto y OPCIONAL. Sin el, el dueño lee "acoso"
// contra un uuid y no tiene forma de actuar sobre un mensaje que la RLS no le
// deja leer. ⚠️ Lo escribe un usuario: si algun dia se muestra en un correo, hay
// que escaparlo.
type FilaDenuncia = {
  reporter_user: string;
  motivo: string;
  tipo: TipoDenuncia;
  pet_id?: string | null;
  objeto_id?: string | null;
  usuario_denunciado?: string | null;
  detalle?: string | null;
};

// El unico parcial (denunciar dos veces lo mismo) se traduce a un mensaje
// amable en vez de un error.
function traducirDuplicado(error: { code?: string } | null): void {
  if (error?.code === '23505') {
    throw new ErrorAmigable('Ya denunciaste esto. Lo estamos revisando.');
  }
}

// ¿El error viene de que las columnas de la pieza 2 (tipo/objeto_id/…) todavia
// no existen? Postgres devuelve 42703 (undefined_column) y PostgREST PGRST204
// (columna fuera del cache de esquema). Sirve para el escalon de compatibilidad.
function esColumnaFaltante(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('could not find') || (msg.includes('column') && msg.includes('does not exist'));
}

// Inserta la denuncia y traduce el parcial. Cualquier otro error se propaga.
async function insertarDenuncia(fila: FilaDenuncia): Promise<void> {
  const detalle = fila.detalle?.trim() || null;
  const { error } = await supabase.from('denuncias').insert({ ...fila, detalle });
  if (!error) return;
  traducirDuplicado(error);
  throw error;
}

// Denunciar un REPORTE de mascota (el caso historico).
//
// Escalon de compatibilidad: mientras la migracion de la pieza 2 (columnas
// tipo/objeto_id/usuario_denunciado/detalle) no este aplicada, insertar `tipo`
// falla. En ese caso reintentamos con la forma historica de la 0003 (solo
// pet_id/reporter_user/motivo), para no regresar la unica denuncia que ya
// existia. Mismo patron de "escalon" que tips.ts y messages.ts.
export async function denunciarReporte(
  petId: string,
  reporterUser: string,
  motivo: string,
  detalle?: string,
): Promise<void> {
  try {
    await insertarDenuncia({ tipo: 'reporte', pet_id: petId, reporter_user: reporterUser, motivo, detalle });
  } catch (e: any) {
    if (e instanceof ErrorAmigable || !esColumnaFaltante(e)) throw e;
    const { error } = await supabase
      .from('denuncias')
      .insert({ pet_id: petId, reporter_user: reporterUser, motivo });
    if (error) {
      traducirDuplicado(error);
      throw error;
    }
  }
}

// Denunciar a una PERSONA (desde su perfil publico o desde el chat).
export async function denunciarUsuario(
  usuarioDenunciado: string,
  reporterUser: string,
  motivo: string,
  detalle?: string,
): Promise<void> {
  await insertarDenuncia({
    tipo: 'usuario',
    usuario_denunciado: usuarioDenunciado,
    reporter_user: reporterUser,
    motivo,
    detalle,
  });
}

// Denunciar un MENSAJE puntual del chat (pulsacion larga sobre la burbuja).
export async function denunciarMensaje(
  mensajeId: string,
  reporterUser: string,
  motivo: string,
  detalle?: string,
): Promise<void> {
  await insertarDenuncia({ tipo: 'mensaje', objeto_id: mensajeId, reporter_user: reporterUser, motivo, detalle });
}

// Denunciar una PISTA del barrio.
export async function denunciarPista(
  pistaId: string,
  reporterUser: string,
  motivo: string,
  detalle?: string,
): Promise<void> {
  await insertarDenuncia({ tipo: 'pista', objeto_id: pistaId, reporter_user: reporterUser, motivo, detalle });
}

// Denunciar un AVISTAMIENTO.
export async function denunciarAvistamiento(
  avistamientoId: string,
  reporterUser: string,
  motivo: string,
  detalle?: string,
): Promise<void> {
  await insertarDenuncia({
    tipo: 'avistamiento',
    objeto_id: avistamientoId,
    reporter_user: reporterUser,
    motivo,
    detalle,
  });
}

// Denunciar una publicacion de ADOPCION (paridad con el resto de reportes;
// la usa el detalle de adopcion).
export async function denunciarAdopcion(
  adoptionId: string,
  reporterUser: string,
  motivo: string,
  detalle?: string,
): Promise<void> {
  await insertarDenuncia({ tipo: 'adopcion', objeto_id: adoptionId, reporter_user: reporterUser, motivo, detalle });
}

// Denunciar una PREGUNTA de adopción (F3, migración 0032). A diferencia de
// `denunciarPista`/`denunciarAvistamiento` (que solo identifican el objeto),
// acá también se manda `usuario_denunciado`: quien denuncia una pregunta está
// denunciando a la vez el contenido puntual y a quien la escribió (igual que
// `denunciarUsuario`, pero atado al objeto concreto).
export async function denunciarPregunta(
  preguntaId: string,
  usuarioDenunciado: string,
  reporterUser: string,
  motivo: string,
  detalle?: string,
): Promise<void> {
  await insertarDenuncia({
    tipo: 'pregunta_adopcion',
    objeto_id: preguntaId,
    usuario_denunciado: usuarioDenunciado,
    reporter_user: reporterUser,
    motivo,
    detalle,
  });
}

// Compatibilidad: la firma vieja que usaba PetDetailScreen. Delega en
// denunciarReporte para no romper llamadores que todavia la importen.
export async function denunciarPet(petId: string, reporterUser: string, motivo: string): Promise<void> {
  await denunciarReporte(petId, reporterUser, motivo);
}

import { supabase } from '../lib/supabase';

// PANEL DE MODERACION — bandeja de denuncias pendientes solo-admin.
//
// Toda la logica de "quien puede ver/actuar" vive del lado del servidor
// (RPCs security definer que chequean es_admin() por dentro, migracion
// 0036b): un no-admin nunca llega a ejecutar el cuerpo de estas funciones,
// asi que ni siquiera hace falta chequear el rol aca antes de llamar.

export interface DenunciaPendiente {
  id: string;
  tipo: string;
  motivo: string;
  detalle: string | null;
  creadoEn: string;
  reporterId: string | null;
  reporterNombre: string | null;
  denunciadoId: string | null;
  denunciadoNombre: string | null;
  objetoId: string | null;
  petId: string | null;
  denunciasContraDenunciado: number;
  contenido: Record<string, unknown> | null;
}

// Trae las denuncias pendientes con el snapshot de su contenido, mas antigua
// primero. Lanza si el llamador no es admin (la RPC hace `raise exception`).
export async function bandeja(): Promise<DenunciaPendiente[]> {
  const { data, error } = await supabase.rpc('moderacion_bandeja');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    motivo: r.motivo,
    detalle: r.detalle,
    creadoEn: r.creado_en,
    reporterId: r.reporter_id,
    reporterNombre: r.reporter_nombre,
    denunciadoId: r.denunciado_id,
    denunciadoNombre: r.denunciado_nombre,
    objetoId: r.objeto_id,
    petId: r.pet_id,
    denunciasContraDenunciado: Number(r.denuncias_contra_denunciado ?? 0),
    contenido: r.contenido ?? null,
  }));
}

// Retira el contenido denunciado (oculta o borra segun el tipo), resuelve la
// denuncia y cierra en lote las demas denuncias pendientes del mismo objeto.
export async function retirar(id: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_retirar', { p_denuncia_id: id });
  if (error) throw error;
}

// Descarta la denuncia sin tocar el contenido (se revisó y no ameritaba accion).
export async function descartar(id: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_descartar', { p_denuncia_id: id });
  if (error) throw error;
}

// Suspende la cuenta del usuario denunciado: no vuelve a poder publicar ni
// escribir (RLS de insert, migracion 0036) hasta que se levante a mano.
export async function suspender(usuarioId: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_suspender', { p_usuario_id: usuarioId });
  if (error) throw error;
}

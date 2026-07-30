import { supabase } from '../lib/supabase';

// PANEL DE MODERACION — bandeja de denuncias pendientes solo-admin.
//
// Toda la logica de "quien puede ver/actuar" vive del lado del servidor
// (RPCs security definer que chequean es_admin() por dentro, migracion
// 0040): un no-admin nunca llega a ejecutar el cuerpo de estas funciones,
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

export interface ResultadoRetiro {
  // true = el contenido se retiró, pero la foto sigue en el bucket. No es un
  // fallo del retiro: la pantalla lo dice aparte y el barrido se reintenta solo.
  fotoPendiente: boolean;
}

// Borra de Storage las fotos de los mensajes retirados (Edge Function
// `moderar-borrar-foto`, migración 0043). Desde SQL no se puede borrar un
// objeto del bucket, así que el retiro solo ENCOLA la ruta y esto la barre.
//
// BEST-EFFORT PERO NUNCA MUDO: devuelve false en vez de lanzar (el retiro ya
// ocurrió y es lo importante), pero deja el motivo en la consola. Un
// `.catch(() => {})` acá fue lo que escondió durante semanas que `send-push` ni
// siquiera estaba desplegada. Como la cola no se vacía hasta que Storage
// confirma, lo que falla hoy lo levanta el próximo retiro de mensaje.
//
// No recibe ni manda rutas: solo el id de la denuncia. La Edge Function corre
// con service_role y se saltea la RLS de Storage; una ruta elegida por el
// cliente sería borrarle archivos a cualquiera.
export async function barrerFotosRetiradas(denunciaId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('moderar-borrar-foto', {
      body: { denunciaId },
    });
    if (error) {
      console.error('moderar-borrar-foto falló', error);
      return false;
    }
    if (!data?.ok) {
      console.error('moderar-borrar-foto respondió sin ok', data);
      return false;
    }
    // 200 con fotos sin confirmar = borrado parcial. Cuenta como pendiente: la
    // foto sigue accesible por su URL hasta que un barrido posterior la saque.
    if (typeof data.pendientes === 'number' && data.pendientes > 0) {
      console.error(`moderar-borrar-foto dejó ${data.pendientes} fotos sin borrar`);
      return false;
    }
    return true;
  } catch (e) {
    // La función puede no estar desplegada todavía: invoke lanza y el retiro no
    // tiene por qué caerse con ella.
    console.error('moderar-borrar-foto no se pudo invocar', e);
    return false;
  }
}

// Retira el contenido denunciado (oculta o borra segun el tipo), resuelve la
// denuncia y cierra en lote las demas denuncias pendientes del mismo objeto.
//
// `tipo` es opcional y solo decide si además hay que barrer la foto del bucket:
// el único contenido que deja un archivo huérfano al retirarse es el mensaje de
// chat (su fila se borra; los reportes y adopciones solo se ocultan y conservan
// sus fotos a propósito).
export async function retirar(id: string, tipo?: string): Promise<ResultadoRetiro> {
  const { error } = await supabase.rpc('moderar_retirar', { p_denuncia_id: id });
  if (error) throw error;
  // Después del RPC y nunca antes: si el retiro falla no hay nada encolado que
  // barrer, y si el barrido falla el retiro ya está hecho igual.
  if (tipo !== 'mensaje') return { fotoPendiente: false };
  return { fotoPendiente: !(await barrerFotosRetiradas(id)) };
}

// Descarta la denuncia sin tocar el contenido (se revisó y no ameritaba accion).
export async function descartar(id: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_descartar', { p_denuncia_id: id });
  if (error) throw error;
}

// Suspende la cuenta del usuario denunciado: no vuelve a poder publicar ni
// escribir (RLS de insert, migracion 0036) hasta que se levante a mano.
// Recibe el id de la DENUNCIA (no el del usuario): la RPC (0040) deriva el
// usuario objetivo del lado del servidor -coalesce(usuario_denunciado, autor
// del contenido segun tipo)- porque para reporte/pista/avistamiento/
// adopcion/mensaje `usuario_denunciado` viene null y el cliente no tiene ese
// dato. De paso resuelve la denuncia, asi que sale de la bandeja.
export async function suspender(denunciaId: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_suspender', { p_denuncia_id: denunciaId });
  if (error) throw error;
}

export interface CuentaSuspendida {
  id: string;
  nombre: string | null;
  suspendidoEn: string;
}

// Las cuentas suspendidas hoy, mas reciente primero (RPC de la 0045).
//
// Hace falta una pantalla propia porque al suspender, la denuncia queda resuelta
// y sale de la bandeja: sin esta lista no habia forma de saber a quien se habia
// suspendido, y por lo tanto tampoco de deshacerlo. `profiles` no se puede leer
// directo (grants por columna desde la 0018, y `suspendido_en` de la 0036 no se
// le concedio a nadie), asi que la RPC definer es la unica via.
export async function suspendidos(): Promise<CuentaSuspendida[]> {
  const { data, error } = await supabase.rpc('moderacion_suspendidos');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    suspendidoEn: r.suspendido_en,
  }));
}

// Levanta la suspension: la persona vuelve a poder publicar y escribir.
//
// Recibe el id del USUARIO, no de una denuncia (ver `suspendidos`). La RPC lanza
// si la cuenta no estaba suspendida en vez de no hacer nada, y ese error se
// propaga a proposito: un "listo, reactivada" sobre una cuenta que sigue
// suspendida es peor que un error a la vista.
export async function reactivar(usuarioId: string): Promise<void> {
  const { error } = await supabase.rpc('moderar_reactivar', { p_usuario_id: usuarioId });
  if (error) throw error;
}

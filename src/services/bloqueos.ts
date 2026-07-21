import { supabase } from '../lib/supabase';
import { ErrorAmigable } from '../lib/dbErrors';

// BLOQUEO DE USUARIOS — acceso a `bloqueos` (migracion 0022).
//
// Lectura ASIMETRICA a proposito: la RLS de 0022 solo deja leer/insertar/borrar
// las filas donde uno es el BLOQUEADOR. Por eso desde el cliente solo se puede
// saber a quien bloquee YO (para el boton y para ocultar su contenido), nunca
// quien me bloqueo a mi. La unica pregunta bidireccional posible es
// `hayBloqueoCon`, que va contra el RPC `hay_bloqueo_con` (security definer,
// un solo parametro) y solo dice si HAY bloqueo, sin revelar la direccion.

// ------------------------------------------------------------
// Logica pura (sin red) — se prueba sola.
// ------------------------------------------------------------

// Quita de una lista los items cuyo autor esta en el conjunto de bloqueados.
// Se usa para ocultar pistas, avistamientos y novedades de gente que bloquee.
// Cosmetico a proposito: son datos publicos (se leen sin cuenta por diseno), el
// bloqueo protege de una PERSONA en la interfaz, no es un control de acceso.
export function filtrarBloqueados<T>(
  items: T[],
  bloqueados: ReadonlySet<string>,
  autorDe: (item: T) => string | null | undefined,
): T[] {
  if (bloqueados.size === 0) return items;
  return items.filter((item) => {
    const autor = autorDe(item);
    return !autor || !bloqueados.has(autor);
  });
}

// ------------------------------------------------------------
// Acceso a la base
// ------------------------------------------------------------

async function miId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (!id) throw new ErrorAmigable('Necesitás tener la sesión abierta para bloquear a alguien.');
  return id;
}

// Bloquea a otra persona. La RLS exige que `bloqueador` sea el propio, asi que
// se ancla a la sesion. Idempotente: si ya estaba bloqueada, la clave primaria
// devuelve 23505 y lo tomamos como exito (ya estaba hecho).
export async function bloquear(otroUserId: string): Promise<void> {
  const yo = await miId();
  const { error } = await supabase
    .from('bloqueos')
    .insert({ bloqueador: yo, bloqueado: otroUserId });
  if (error && error.code !== '23505') throw error;
}

// Deshace un bloqueo propio. Reabre el canal SOLO de mi lado: si el otro tambien
// me bloqueo, su fila sigue y `hay_bloqueo_con` sigue dando true.
export async function desbloquear(otroUserId: string): Promise<void> {
  const yo = await miId();
  const { error } = await supabase
    .from('bloqueos')
    .delete()
    .eq('bloqueador', yo)
    .eq('bloqueado', otroUserId);
  if (error) throw error;
}

// ¿Yo tengo un bloqueo PUESTO sobre esta persona? Es lo que decide el boton
// Bloquear/Desbloquear: solo puedo desbloquear lo que yo bloquee. Lee mis
// propias filas (la RLS ya limita a `bloqueador = auth.uid()`), asi que nunca
// revela un bloqueo ajeno.
export async function bloqueEmitido(otroUserId: string): Promise<boolean> {
  const yo = await miId();
  const { data, error } = await supabase
    .from('bloqueos')
    .select('bloqueado')
    .eq('bloqueador', yo)
    .eq('bloqueado', otroUserId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// ¿Hay bloqueo entre yo y el otro, en CUALQUIER direccion? Va contra el RPC
// security definer, que es lo unico que puede leer la fila del otro sentido sin
// romper la asimetria. No dice quien bloqueo a quien.
export async function hayBloqueoCon(otroUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('hay_bloqueo_con', { p_otro: otroUserId });
  if (error) throw error;
  return Boolean(data);
}

// Ids de las personas que YO bloquee. Se usa para ocultar su contenido en las
// listas del cliente (pistas, avistamientos, novedades). Degrada a conjunto
// vacio si la tabla todavia no existe o si no hay sesion: misma tolerancia que
// FavoritesProvider, para que la app siga funcionando como siempre.
export async function idsBloqueados(): Promise<Set<string>> {
  try {
    const { data } = await supabase.auth.getUser();
    const yo = data?.user?.id;
    if (!yo) return new Set();
    const res = await supabase.from('bloqueos').select('bloqueado').eq('bloqueador', yo);
    if (res.error || !res.data) return new Set();
    return new Set((res.data as Array<{ bloqueado: string }>).map((r) => r.bloqueado));
  } catch {
    return new Set();
  }
}

import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  nombre: string;
  foto_perfil: string | null;
  telefono: string | null;
  red_social: string | null;
  creado_en: string;
}

// El telefono y la red social ya no se pueden leer con un select: la migracion
// 0018 le quito al rol `authenticated` el permiso sobre esas dos columnas, para
// todos y tambien para su dueño. Se recuperan por esta RPC, que no recibe
// parametros: el servidor decide de quien es la fila y no hay forma de pedir la
// de otra persona.
//
// `userIdRespaldo` existe solo para la ventana de despliegue: la app sube antes
// que la migracion, y en ese rato `mi_perfil()` todavia no existe. Cuando la
// migracion lleve tiempo aplicada, este parametro y su escalon se pueden borrar.
export async function getMyProfile(userIdRespaldo?: string): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('mi_perfil');

  if (error) {
    // PGRST202 = la funcion no existe todavia.
    if (error.code !== 'PGRST202' || !userIdRespaldo) throw error;
    const res = await supabase.from('profiles').select('*').eq('id', userIdRespaldo).maybeSingle();
    if (res.error) throw res.error;
    return (res.data ?? null) as Profile | null;
  }

  const filas = (data ?? []) as Profile[];
  return filas[0] ?? null;
}

export async function updateMyProfile(
  userId: string,
  fields: { nombre?: string; foto_perfil?: string; telefono?: string; red_social?: string },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
}

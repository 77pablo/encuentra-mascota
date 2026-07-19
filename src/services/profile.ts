import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  nombre: string;
  foto_perfil: string | null;
  telefono: string | null;
  red_social: string | null;
  creado_en: string;
  // true solo cuando este perfil vino del escalon de respaldo de
  // getMyProfile (mi_perfil() todavia no existe). En ese caso telefono y
  // red_social son null porque no se pudieron leer, NO porque el usuario los
  // haya borrado. Quien edite este perfil tiene que revisar esta bandera
  // antes de mandar esas dos columnas en un update, o el guardado escribe un
  // borrado silencioso encima del dato real (ver camposDeContactoParaGuardar).
  contactoNoDisponible?: true;
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
    // No se pide `select('*')`: la migracion 0018 le quito a `authenticated`
    // el permiso sobre `telefono` y `red_social`, asi que un `*` revienta con
    // 42501 (permiso denegado) en cuanto la migracion este aplicada. Se pide
    // solo lo que sigue concedido; el contacto se pierde en este escalon de
    // respaldo, pero al menos se ve el nombre y la foto en vez de una
    // pantalla en blanco.
    const res = await supabase
      .from('profiles')
      .select('id, nombre, foto_perfil, creado_en')
      .eq('id', userIdRespaldo)
      .maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) return null;
    // Se completan a mano las columnas que este escalon no puede leer, para
    // no romper el tipo `Profile` con un `as any`. `contactoNoDisponible:
    // true` marca que ese null es "no se pudo leer", no "el usuario lo
    // borro" — sin esto, editar y guardar el perfil en este escalon borraria
    // el contacto real (ver camposDeContactoParaGuardar).
    return { ...res.data, telefono: null, red_social: null, contactoNoDisponible: true } as Profile;
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

// Decide que campos de contacto mandar en el update del perfil. Si el
// perfil viene del escalon de respaldo de getMyProfile (contactoNoDisponible),
// telefono/red_social en el perfil son null porque no se pudieron leer, no
// porque esten vacios: los drafts del formulario tambien van a estar vacios
// (se siembran desde ese mismo perfil), y mandarlos igual escribiria un
// borrado silencioso encima del dato real. En ese caso no se manda ninguno
// de los dos, para que el update no los toque.
export function camposDeContactoParaGuardar(
  profile: Profile | null,
  telefono: string,
  redSocial: string,
): { telefono?: string; red_social?: string } {
  if (profile?.contactoNoDisponible) return {};
  return { telefono, red_social: redSocial };
}

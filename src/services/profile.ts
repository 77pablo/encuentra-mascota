import { supabase } from '../lib/supabase';
import { institucionDe, type Institucion } from '../lib/institucion';

export interface Profile {
  id: string;
  nombre: string;
  foto_perfil: string | null;
  telefono: string | null;
  red_social: string | null;
  mostrar_red_social?: boolean;
  creado_en: string;
  es_admin?: boolean;
  // Cuenta institucional verificada (migracion 0057), o null. Es lo que
  // habilita la carga en lote en Publicar y lo que le confirma a una
  // veterinaria que su verificacion quedo hecha. Se calcula con
  // `institucionDe`, que exige `institucion_verificada_en` — un dato que el
  // usuario NO puede escribir (revoke update por columna, 0057).
  institucion?: Institucion | null;
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
    return {
      ...res.data,
      telefono: null,
      red_social: null,
      // No se pudo leer, asi que se sigue el mismo criterio que el resto de
      // este escalon (y que el default de la columna en la 0059): true.
      mostrar_red_social: true,
      es_admin: false,
      // Este escalon lee `profiles` con el grant publico por columna, que NO
      // incluye lo institucional del dueño mas alla de lo publico; y de todos
      // modos, si `mi_perfil()` no esta desplegada la 0057 tampoco. Fallar
      // cerrado aca solo significa "no se ofrece la carga en lote", que es un
      // extra, no una perdida de datos.
      institucion: null,
      contactoNoDisponible: true,
    } as Profile;
  }

  const fila = ((data ?? []) as any[])[0];
  if (!fila) return null;
  // `institucionDe` devuelve null si la 0057 no esta aplicada (la RPC vieja no
  // trae esas claves) o si la cuenta no esta verificada. Las dos cosas
  // significan lo mismo para la app.
  //
  // `?? true` cubre la misma ventana de despliegue: la web nueva puede hablar
  // con una `mi_perfil()` vieja (0058 o anterior) que todavia no trae esta
  // columna, y el default de la 0059 en la base es `true`.
  return { ...fila, institucion: institucionDe(fila), mostrar_red_social: fila.mostrar_red_social ?? true } as Profile;
}

// Quién publicó algo: su nombre público y, si es una cuenta institucional
// verificada, qué institución es (migración 0057).
export interface AutorPublico {
  nombre: string | null;
  institucion: Institucion | null;
}

const CAMPOS_AUTOR = 'nombre, eliminado_en';
const CAMPOS_AUTOR_CON_INSTITUCION =
  'nombre, eliminado_en, institucion_tipo, institucion_nombre, institucion_comuna,' +
  ' institucion_contacto, institucion_verificada_en';

// 42703 = "column does not exist". Es lo que devuelve PostgREST cuando la app
// ya subió y la 0057 todavía no. NO se puede tratar como "no hay autor": eso
// borraría la fila "Publicado por …" de TODAS las fichas durante la ventana de
// despliegue. Se reintenta con el select de siempre.
//
// PostgREST también puede envolverlo con su propio código; se mira además el
// mensaje, que es donde viaja el nombre de la columna.
function esColumnaInexistente(error: any): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .*institucion_/i.test(String(error.message ?? ''));
}

function autorDe(data: any): AutorPublico | null {
  // Una lápida (cuenta borrada) no se enlaza ni se firma.
  if (!data || data.eliminado_en) return null;
  return {
    nombre: (data.nombre ?? '').trim() || null,
    institucion: institucionDe(data),
  };
}

// Lee el autor en UNA consulta. Silencioso ante cualquier otro error: la ficha
// se lee entera sin la firma, igual que antes de la 0057.
//
// PASA POR LA RPC `autor_publico` (migración 0058) Y NO POR UN SELECT, y no es
// un capricho: una cuenta SUSPENDIDA no tiene que seguir firmando sus fichas
// con el sello de la app. Eso es un filtro por el VALOR de `suspendido_en`, que
// un select del cliente no puede hacer — esa columna no se le concede a nadie
// (0036) y los grants por columna de la 0018 conceden o no conceden, no saben
// de condiciones. El select directo de abajo queda SOLO como escalón de
// respaldo para la ventana de despliegue (la app sube antes que el SQL).
export async function getAutorPublico(userId: string): Promise<AutorPublico | null> {
  const rpc = await supabase.rpc('autor_publico', { p_user_id: userId });
  if (!rpc.error) {
    // Cero filas = la cuenta no existe o es una lápida: sin autor, sin enlace.
    const fila = ((rpc.data ?? []) as any[])[0];
    return fila ? autorDe(fila) : null;
  }
  // PGRST202 = la RPC todavía no existe (0058 sin aplicar). Cualquier otro
  // error es un error de verdad y no se arregla repitiendo la consulta de otra
  // forma: la ficha se muestra sin la firma, como antes de la 0057.
  if (rpc.error.code !== 'PGRST202') return null;

  const conInstitucion = await supabase
    .from('profiles')
    .select(CAMPOS_AUTOR_CON_INSTITUCION)
    .eq('id', userId)
    .maybeSingle();
  if (!conInstitucion.error) return autorDe(conInstitucion.data);
  // Un corte de red, un JWT vencido o un 500 NO se arreglan repitiendo la
  // consulta sin columnas: eso solo esconde el problema y duplica el tráfico.
  if (!esColumnaInexistente(conInstitucion.error)) return null;

  const legado = await supabase
    .from('profiles')
    .select(CAMPOS_AUTOR)
    .eq('id', userId)
    .maybeSingle();
  if (legado.error) return null;
  return autorDe(legado.data);
}

// Nombre público de una persona (la columna `nombre` es legible desde 0018).
// Sirve para mostrar "Publicado por …" y enlazar a su perfil público. Devuelve
// null si no se puede leer o si la cuenta está borrada (para no enlazar a una
// lápida). Silencioso: cualquier error se trata como "sin nombre".
export async function getNombrePublico(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(CAMPOS_AUTOR)
    .eq('id', userId)
    .maybeSingle();
  if (error || !data || data.eliminado_en) return null;
  return (data.nombre ?? '').trim() || null;
}

export async function updateMyProfile(
  userId: string,
  fields: {
    nombre?: string;
    foto_perfil?: string;
    telefono?: string;
    red_social?: string;
    mostrar_red_social?: boolean;
  },
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
//
// Lo mismo aplica, y con mas razon, cuando el perfil es null: eso pasa
// cuando cargar() (en ProfileScreen) se comio un error que no fue PGRST202
// -corte de red, un 500, un 42501, un JWT vencido- y se quedo sin perfil.
// Los drafts del formulario tambien se siembran vacios en ese caso (ver
// empezarEdicionPerfil), y no sabemos si el usuario tiene telefono/red
// social guardados: mandar '' pisaria el dato real en silencio, el mismo
// borrado que este bug ya causo por el camino de contactoNoDisponible. Por
// eso falla cerrado tambien aca: sin perfil, no se toca el contacto.
export function camposDeContactoParaGuardar(
  profile: Profile | null,
  telefono: string,
  redSocial: string,
  mostrarRedSocial: boolean,
): { telefono?: string; red_social?: string; mostrar_red_social?: boolean } {
  if (!profile || profile.contactoNoDisponible) return {};
  return { telefono, red_social: redSocial, mostrar_red_social: mostrarRedSocial };
}

import { supabase } from '../lib/supabase';
import { ErrorAmigable, esMigracionSinAplicar } from '../lib/dbErrors';
import { Miembro, Tarea, validarTarea } from '../lib/cuadrilla';

// CUADRILLA — acceso a `cuadrillas`, `cuadrilla_miembros` y `cuadrilla_tareas`
// (migración 0048). La lógica pura vive en `src/lib/cuadrilla.ts`.
//
// DOS COSAS QUE ESTE ARCHIVO TIENE QUE HACER BIEN, SÍ O SÍ:
//
// 1. LA MIGRACIÓN PUEDE NO ESTAR APLICADA. El dueño sube la web antes de correr
//    el SQL. Cuando eso pasa, PostgREST devuelve 404 + PGRST205 (tabla) o
//    PGRST202 (función) — comprobado contra el proyecto real el 1-ago-2026 — y
//    la app tiene que seguir funcionando EXACTAMENTE igual que hoy, con la
//    sección nueva simplemente ausente. Por eso ninguna consulta de acá toca
//    `pets`: van todas a tablas propias, así una falta de despliegue no puede
//    arrastrar a la ficha del reporte.
//
// 2. LA RLS RECHAZA EN SILENCIO. Un update o un delete que la RLS no permite NO
//    devuelve error: devuelve 200 y CERO filas. Sin pedir las filas afectadas,
//    la pantalla diría "listo" y no habría pasado nada (el bug de `borrarTip` y
//    el de la 0017). Todas las escrituras de acá miran lo que volvió.

export interface Cuadrilla {
  id: string;
  petId: string;
  duenoId: string;
  token: string;
  creadoEn: string;
}

// Tres respuestas distintas que la pantalla tiene que poder diferenciar:
//   · no-disponible → la 0048 todavía no se corrió: NO se muestra nada.
//   · sin-crear     → se puede armar (el dueño ve el botón).
//   · lista         → ya existe y soy del grupo.
export type EstadoCuadrilla =
  | { tipo: 'no-disponible' }
  | { tipo: 'sin-crear' }
  | { tipo: 'lista'; cuadrilla: Cuadrilla };

const COLUMNAS_CUADRILLA = 'id, pet_id, user_id, token, creado_en';
const COLUMNAS_TAREA = 'id, cuadrilla_id, titulo, estado, tomada_por, tomada_en, creado_en';

function aCuadrilla(fila: any): Cuadrilla {
  return {
    id: fila.id,
    petId: fila.pet_id,
    duenoId: fila.user_id,
    token: fila.token,
    creadoEn: fila.creado_en,
  };
}

function aTarea(fila: any): Tarea {
  return {
    id: fila.id,
    cuadrillaId: fila.cuadrilla_id,
    titulo: fila.titulo,
    estado: fila.estado,
    tomadaPor: fila.tomada_por ?? null,
    tomadaEn: fila.tomada_en ?? null,
    creadoEn: fila.creado_en,
  };
}

// ¿Hay cuadrilla en este reporte, y la puedo ver?
//
// La RLS solo devuelve la fila si soy el dueño o si ya me sumé, así que un
// desconocido recibe `sin-crear` — y la pantalla solo ofrece armarla al dueño.
export async function estadoDeCuadrilla(petId: string): Promise<EstadoCuadrilla> {
  const { data, error } = await supabase
    .from('cuadrillas')
    .select(COLUMNAS_CUADRILLA)
    .eq('pet_id', petId)
    .maybeSingle();

  if (error) {
    if (esMigracionSinAplicar(error)) return { tipo: 'no-disponible' };
    // Un corte de red NO es lo mismo: se propaga para que haya algo que
    // reintentar en vez de que la sección desaparezca en silencio.
    throw error;
  }
  if (!data) return { tipo: 'sin-crear' };
  return { tipo: 'lista', cuadrilla: aCuadrilla(data) };
}

// Arma la cuadrilla y sus tareas sugeridas en UNA transacción (ver el comentario
// de `crear_cuadrilla` en la 0048). Idempotente del lado del servidor.
export async function crearCuadrilla(petId: string, tareas: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('crear_cuadrilla', {
    p_pet_id: petId,
    p_tareas: tareas,
  });
  if (error) {
    if (esMigracionSinAplicar(error)) {
      throw new ErrorAmigable('Esta función todavía no está disponible. Probá más tarde.');
    }
    throw error;
  }
  return data as string;
}

export async function listarTareas(cuadrillaId: string): Promise<Tarea[]> {
  const { data, error } = await supabase
    .from('cuadrilla_tareas')
    .select(COLUMNAS_TAREA)
    .eq('cuadrilla_id', cuadrillaId)
    .order('creado_en', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(aTarea);
}

// Quiénes están buscando. El nombre sale del embed a `profiles` (columnas
// `nombre` y `eliminado_en`, las únicas que la 0018 dejó legibles).
//
// Escalón de respaldo, mismo criterio que `listarTips`: si el embed no se puede
// resolver, se reintenta sin él. Quedarse sin saber QUIÉNES son es mucho peor
// que quedarse sin sus nombres, y PostgREST no devuelve datos parciales.
export async function listarMiembros(cuadrillaId: string): Promise<Miembro[]> {
  const consulta = (select: string) =>
    supabase
      .from('cuadrilla_miembros')
      .select(select)
      .eq('cuadrilla_id', cuadrillaId)
      .order('creado_en', { ascending: true });

  const aMiembro = (fila: any): Miembro => {
    const perfil = Array.isArray(fila.profiles) ? fila.profiles[0] ?? null : fila.profiles ?? null;
    // Una cuenta borrada deja su fila lápida (0017): firma como vecino, no con
    // el nombre que tenía.
    const nombre = perfil?.eliminado_en ? null : (perfil?.nombre ?? '').trim() || null;
    return { userId: fila.user_id, nombre, creadoEn: fila.creado_en };
  };

  const conNombre = await consulta('user_id, creado_en, profiles(nombre, eliminado_en)');
  if (!conNombre.error) return ((conNombre.data ?? []) as any[]).map(aMiembro);

  const sinNombre = await consulta('user_id, creado_en');
  if (sinNombre.error) throw sinNombre.error;
  return ((sinNombre.data ?? []) as any[]).map(aMiembro);
}

// Tomar una tarea. El `eq('estado', 'pendiente')` es lo que hace segura la
// concurrencia: con DOS ayudantes tocando el botón a la vez, el segundo update
// no alcanza ninguna fila y se lo dice, en vez de robarle la tarea al primero y
// mandar a los dos a recorrer las mismas cuadras.
export async function tomarTarea(id: string, userId: string): Promise<Tarea> {
  const { data, error } = await supabase
    .from('cuadrilla_tareas')
    .update({ estado: 'tomada', tomada_por: userId, tomada_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select(COLUMNAS_TAREA);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ErrorAmigable('Se te adelantaron: alguien más ya tomó esta tarea.');
  }
  return aTarea(data[0]);
}

// Soltarla. Se mandan los tres campos juntos porque el CHECK
// `(estado = 'pendiente') = (tomada_por is null)` rebota cualquier update que
// deje los dos en desacuerdo.
export async function soltarTarea(id: string): Promise<Tarea> {
  const { data, error } = await supabase
    .from('cuadrilla_tareas')
    .update({ estado: 'pendiente', tomada_por: null, tomada_en: null })
    .eq('id', id)
    .select(COLUMNAS_TAREA);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ErrorAmigable('No se pudo soltar esta tarea.');
  }
  return aTarea(data[0]);
}

// Cerrarla. NO se toca `tomada_por`: queda quién la hizo (y el CHECK exige que
// una tarea que no está pendiente tenga dueño).
export async function completarTarea(id: string): Promise<Tarea> {
  const { data, error } = await supabase
    .from('cuadrilla_tareas')
    .update({ estado: 'hecha' })
    .eq('id', id)
    .select(COLUMNAS_TAREA);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ErrorAmigable('No se pudo marcar esta tarea como hecha.');
  }
  return aTarea(data[0]);
}

// Agregar una tarea a mano (solo el dueño, por RLS).
export async function agregarTarea(cuadrillaId: string, titulo: string): Promise<Tarea> {
  const validacion = validarTarea(titulo);
  if (!validacion.ok) throw new ErrorAmigable(validacion.error);

  const { data, error } = await supabase
    .from('cuadrilla_tareas')
    .insert({ cuadrilla_id: cuadrillaId, titulo: validacion.titulo })
    .select(COLUMNAS_TAREA)
    .single();
  if (error) throw error;
  return aTarea(data);
}

export async function borrarTarea(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('cuadrilla_tareas')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new ErrorAmigable('No se pudo borrar la tarea.');
}

// Irse de una cuadrilla (o que el dueño saque a alguien).
export async function sacarMiembro(cuadrillaId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('cuadrilla_miembros')
    .delete()
    .eq('cuadrilla_id', cuadrillaId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new ErrorAmigable('No se pudo hacer ese cambio.');
}

// ---------------------------------------------------------------------------
// EL LINK DE INVITACIÓN
// ---------------------------------------------------------------------------

export interface Invitacion {
  petId: string;
  mascota: string | null;
  especie: 'perro' | 'gato' | 'otro';
  foto: string | null;
  comuna: string | null;
  reporteActivo: boolean;
  ayudantes: number;
  tareasPendientes: number;
  yaEstoy: boolean;
}

export type ResultadoInvitacion =
  | { tipo: 'no-disponible' }
  | { tipo: 'no-existe' }
  | { tipo: 'ok'; invitacion: Invitacion };

// Vista previa del link, la única lectura que funciona SIN cuenta. Un token que
// no existe devuelve 0 filas a propósito (no se delata), y eso es distinto de
// que la migración no esté aplicada: decirle "este link ya no sirve" a alguien
// que quiso ayudar, cuando en realidad falta correr el SQL, sería mentirle.
export async function invitacionPorToken(token: string): Promise<ResultadoInvitacion> {
  const { data, error } = await supabase.rpc('cuadrilla_por_invitacion', { p_token: token });
  if (error) {
    if (esMigracionSinAplicar(error)) return { tipo: 'no-disponible' };
    throw error;
  }
  const fila = ((data ?? []) as any[])[0];
  if (!fila) return { tipo: 'no-existe' };
  return {
    tipo: 'ok',
    invitacion: {
      petId: fila.pet_id,
      mascota: fila.mascota ?? null,
      especie: fila.especie,
      foto: fila.foto ?? null,
      comuna: fila.comuna ?? null,
      reporteActivo: !!fila.reporte_activo,
      // PostgREST puede devolver los count() de bigint como string (mismo caso
      // que `perfil_publico`).
      ayudantes: Number(fila.ayudantes ?? 0),
      tareasPendientes: Number(fila.tareas_pendientes ?? 0),
      yaEstoy: !!fila.ya_estoy,
    },
  };
}

// Sumarse. Pide cuenta a propósito (ver el comentario largo de la 0048).
// Devuelve el id de la cuadrilla, o null si el token está gastado.
export async function sumarmeALaCuadrilla(token: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('sumarme_a_la_cuadrilla', { p_token: token });
  if (error) {
    if (esMigracionSinAplicar(error)) {
      throw new ErrorAmigable('Esta función todavía no está disponible. Probá más tarde.');
    }
    throw error;
  }
  return (data as string | null) ?? null;
}

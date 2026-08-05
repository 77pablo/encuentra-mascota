import { supabase } from '../lib/supabase';
import { esMigracionSinAplicar } from '../lib/dbErrors';
import { Destino, TipoDestino } from '../lib/difusion';

// DIFUSION — acceso a `difusion_destinos` y `lugares` (migracion 0063).
// La logica pura vive en `src/lib/difusion.ts`.
//
// DOS COSAS QUE ESTE ARCHIVO TIENE QUE HACER BIEN, SI O SI (mismo criterio que
// services/cuadrilla.ts):
//
// 1. LA MIGRACION PUEDE NO ESTAR APLICADA. PostgREST devuelve 404 + PGRST205
//    (tabla) o PGRST202 (funcion) y la app tiene que seguir funcionando IGUAL,
//    con la seccion simplemente ausente. Un corte de red NO es lo mismo: se
//    propaga, para que haya algo que reintentar.
// 2. LA RLS RECHAZA EN SILENCIO: 200 con 0 filas, no 42501. Por eso toda
//    escritura pide `.select(...)` y mira `data.length === 0`. Es la QUINTA
//    aparicion de este silencio en el proyecto.
//
// OJO CON `agregarPersona`: la etiqueta que se inserta es SIEMPRE
// `etiqueta.trim()`, nunca el valor crudo. `validarEtiqueta` (src/lib/difusion.ts)
// usa `.trim()` de JS, que recorta TODO espacio Unicode (incluido el espacio
// duro NBSP). El CHECK de la migracion 0063 usa `btrim()` de Postgres, que con
// un solo argumento recorta SOLO el espacio ASCII. Una etiqueta de 82
// caracteres con NBSP en los bordes pasa la validacion del cliente (JS la deja
// en 80) pero la base la rechazaria si se insertara cruda. No "simplificar" el
// `.trim()` de aca: el test de `agregarPersona` lo ata a proposito.

export type EstadoTablero = { tipo: 'no-disponible' } | { tipo: 'listo'; destinos: Destino[] };

export type LugarCerca = {
  id: string;
  nombre: string;
  categoria: 'veterinaria' | 'refugio';
  lat: number;
  lng: number;
  direccion: string | null;
  comuna: string | null;
  distanciaKm: number;
};

function aDestino(row: any): Destino {
  return {
    id: row.id,
    petId: row.pet_id,
    tipo: row.tipo as TipoDestino,
    etiqueta: row.etiqueta ?? null,
    lugarId: row.lugar_id ?? null,
    // El join trae `lugar: { nombre }` solo para tipo 'lugar' (lugar_id no
    // nulo); para 'persona' e 'institucion' PostgREST devuelve `lugar: null`.
    lugarNombre: row.lugar?.nombre ?? null,
    institucionId: row.institucion_id ?? null,
    estado: row.estado,
    avisadoEn: row.avisado_en ?? null,
    creadoEn: row.creado_en,
  };
}

export async function listarDestinos(petId: string): Promise<EstadoTablero> {
  // El join trae el nombre del lugar (tabla `lugares`, FK `lugar_id`): sin
  // esto un destino tipo 'lugar' no tiene NADA que mostrar, porque el CHECK
  // de la 0063 obliga `etiqueta null` para ese tipo. `lugares` tiene SELECT
  // para `authenticated` (0063), así que el join no pide ningún grant nuevo.
  const { data, error } = await supabase
    .from('difusion_destinos')
    .select('*, lugar:lugares(nombre)')
    .eq('pet_id', petId)
    .order('creado_en', { ascending: true });

  if (error) {
    if (esMigracionSinAplicar(error)) return { tipo: 'no-disponible' };
    throw error;
  }
  return { tipo: 'listo', destinos: (data ?? []).map(aDestino) };
}

export async function lugaresCerca(petId: string, radioKm: number): Promise<LugarCerca[]> {
  const { data, error } = await supabase.rpc('lugares_cerca', {
    p_pet_id: petId,
    p_radio_km: radioKm,
  });
  if (error) {
    // Sin lugares la pantalla lo dice y ofrece agregar a mano; no es un error
    // que valga tapar el tablero entero.
    if (esMigracionSinAplicar(error)) return [];
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    lat: r.lat,
    lng: r.lng,
    direccion: r.direccion ?? null,
    comuna: r.comuna ?? null,
    distanciaKm: r.distancia_km,
  }));
}

export async function agregarPersona(petId: string, etiqueta: string): Promise<Destino> {
  const { data, error } = await supabase
    .from('difusion_destinos')
    .insert({ pet_id: petId, tipo: 'persona', etiqueta: etiqueta.trim() })
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo agregar el destino.');
  return aDestino(data[0]);
}

export async function agregarLugar(petId: string, lugarId: string): Promise<Destino | null> {
  const { data, error } = await supabase
    .from('difusion_destinos')
    .insert({ pet_id: petId, tipo: 'lugar', lugar_id: lugarId })
    .select();
  // El indice unico (pet_id, lugar_id) hace que agregar dos veces el mismo
  // lugar sea un no-op silencioso, no un error que asuste.
  if (error) {
    if ((error as any).code === '23505') return null;
    throw error;
  }
  if (!data || data.length === 0) throw new Error('No se pudo agregar el lugar.');
  return aDestino(data[0]);
}

export async function marcarAvisado(id: string, avisado: boolean): Promise<void> {
  // `avisado_en` va en null al desmarcar o el CHECK de coherencia de la 0063
  // rechaza la fila.
  const cambio = avisado
    ? { estado: 'avisado', avisado_en: new Date().toISOString() }
    : { estado: 'pendiente', avisado_en: null };
  const { data, error } = await supabase
    .from('difusion_destinos')
    .update(cambio)
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo actualizar el destino.');
}

export async function borrarDestino(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('difusion_destinos')
    .delete()
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo borrar el destino.');
}

import { supabase } from '../lib/supabase';

// Un evento de emergencia (catástrofe): zona + ventana de tiempo con nombre.
// La RLS de la 0069 solo deja leer los activos; acá además se acota a los
// vigentes (ventana no vencida) y se ordenan del más reciente al más viejo.
export interface Evento {
  id: string;
  nombre: string;
  descripcion: string;
  lat: number;
  lng: number;
  radio_km: number;
  desde: string;
  hasta: string | null;
  activo: boolean;
  creado_en: string;
}

// Los eventos activos y vigentes. `hasta is null` = sigue abierto. Un error se
// PROPAGA (no se devuelve [] falso): quien lo muestra —el banner de Inicio—
// degrada mostrando nada, pero eso lo decide el llamador, no un catch mudo acá.
export async function eventosActivos(): Promise<Evento[]> {
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from('eventos')
    .select('id, nombre, descripcion, lat, lng, radio_km, desde, hasta, activo, creado_en')
    .eq('activo', true)
    .or(`hasta.is.null,hasta.gte.${ahora}`)
    .order('desde', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Evento[];
}

// Un evento por id (para la pantalla, que puede abrirse por deep link con solo
// el id). La RLS de la 0069 solo devuelve el activo; un id inexistente o de un
// evento inactivo da `null` (maybeSingle, no lanza por 0 filas). Un error real
// de la consulta sí se propaga.
export async function eventoPorId(id: string): Promise<Evento | null> {
  const { data, error } = await supabase
    .from('eventos')
    .select('id, nombre, descripcion, lat, lng, radio_km, desde, hasta, activo, creado_en')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Evento) ?? null;
}

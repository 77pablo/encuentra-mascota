import { supabase } from '../lib/supabase';
import { ErrorAmigable } from '../lib/dbErrors';

// BÚSQUEDA GUARDADA CON AVISO — acceso a `busquedas_guardadas` (migración 0031).
//
// "Avisame si aparece un gato en Ñuñoa": quien busca sin haber publicado un
// reporte guarda una búsqueda (tipo + especie opcional + comuna obligatoria) y
// la app le avisa cuando se publique un reporte que calce (trigger
// `enqueue_busquedas_guardadas`, del lado de la base). La RLS de 0031 solo deja
// ver/insertar/borrar las filas propias, así que `listBusquedas` no necesita
// filtrar por usuario: el servidor ya lo hace.

export interface BusquedaGuardada {
  id: string;
  user_id: string;
  tipo: 'perdida' | 'encontrada';
  especie: 'perro' | 'gato' | 'otro' | null;
  comuna: string;
  creado_en: string;
}

export interface BusquedaGuardadaInput {
  tipo: 'perdida' | 'encontrada';
  especie?: 'perro' | 'gato' | 'otro' | null;
  comuna: string;
}

async function miId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (!id) throw new ErrorAmigable('Necesitás tener la sesión abierta para guardar una búsqueda.');
  return id;
}

// Las búsquedas guardadas del usuario con sesión abierta, de la más nueva a la
// más vieja (como mucho 5, por el tope del trigger `limite_busquedas_guardadas`).
export async function listBusquedas(): Promise<BusquedaGuardada[]> {
  const { data, error } = await supabase
    .from('busquedas_guardadas')
    .select('*')
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BusquedaGuardada[];
}

// Guarda una búsqueda nueva. El trigger `before insert` de la 0031 rechaza la
// sexta búsqueda con `BUSQUEDAS_TOPE`: se traduce acá a un mensaje amigable en
// vez de dejar que el texto crudo del error llegue a la pantalla.
export async function guardarBusqueda(b: BusquedaGuardadaInput): Promise<void> {
  const userId = await miId();
  const { error } = await supabase.from('busquedas_guardadas').insert({
    user_id: userId,
    tipo: b.tipo,
    especie: b.especie ?? null,
    comuna: b.comuna,
  });
  if (error) {
    if (error.message?.includes('BUSQUEDAS_TOPE')) {
      throw new ErrorAmigable('Ya tenés 5 búsquedas guardadas. Borrá alguna para agregar otra.');
    }
    throw error;
  }
}

// Borra una búsqueda guardada propia.
//
// Pedimos las filas borradas a propósito: cuando la RLS rechaza un delete,
// PostgREST NO devuelve error, simplemente no borra nada. Sin este chequeo la
// pantalla diría "listo" y la búsqueda seguiría ahí (mismo criterio que
// `borrarTip`).
export async function borrarBusqueda(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('busquedas_guardadas')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ErrorAmigable('No se pudo borrar la búsqueda.');
  }
}

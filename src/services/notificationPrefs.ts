import { supabase } from '../lib/supabase';
import { Prefs, PREFS_POR_DEFECTO } from '../lib/notifyTargets';

// Preferencias de avisos del usuario (ver migración 0011_avisos.sql).
// La fila es una por usuario (user_id es la llave primaria), así que guardar
// es siempre un upsert.

// Forma de la fila en la base: snake_case, como en el resto de las tablas.
interface PrefsRow {
  user_id: string;
  zona: boolean;
  avistamientos: boolean;
  pistas: boolean;
  coincidencias: boolean;
  canal_email: boolean;
  canal_push: boolean;
  actualizado_en: string;
}

function desdeFila(row: PrefsRow): Prefs {
  return {
    userId: row.user_id,
    zona: row.zona,
    avistamientos: row.avistamientos,
    pistas: row.pistas,
    coincidencias: row.coincidencias,
    canalEmail: row.canal_email,
    canalPush: row.canal_push,
  };
}

async function miUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

// Devuelve mis preferencias. Degrada a los valores por defecto —sin propagar el
// error— cuando no hay sesión, cuando todavía no hay fila, o cuando la migración
// 0011 no está aplicada y la tabla no existe. La pantalla nunca debe romperse
// por esto: es el mismo patrón de favoritos y novedades.
export async function getMisPrefs(): Promise<Prefs> {
  const userId = await miUserId();
  const porDefecto: Prefs = { userId: userId ?? '', ...PREFS_POR_DEFECTO };
  if (!userId) return porDefecto;

  try {
    const { data, error } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return porDefecto;
    return data ? desdeFila(data as PrefsRow) : porDefecto;
  } catch {
    return porDefecto;
  }
}

// Guarda (upsert) los interruptores que cambiaron. A diferencia de la lectura,
// acá el error SÍ se propaga: la pantalla necesita saber que no se pudo guardar
// para revertir el interruptor y avisarle a la persona.
export async function guardarMisPrefs(p: Partial<Omit<Prefs, 'userId'>>): Promise<void> {
  const userId = await miUserId();
  if (!userId) throw new Error('Tenés que iniciar sesión para cambiar tus avisos.');

  // Traemos lo actual (o los valores por defecto) para que el upsert no pise
  // con NULL los interruptores que esta llamada no toca.
  const actual = await getMisPrefs();
  const fusionado = { ...actual, ...p };

  const { error } = await supabase.from('notification_prefs').upsert(
    {
      user_id: userId,
      zona: fusionado.zona,
      avistamientos: fusionado.avistamientos,
      pistas: fusionado.pistas,
      coincidencias: fusionado.coincidencias,
      canal_email: fusionado.canalEmail,
      canal_push: fusionado.canalPush,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

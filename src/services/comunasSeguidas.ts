import { supabase } from '../lib/supabase';

// Comunas que sigue el usuario para recibir avisos de reportes nuevos ahí.
// Viven en notification_prefs.comunas_seguidas (migración 0020). El aviso real
// por comuna lo resuelve el targeting de la Edge Function (Fase 3).

export async function getComunasSeguidas(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('comunas_seguidas')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return ((data?.comunas_seguidas as string[] | undefined) ?? []).filter(Boolean);
}

// upsert por user_id: si el usuario no tenía fila de preferencias, se crea con
// los defaults (todo activado); si la tenía, solo se toca comunas_seguidas.
async function guardar(userId: string, comunas: string[]): Promise<void> {
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, comunas_seguidas: comunas }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function seguirComuna(userId: string, comuna: string): Promise<void> {
  const actuales = await getComunasSeguidas(userId);
  if (actuales.includes(comuna)) return;
  await guardar(userId, [...actuales, comuna]);
}

export async function dejarDeSeguirComuna(userId: string, comuna: string): Promise<void> {
  const actuales = await getComunasSeguidas(userId);
  await guardar(userId, actuales.filter((c) => c !== comuna));
}

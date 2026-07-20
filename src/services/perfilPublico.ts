import { supabase } from '../lib/supabase';
import { Pet } from './pets';

// Perfil público de otra persona: lo que ven los demás. NUNCA incluye teléfono
// (ver migración 0019 / 0018). Las estadísticas se calculan en el servidor.
export interface PerfilPublico {
  id: string;
  nombre: string;
  foto_perfil: string | null;
  red_social: string | null;
  creado_en: string;
  reencuentros: number;
  reportes: number;
  aportes: number;
}

// Lee el perfil público por la RPC segura. Devuelve null si la cuenta está
// borrada/no existe, o si la RPC todavía no está desplegada (PGRST202): en ese
// caso la pantalla muestra "Perfil no disponible" en vez de romper (fail-closed).
export async function getPerfilPublico(userId: string): Promise<PerfilPublico | null> {
  const { data, error } = await supabase.rpc('perfil_publico', { p_user_id: userId });
  if (error) {
    if (error.code === 'PGRST202') return null;
    throw error;
  }
  const fila = ((data ?? []) as any[])[0];
  if (!fila) return null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    foto_perfil: fila.foto_perfil ?? null,
    red_social: fila.red_social ?? null,
    creado_en: fila.creado_en,
    // PostgREST puede devolver los count() de bigint como string: se normaliza.
    reencuentros: Number(fila.reencuentros ?? 0),
    reportes: Number(fila.reportes ?? 0),
    aportes: Number(fila.aportes ?? 0),
  };
}

// Reportes activos de una persona (públicos por RLS). Para la sección de su perfil.
export async function listReportesPublicos(userId: string): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .eq('activo', true)
    .eq('oculto', false)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Pet[];
}

// Reencuentros de una persona (final feliz). Visibles al invitado gracias a la
// política aditiva de la migración 0019.
export async function listReencuentrosPublicos(userId: string, limit = 10): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .eq('oculto', false)
    .not('reunida_en', 'is', null)
    .order('reunida_en', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Pet[];
}

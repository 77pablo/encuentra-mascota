import { supabase } from '../lib/supabase';

// Una zona de alerta por usuario (ver migración 0006_alertas_zona.sql).
// El centro (lat/lng) puede venir nulo si el usuario aún no fijó su ubicación.
export interface AlertZone {
  user_id: string;
  lat: number | null;
  lng: number | null;
  radio_km: number;
  activo: boolean;
  actualizado_en: string;
}

export interface AlertZoneInput {
  lat: number | null;
  lng: number | null;
  radio_km: number;
  activo: boolean;
}

// Devuelve la zona del usuario, o null si todavía no ha creado ninguna.
export async function getMyZone(userId: string): Promise<AlertZone | null> {
  const { data, error } = await supabase
    .from('alert_zones')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as AlertZone | null;
}

// Crea o actualiza la zona del usuario. Como user_id es la llave primaria,
// el upsert reemplaza la fila anterior en vez de duplicarla.
export async function upsertMyZone(userId: string, input: AlertZoneInput): Promise<AlertZone> {
  const { data, error } = await supabase
    .from('alert_zones')
    .upsert(
      {
        user_id: userId,
        lat: input.lat,
        lng: input.lng,
        radio_km: input.radio_km,
        activo: input.activo,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as AlertZone;
}

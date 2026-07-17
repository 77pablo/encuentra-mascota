import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

export async function registerPushToken(userId: string): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return; // sin permiso, no registramos (silencioso)
  const tokenData = await Notifications.getExpoPushTokenAsync();
  await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token: tokenData.data }, { onConflict: 'token' });
}

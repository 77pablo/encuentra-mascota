import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

export async function registerPushToken(userId: string): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return; // sin permiso, no registramos (silencioso)

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Sin projectId de EAS: el push no se registrará hasta correr `eas init`.');
    return;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token: tokenData.data }, { onConflict: 'token' });
}

import React from 'react';
import {
  useFonts,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import { AuthProvider } from './src/hooks/useAuth';
import { UnreadProvider } from './src/hooks/useUnread';
import RootNavigator from './src/navigation/RootNavigator';
import { initMonitoring } from './src/lib/monitoring';
import { setupPushNotifications } from './src/lib/pushSetup';

initMonitoring();
setupPushNotifications();

export default function App() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <UnreadProvider>
        <RootNavigator />
      </UnreadProvider>
    </AuthProvider>
  );
}

import React from 'react';
import {
  useFonts,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/hooks/useAuth';
import { UnreadProvider } from './src/hooks/useUnread';
import { FavoritesProvider } from './src/hooks/useFavorites';
import { AdoptionSavesProvider } from './src/context/AdoptionSavesProvider';
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
    // SafeAreaProvider en la RAÍZ: el onboarding se renderiza antes/fuera del
    // NavigationContainer (que trae su propio provider), así que sin esto
    // cualquier pantalla montada en el gate revienta con "No safe area value".
    <SafeAreaProvider>
      <AuthProvider>
        <UnreadProvider>
          <FavoritesProvider>
            <AdoptionSavesProvider>
              <RootNavigator />
            </AdoptionSavesProvider>
          </FavoritesProvider>
        </UnreadProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

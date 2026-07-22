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
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { AuthProvider } from './src/hooks/useAuth';
import { UnreadProvider } from './src/hooks/useUnread';
import { FavoritesProvider } from './src/hooks/useFavorites';
import { AdoptionSavesProvider } from './src/context/AdoptionSavesProvider';
import RootNavigator from './src/navigation/RootNavigator';
import { initMonitoring } from './src/lib/monitoring';
import { setupPushNotifications } from './src/lib/pushSetup';
import { capturarPromptInstalacion } from './src/lib/instalarPwa';

initMonitoring();
setupPushNotifications();
// Web-only (no-op en nativo, ver instalarPwa.ts): engancha el listener de
// 'beforeinstallprompt' lo antes posible. Si se esperara a que
// InstalarAppCard se monte, un beforeinstallprompt disparado antes de ese
// montaje (Chrome no lo re-emite) se perdería. Idempotente: el montaje de
// InstalarAppCard sigue llamándola también, sin efecto duplicado.
capturarPromptInstalacion();

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
    // ThemeProvider en la RAÍZ (por encima de todo): expone colores/esquema a la
    // app entera, incluido el onboarding que se monta fuera del NavigationContainer.
    // SafeAreaProvider también en la raíz por el mismo motivo (el gate de onboarding).
    <ThemeProvider>
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
        <AppStatusBar />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

// La StatusBar sigue el esquema (contenido claro sobre fondo oscuro y viceversa).
// Va en su propio componente porque necesita estar DENTRO del ThemeProvider.
function AppStatusBar() {
  const { esquema } = useTheme();
  return <StatusBar style={esquema === 'dark' ? 'light' : 'dark'} />;
}

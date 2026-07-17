import React from 'react';
import { useFonts, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from '@expo-google-fonts/nunito-sans';
import { AuthProvider } from './src/hooks/useAuth';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  const [fontsLoaded] = useFonts({
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

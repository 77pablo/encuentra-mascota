import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { useAuth } from '../hooks/useAuth';
import TabNavigator from './TabNavigator';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import PublicPetScreen from '../screens/PublicPetScreen';
import GuiaPerdidaScreen from '../screens/GuiaPerdidaScreen';
import CollarScreen from '../screens/CollarScreen';

const Stack = createNativeStackNavigator();

// Habilita abrir "<origen>/mascota/:id" (link compartido de un reporte) sin
// depender de que haya sesión iniciada: MascotaPublica se registra siempre en
// el stack raíz, independientemente de la rama de sesión/recuperación.
const linking: LinkingOptions<any> = {
  prefixes: [Linking.createURL('/'), ...(typeof window !== 'undefined' ? [window.location.origin] : [])],
  config: {
    screens: {
      MascotaPublica: 'mascota/:id',
      // Página pública del collar (Función 2). Se abre por el QR de la placa,
      // en modo invitado, igual que MascotaPublica.
      Collar: 'collar/:token',
    },
  },
};

export default function RootNavigator() {
  const { loading, recovering } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // MODO INVITADO: el stack raíz ya NO bifurca por sesión. `App` (el
  // TabNavigator) se monta siempre, haya sesión o no, y las pantallas de auth
  // quedan siempre registradas para poder empujarlas desde cualquier lado
  // cuando el portero (`useRequireAuth`) las pide. Consecuencias buscadas:
  //   · sin sesión la app abre en Inicio, no en el login;
  //   · al entrar o salir de la sesión el stack no se remonta, así que el
  //     usuario se queda donde estaba en vez de rebotar al Inicio;
  //   · la pantalla de auth se saca con un `goBack` (ver `lib/authReturn.ts`),
  //     así no queda colgada en el historial después de entrar.
  //
  // La rama `recovering` (llegó por el correo de recuperar contraseña) SIGUE
  // teniendo prioridad sobre todo lo demás: mientras esté activa, la app
  // arranca en ResetPassword y no en la app. El `key` fuerza el remonte al
  // entrar y al salir de esa rama, que es el único caso donde hace falta.
  const initialRouteName = recovering ? 'ResetPassword' : 'App';
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        key={recovering ? 'recuperando' : 'normal'}
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRouteName}
      >
        <Stack.Screen name="App" component={TabNavigator} />
        <Stack.Screen name="MascotaPublica" component={PublicPetScreen} options={{ title: 'Reporte' }} />
        {/* Guía "recién se me perdió": se abre desde Inicio y tras publicar una
            perdida. Va en el stack raíz para ser alcanzable por nombre desde
            cualquier pestaña; con header propio para tener botón de volver. */}
        <Stack.Screen
          name="GuiaPerdida"
          component={GuiaPerdidaScreen}
          options={{ headerShown: true, title: 'Primeros pasos' }}
        />
        {/* Página pública del collar (Función 2): la abre el QR de la placa, en
            modo invitado, igual que MascotaPublica. */}
        <Stack.Screen name="Collar" component={CollarScreen} options={{ title: 'Mascota con collar' }} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

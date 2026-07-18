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

const Stack = createNativeStackNavigator();

// Habilita abrir "<origen>/mascota/:id" (link compartido de un reporte) sin
// depender de que haya sesión iniciada: MascotaPublica se registra siempre en
// el stack raíz, independientemente de la rama de sesión/recuperación.
const linking: LinkingOptions<any> = {
  prefixes: [Linking.createURL('/'), ...(typeof window !== 'undefined' ? [window.location.origin] : [])],
  config: {
    screens: {
      MascotaPublica: 'mascota/:id',
    },
  },
};

export default function RootNavigator() {
  const { session, loading, recovering } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  const initialRouteName = recovering ? 'ResetPassword' : session ? 'App' : 'Login';
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator key={initialRouteName} screenOptions={{ headerShown: false }} initialRouteName={initialRouteName}>
        <Stack.Screen name="MascotaPublica" component={PublicPetScreen} options={{ title: 'Reporte' }} />
        {recovering ? (
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        ) : session ? (
          <Stack.Screen name="App" component={TabNavigator} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

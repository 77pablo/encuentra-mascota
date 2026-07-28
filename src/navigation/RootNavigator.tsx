import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, LinkingOptions, DefaultTheme, DarkTheme, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../theme/ThemeProvider';
import TabNavigator, { MsgStack } from './TabNavigator';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import PublicPetScreen from '../screens/PublicPetScreen';
import GuiaPerdidaScreen from '../screens/GuiaPerdidaScreen';
import CollarScreen from '../screens/CollarScreen';
import AdopcionDetailScreen from '../screens/AdopcionDetailScreen';
import AyudaScreen from '../screens/AyudaScreen';
import VolvieronACasaScreen from '../screens/VolvieronACasaScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import GuiaEncontradaScreen from '../screens/GuiaEncontradaScreen';
import LegalScreen from '../screens/LegalScreen';
import { getOnboardingVisto } from '../lib/onboarding';
import { navigationRef, consumirDestinoPendiente } from '../lib/navigationRef';

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
      // Detalle público de una publicación de adopción, mismo trato que
      // MascotaPublica/Collar: alcanzable por link compartido sin sesión.
      AdopcionDetail: 'adopcion/:id',
    },
  },
};

export default function RootNavigator() {
  const { loading, recovering } = useAuth();
  const { colors, esquema } = useTheme();
  // Onboarding de bienvenida: solo la primera vez. Cargamos el flag local;
  // mientras no se sepa (null), mostramos el spinner junto al loading de auth.
  const [onboardingVisto, setOnboardingVistoState] = useState<boolean | null>(null);
  useEffect(() => {
    getOnboardingVisto().then(setOnboardingVistoState);
  }, []);

  if (loading || onboardingVisto === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Primer arranque (y no estamos recuperando contraseña): bienvenida a pantalla
  // completa. Al terminar/saltar, el Onboarding marca el flag y `onListo` lo
  // desmonta para seguir a la app.
  if (!onboardingVisto && !recovering) {
    return <OnboardingScreen onListo={() => setOnboardingVistoState(true)} />;
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
  // Tema de navegación (fondo entre pantallas + headers nativos siguen el esquema).
  const base = esquema === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.ink,
      border: colors.line,
      primary: colors.brand,
    },
  };
  return (
    // `ref={navigationRef}` (pulido de la tanda 6): permite navegar desde
    // fuera de un componente, para el listener de push que consume
    // `data.ruta` (ver src/lib/pushSetup.ts, src/lib/rutaANavegacion.ts).
    // `onReady`: si ese listener se disparó ANTES de que este contenedor
    // estuviera listo (arranque en frío, el caso más común al tocar un push),
    // el destino quedó guardado como pendiente (navigationRef.ts) — acá se
    // consume y se navega recién ahora que el árbol de navegación existe.
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={navTheme}
      onReady={() => {
        const destino = consumirDestinoPendiente();
        if (!destino) return;
        (navigationRef as any).navigate(destino.name, destino.params);
      }}
    >
      <Stack.Navigator
        key={recovering ? 'recuperando' : 'normal'}
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.bg },
        }}
        initialRouteName={initialRouteName}
      >
        <Stack.Screen name="App" component={TabNavigator} />
        {/* Mensajes dejó de ser pestaña: se abre desde el ícono de `MensajesButton`
            (Inicio/Explorar/Adopción). Vive en el stack raíz para ser alcanzable
            por nombre desde cualquier pestaña, igual que GuiaPerdida. */}
        <Stack.Screen name="Mensajes" component={MsgStack} />
        <Stack.Screen name="MascotaPublica" component={PublicPetScreen} options={{ headerShown: true, title: 'Reporte' }} />
        {/* Guía "recién se me perdió": se abre desde Inicio y tras publicar una
            perdida. Va en el stack raíz para ser alcanzable por nombre desde
            cualquier pestaña; con header propio para tener botón de volver. */}
        <Stack.Screen
          name="GuiaPerdida"
          component={GuiaPerdidaScreen}
          options={{ headerShown: true, title: 'Primeros pasos' }}
        />
        {/* Guía "encontré una mascota" (Función 4, espejo de GuiaPerdida): se
            abre desde Inicio y tras publicar una "encontrada". Mismo trato:
            stack raíz, alcanzable por nombre desde cualquier pestaña. */}
        <Stack.Screen
          name="GuiaEncontrada"
          component={GuiaEncontradaScreen}
          options={{ headerShown: true, title: 'Encontraste una mascota' }}
        />
        {/* Página pública del collar (Función 2): la abre el QR de la placa, en
            modo invitado, igual que MascotaPublica. */}
        <Stack.Screen name="Collar" component={CollarScreen} options={{ headerShown: true, title: 'Mascota con collar' }} />
        {/* Detalle público de una publicación de adopción: se abre por el link
            compartido (`adopcion/:id`) o desde la pestaña Adopción, en modo
            invitado, igual que MascotaPublica/Collar. */}
        <Stack.Screen name="AdopcionDetail" component={AdopcionDetailScreen} options={{ headerShown: true, title: 'Adopción' }} />
        {/* Ayuda rápida (vets/refugios) y galería de reencuentros: pantallas
            empujadas al raíz con header nativo (botón de volver). Alcanzables por
            burbujeo desde la guía/Perfil e Inicio. */}
        <Stack.Screen name="Ayuda" component={AyudaScreen} options={{ headerShown: true, title: 'Ayuda' }} />
        <Stack.Screen
          name="VolvieronACasa"
          component={VolvieronACasaScreen}
          options={{ headerShown: true, title: 'Volvieron a casa' }}
        />
        {/* "Privacidad y términos" TAMBIÉN acá, no solo dentro de ProfileStack.
            RegisterScreen vive en este stack raíz y su casilla de aceptación
            linkea a esta pantalla: con la registración solo en ProfileStack, ese
            `navigate('Legal')` no lo atendía NADIE (React Navigation resuelve un
            nombre pelado hacia los ancestros, nunca hacia el stack de una
            pestaña hermana) y el enlace no hacía nada — justo el enlace que las
            dos tiendas exigen que se pueda LEER antes de aceptar.
            Las dos registraciones conviven bien: desde Perfil gana la de
            ProfileStack (el ancestro más cercano) y el "volver" sigue llevando
            a donde estabas. */}
        <Stack.Screen
          name="Legal"
          component={LegalScreen}
          options={{ headerShown: true, title: 'Privacidad y términos' }}
        />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

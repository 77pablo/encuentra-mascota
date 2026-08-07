import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
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
import GuiaRobadaScreen from '../screens/GuiaRobadaScreen';
import EventoScreen from '../screens/EventoScreen';
import WidgetInstitucionScreen from '../screens/WidgetInstitucionScreen';
import CollarScreen from '../screens/CollarScreen';
import CuadrillaScreen from '../screens/CuadrillaScreen';
import AdopcionDetailScreen from '../screens/AdopcionDetailScreen';
import AyudaScreen from '../screens/AyudaScreen';
import VolvieronACasaScreen from '../screens/VolvieronACasaScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import GuiaEncontradaScreen from '../screens/GuiaEncontradaScreen';
import MicrochipScreen from '../screens/MicrochipScreen';
import LegalScreen from '../screens/LegalScreen';
import { getOnboardingVisto } from '../lib/onboarding';
import { navigationRef, consumirDestinoPendiente } from '../lib/navigationRef';
import { linkingScreens } from './linkingConfig';
import { esRutaDeLinkPublico, rutasDeLinkPublico } from '../lib/deepLinks';

const Stack = createNativeStackNavigator();

// Habilita abrir "<origen>/mascota/:id" (link compartido de un reporte) sin
// depender de que haya sesión iniciada: MascotaPublica se registra siempre en
// el stack raíz, independientemente de la rama de sesión/recuperación.
// Las rutas viven en ./linkingConfig: también las consume el salteo del
// onboarding de abajo, y derivar de un único objeto evita la lista paralela.
const linking: LinkingOptions<any> = {
  prefixes: [Linking.createURL('/'), ...(typeof window !== 'undefined' ? [window.location.origin] : [])],
  config: {
    screens: linkingScreens,
  },
};

const RUTAS_PUBLICAS = rutasDeLinkPublico(linkingScreens);

export default function RootNavigator() {
  const { loading, recovering } = useAuth();
  const { colors, esquema } = useTheme();
  // Onboarding de bienvenida: solo la primera vez. Cargamos el flag local;
  // mientras no se sepa (null), mostramos el spinner junto al loading de auth.
  const [onboardingVisto, setOnboardingVistoState] = useState<boolean | null>(null);
  useEffect(() => {
    getOnboardingVisto().then(setOnboardingVistoState);
  }, []);

  // ¿La URL inicial es una ruta pública de link (QR del collar, reporte
  // compartido, adopción, cuadrilla)? Entonces el contenido va PRIMERO y el
  // onboarding se saltea SIN marcarse visto (decisión de Pablo, spec
  // 2026-08-06): la bienvenida queda pendiente para la próxima visita normal.
  // En web se sabe sincrónico; en nativo se resuelve async y mientras tanto
  // vale el mismo spinner del arranque. Ante cualquier fallo, `false` = el
  // comportamiento de siempre (onboarding), nunca romper.
  const [llegoPorLink, setLlegoPorLink] = useState<boolean | null>(() => {
    if (Platform.OS !== 'web') return null;
    try {
      return esRutaDeLinkPublico(window.location.pathname, RUTAS_PUBLICAS);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (llegoPorLink !== null) return;
    Linking.getInitialURL()
      .then((url) => {
        // `Linking.parse` entiende esquemas nativos (misapp://mascota/x) que
        // `new URL` interpreta distinto; `path` llega sin la barra inicial.
        const path = url ? Linking.parse(url).path : null;
        setLlegoPorLink(path ? esRutaDeLinkPublico(`/${path}`, RUTAS_PUBLICAS) : false);
      })
      .catch(() => setLlegoPorLink(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || onboardingVisto === null || llegoPorLink === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Primer arranque (y no estamos recuperando contraseña ni llegando por un
  // link público): bienvenida a pantalla completa. Al terminar/saltar, el
  // Onboarding marca el flag y `onListo` lo desmonta para seguir a la app.
  if (!onboardingVisto && !recovering && !llegoPorLink) {
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
        {/* Guía "te la robaron" (Tanda 17): espejo de GuiaPerdida con lo del
            robo (denuncia, no negociar, pruebas). Stack raíz con header, como
            las otras guías, alcanzable por nombre desde cualquier pestaña. */}
        <Stack.Screen
          name="GuiaRobada"
          component={GuiaRobadaScreen}
          options={{ headerShown: true, title: 'Te la robaron' }}
        />
        {/* Evento de emergencia (Tanda 19): se abre desde el banner de Inicio o
            por deep link (`evento/:id`), en modo invitado como MascotaPublica.
            Stack raíz con header y botón de volver. */}
        <Stack.Screen
          name="Evento"
          component={EventoScreen}
          options={{ headerShown: true, title: 'Emergencia' }}
        />
        {/* Widget institucional (Tanda 20): pantalla para que una vet/refugio/
            municipio genere el código embed de su comuna. Stack raíz con header,
            alcanzable por nombre desde Perfil. */}
        <Stack.Screen
          name="WidgetInstitucion"
          component={WidgetInstitucionScreen}
          options={{ headerShown: true, title: 'Widget para tu sitio' }}
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
        {/* Cuadrilla (Tanda 10): se abre por el link de invitación
            (`cuadrilla/:token`) o desde la ficha del reporte con `{ petId }`.
            Va en el stack RAÍZ por las dos razones de siempre: es alcanzable
            por link público, y así un `navigate('Cuadrilla')` desde PetDetail
            —que vive dentro del stack de una pestaña— llega por burbujeo. */}
        <Stack.Screen name="Cuadrilla" component={CuadrillaScreen} options={{ headerShown: true, title: 'Cuadrilla' }} />
        {/* Ayuda rápida (vets/refugios) y galería de reencuentros: pantallas
            empujadas al raíz con header nativo (botón de volver). Alcanzables por
            burbujeo desde la guía/Perfil e Inicio. */}
        <Stack.Screen name="Ayuda" component={AyudaScreen} options={{ headerShown: true, title: 'Ayuda' }} />
        {/* Consultor de microchip: se llega desde la guía "encontré una mascota",
            desde Ayuda, desde la ficha pública de un reporte y desde "Mis
            mascotas". Va en el stack RAÍZ y no dentro de una pestaña porque
            MascotaPublica —que vive acá— la navega por nombre pelado, y un
            nombre pelado burbujea hacia los ancestros, nunca hacia el stack de
            una pestaña hermana (el bug de siempre). */}
        <Stack.Screen
          name="Microchip"
          component={MicrochipScreen}
          options={{ headerShown: true, title: 'Mascota con chip' }}
        />
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

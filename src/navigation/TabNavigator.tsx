import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import PublishScreen from '../screens/PublishScreen';
import HomeScreen from '../screens/HomeScreen';
import ExplorarScreen from '../screens/ExplorarScreen';
import EncontreScreen from '../screens/EncontreScreen';
import AdopcionFeedScreen from '../screens/AdopcionFeedScreen';
import PublicarAdopcionScreen from '../screens/PublicarAdopcionScreen';
import PetDetailScreen from '../screens/PetDetailScreen';
import AddSightingScreen from '../screens/AddSightingScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MyPetsScreen from '../screens/MyPetsScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import GuardadosScreen from '../screens/GuardadosScreen';
import AlertZoneScreen from '../screens/AlertZoneScreen';
import NotificationPrefsScreen from '../screens/NotificationPrefsScreen';
import EditPetScreen from '../screens/EditPetScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import LegalScreen from '../screens/LegalScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import { useAuth } from '../hooks/useAuth';
import { AccionProtegida, mensajeDe } from '../lib/requireAuth';
import { notify } from '../lib/notify';
import { colors, font } from '../theme';

const Tab = createBottomTabNavigator();

// Cada pestaña que puede navegar a un detalle de mascota (Mapa, Lista) tiene
// su propio stack nativo con las pantallas PetDetail y Chat registradas, para
// que tocar un pin/tarjeta pueda abrir el detalle y, desde ahí, el chat.
const InicioStackNav = createNativeStackNavigator();
function InicioStack() {
  return (
    <InicioStackNav.Navigator>
      <InicioStackNav.Screen name="Inicio" component={HomeScreen} options={{ headerShown: false }} />
      <InicioStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <InicioStackNav.Screen name="AddSighting" component={AddSightingScreen} options={{ title: 'Lo vi por acá' }} />
      <InicioStackNav.Screen name="Chat" component={ChatScreen} />
      <InicioStackNav.Screen name="PublicProfile" component={PublicProfileScreen} options={{ title: 'Perfil' }} />
    </InicioStackNav.Navigator>
  );
}

// EXPLORAR: unifica las viejas pestañas Mapa + Lista + Comunidad. Trae las mismas
// sub-pantallas que tenían esos tres stacks (PetDetail, AddSighting, Chat,
// PublicProfile) más Encontre (que venía de ListStack).
const ExplorarStackNav = createNativeStackNavigator();
function ExplorarStack() {
  return (
    <ExplorarStackNav.Navigator>
      <ExplorarStackNav.Screen name="Explorar" component={ExplorarScreen} options={{ headerShown: false }} />
      <ExplorarStackNav.Screen
        name="Encontre"
        component={EncontreScreen}
        options={{ title: 'Encontré una mascota' }}
      />
      <ExplorarStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <ExplorarStackNav.Screen name="AddSighting" component={AddSightingScreen} options={{ title: 'Lo vi por acá' }} />
      <ExplorarStackNav.Screen name="Chat" component={ChatScreen} />
      <ExplorarStackNav.Screen name="PublicProfile" component={PublicProfileScreen} options={{ title: 'Perfil' }} />
    </ExplorarStackNav.Navigator>
  );
}

// Feed de adopción, con su propio stack para poder abrir el chat y el perfil
// público del publicador sin salir de la pestaña (igual que Comunidad).
// `PublicarAdopcion` va acá adentro (no en el stack raíz) para heredar el
// header + botón de volver nativos de este navigator, igual que EncontreScreen
// dentro de ListStack. `AdopcionDetail` en cambio SÍ vive en el stack raíz
// (ver RootNavigator) porque necesita linking público `adopcion/:id`; se
// alcanza por burbujeo, igual que `GuiaPerdida` desde InicioStack.
const AdopcionStackNav = createNativeStackNavigator();
function AdopcionStack() {
  return (
    <AdopcionStackNav.Navigator>
      <AdopcionStackNav.Screen name="Adopcion" component={AdopcionFeedScreen} options={{ headerShown: false }} />
      <AdopcionStackNav.Screen
        name="PublicarAdopcion"
        component={PublicarAdopcionScreen}
        options={{ title: 'Publicar en adopción' }}
      />
      <AdopcionStackNav.Screen name="Chat" component={ChatScreen} />
      <AdopcionStackNav.Screen name="PublicProfile" component={PublicProfileScreen} options={{ title: 'Perfil' }} />
    </AdopcionStackNav.Navigator>
  );
}

// La bandeja de Mensajes dejó de ser pestaña: ahora se abre desde el ícono de
// `MensajesButton` en el encabezado de Inicio/Explorar/Adopción, y este stack se
// registra en el stack RAÍZ (ver RootNavigator) como `Mensajes`.
const MsgStackNav = createNativeStackNavigator();
export function MsgStack() {
  return (
    <MsgStackNav.Navigator>
      <MsgStackNav.Screen name="Conversaciones" component={ConversationsScreen} options={{ headerShown: false }} />
      <MsgStackNav.Screen name="Chat" component={ChatScreen} />
      <MsgStackNav.Screen name="PublicProfile" component={PublicProfileScreen} options={{ title: 'Perfil' }} />
    </MsgStackNav.Navigator>
  );
}

// Perfil también es un stack propio: desde la lista de reportes se puede
// entrar a EditPet para editar los campos de texto de un reporte.
const ProfileStackNav = createNativeStackNavigator();
function ProfileStack() {
  return (
    <ProfileStackNav.Navigator>
      <ProfileStackNav.Screen name="Perfil" component={ProfileScreen} options={{ headerShown: false }} />
      <ProfileStackNav.Screen name="MyPets" component={MyPetsScreen} options={{ title: 'Mis mascotas' }} />
      <ProfileStackNav.Screen name="Guardados" component={GuardadosScreen} options={{ title: 'Guardados' }} />
      <ProfileStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <ProfileStackNav.Screen name="AddSighting" component={AddSightingScreen} options={{ title: 'Lo vi por acá' }} />
      <ProfileStackNav.Screen name="Chat" component={ChatScreen} />
      <ProfileStackNav.Screen name="PublicProfile" component={PublicProfileScreen} options={{ title: 'Perfil' }} />
      <ProfileStackNav.Screen name="EditPet" component={EditPetScreen} options={{ title: 'Editar reporte' }} />
      <ProfileStackNav.Screen
        name="AlertZone"
        component={AlertZoneScreen}
        options={{ title: 'Mi zona de alerta' }}
      />
      <ProfileStackNav.Screen
        name="NotificationPrefs"
        component={NotificationPrefsScreen}
        options={{ title: 'Avisos' }}
      />
      <ProfileStackNav.Screen
        name="Legal"
        component={LegalScreen}
        options={{ title: 'Privacidad y términos' }}
      />
      <ProfileStackNav.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: 'Borrar mi cuenta' }}
      />
    </ProfileStackNav.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Inicio: 'home',
  Explorar: 'search',
  Publicar: 'add-circle',
  Adopcion: 'paw',
  Perfil: 'person',
};

export default function TabNavigator() {
  const { session } = useAuth();

  // MODO INVITADO: Publicar y Mensajes siguen VISIBLES sin sesión — esconderlos
  // le ocultaría al invitado que la app hace más de lo que está viendo. Al
  // tocarlos, en vez de navegar, se dispara el portero con el mensaje propio de
  // esa acción y se ofrece crear cuenta.
  const porteroDeTab = (accion: AccionProtegida) => ({ navigation }: any) => ({
    tabPress: (e: any) => {
      if (session) return;
      e.preventDefault();
      notify(mensajeDe(accion));
      navigation.navigate('Register');
    },
  });

  return (
    <Tab.Navigator
      initialRouteName="Inicio"
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: font.bodySemi,
          fontSize: 11,
        },
        tabBarIcon: ({ color }) => {
          const isPublish = route.name === 'Publicar';
          return (
            <Ionicons
              name={TAB_ICONS[route.name]}
              size={isPublish ? 32 : 24}
              color={isPublish ? colors.lost : color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Inicio" component={InicioStack} options={{ headerShown: false }} />
      <Tab.Screen name="Explorar" component={ExplorarStack} options={{ headerShown: false }} />
      <Tab.Screen name="Publicar" component={PublishScreen} listeners={porteroDeTab('publicar')} />
      <Tab.Screen
        name="Adopcion"
        component={AdopcionStack}
        options={{ headerShown: false, tabBarLabel: 'Adopción' }}
      />
      <Tab.Screen name="Perfil" component={ProfileStack} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import PublishScreen from '../screens/PublishScreen';
import HomeScreen from '../screens/HomeScreen';
import MapScreen from '../screens/MapScreen';
import ListScreen from '../screens/ListScreen';
import EncontreScreen from '../screens/EncontreScreen';
import PetDetailScreen from '../screens/PetDetailScreen';
import AddSightingScreen from '../screens/AddSightingScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import GuardadosScreen from '../screens/GuardadosScreen';
import AlertZoneScreen from '../screens/AlertZoneScreen';
import NotificationPrefsScreen from '../screens/NotificationPrefsScreen';
import EditPetScreen from '../screens/EditPetScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import LegalScreen from '../screens/LegalScreen';
import { useUnread } from '../hooks/useUnread';
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
    </InicioStackNav.Navigator>
  );
}

const MapStackNav = createNativeStackNavigator();
function MapStack() {
  return (
    <MapStackNav.Navigator>
      <MapStackNav.Screen name="Mapa" component={MapScreen} options={{ headerShown: false }} />
      <MapStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <MapStackNav.Screen name="AddSighting" component={AddSightingScreen} options={{ title: 'Lo vi por acá' }} />
      <MapStackNav.Screen name="Chat" component={ChatScreen} />
    </MapStackNav.Navigator>
  );
}

const ListStackNav = createNativeStackNavigator();
function ListStack() {
  return (
    <ListStackNav.Navigator>
      <ListStackNav.Screen name="Lista" component={ListScreen} options={{ headerShown: false }} />
      <ListStackNav.Screen
        name="Encontre"
        component={EncontreScreen}
        options={{ title: 'Encontré una mascota' }}
      />
      <ListStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <ListStackNav.Screen name="AddSighting" component={AddSightingScreen} options={{ title: 'Lo vi por acá' }} />
      <ListStackNav.Screen name="Chat" component={ChatScreen} />
    </ListStackNav.Navigator>
  );
}

const MsgStackNav = createNativeStackNavigator();
function MsgStack() {
  return (
    <MsgStackNav.Navigator>
      <MsgStackNav.Screen name="Conversaciones" component={ConversationsScreen} options={{ headerShown: false }} />
      <MsgStackNav.Screen name="Chat" component={ChatScreen} />
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
      <ProfileStackNav.Screen name="Guardados" component={GuardadosScreen} options={{ title: 'Guardados' }} />
      <ProfileStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <ProfileStackNav.Screen name="AddSighting" component={AddSightingScreen} options={{ title: 'Lo vi por acá' }} />
      <ProfileStackNav.Screen name="Chat" component={ChatScreen} />
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
    </ProfileStackNav.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Inicio: 'home',
  Mapa: 'map',
  Lista: 'list',
  Publicar: 'add-circle',
  Mensajes: 'chatbubble-ellipses',
  Perfil: 'person',
};

export default function TabNavigator() {
  const { count } = useUnread();
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
      navigation.navigate('Register', { volverA: { name: 'Inicio' } });
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
      <Tab.Screen name="Mapa" component={MapStack} options={{ headerShown: false }} />
      <Tab.Screen name="Lista" component={ListStack} options={{ headerShown: false }} />
      <Tab.Screen name="Publicar" component={PublishScreen} listeners={porteroDeTab('publicar')} />
      <Tab.Screen
        name="Mensajes"
        component={MsgStack}
        listeners={porteroDeTab('contactar')}
        options={{
          headerShown: false,
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.lost, color: colors.white },
        }}
      />
      <Tab.Screen name="Perfil" component={ProfileStack} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

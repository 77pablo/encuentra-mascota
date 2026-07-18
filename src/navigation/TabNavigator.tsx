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
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EditPetScreen from '../screens/EditPetScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import LegalScreen from '../screens/LegalScreen';
import { useUnread } from '../hooks/useUnread';
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
      <InicioStackNav.Screen name="Chat" component={ChatScreen} />
    </InicioStackNav.Navigator>
  );
}

const MapStackNav = createNativeStackNavigator();
function MapStack() {
  return (
    <MapStackNav.Navigator>
      <MapStackNav.Screen name="Mapa" component={MapScreen} />
      <MapStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <MapStackNav.Screen name="Chat" component={ChatScreen} />
    </MapStackNav.Navigator>
  );
}

const ListStackNav = createNativeStackNavigator();
function ListStack() {
  return (
    <ListStackNav.Navigator>
      <ListStackNav.Screen name="Lista" component={ListScreen} />
      <ListStackNav.Screen
        name="Encontre"
        component={EncontreScreen}
        options={{ title: 'Encontré una mascota' }}
      />
      <ListStackNav.Screen name="PetDetail" component={PetDetailScreen} options={{ title: 'Detalle' }} />
      <ListStackNav.Screen name="Chat" component={ChatScreen} />
    </ListStackNav.Navigator>
  );
}

const MsgStackNav = createNativeStackNavigator();
function MsgStack() {
  return (
    <MsgStackNav.Navigator>
      <MsgStackNav.Screen name="Conversaciones" component={ConversationsScreen} />
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
      <ProfileStackNav.Screen name="Perfil" component={ProfileScreen} />
      <ProfileStackNav.Screen name="EditPet" component={EditPetScreen} options={{ title: 'Editar reporte' }} />
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
      <Tab.Screen name="Publicar" component={PublishScreen} />
      <Tab.Screen
        name="Mensajes"
        component={MsgStack}
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

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import PublishScreen from '../screens/PublishScreen';
import MapScreen from '../screens/MapScreen';
import ListScreen from '../screens/ListScreen';
import PetDetailScreen from '../screens/PetDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import { colors, font } from '../theme';

const Tab = createBottomTabNavigator();

// Cada pestaña que puede navegar a un detalle de mascota (Mapa, Lista) tiene
// su propio stack nativo con las pantallas PetDetail y Chat registradas, para
// que tocar un pin/tarjeta pueda abrir el detalle y, desde ahí, el chat.
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

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Mapa: 'map',
  Lista: 'list',
  Publicar: 'add-circle',
  Mensajes: 'chatbubble-ellipses',
  Perfil: 'person',
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: {
          fontFamily: font.bodySemi,
          fontSize: 11,
        },
        tabBarIcon: ({ color, focused }) => {
          const isPublish = route.name === 'Publicar';
          return (
            <Ionicons
              name={TAB_ICONS[route.name]}
              size={isPublish ? 30 : 24}
              color={isPublish && focused ? colors.brand : color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Mapa" component={MapStack} options={{ headerShown: false }} />
      <Tab.Screen name="Lista" component={ListStack} options={{ headerShown: false }} />
      <Tab.Screen name="Publicar" component={PublishScreen} />
      <Tab.Screen name="Mensajes" component={MsgStack} options={{ headerShown: false }} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PublishScreen from '../screens/PublishScreen';
import MapScreen from '../screens/MapScreen';
import ListScreen from '../screens/ListScreen';
import PetDetailScreen from '../screens/PetDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ConversationsScreen from '../screens/ConversationsScreen';

const Tab = createBottomTabNavigator();

function Placeholder({ nombre }: { nombre: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{nombre}</Text>
    </View>
  );
}

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

export default function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Mapa" component={MapStack} options={{ headerShown: false }} />
      <Tab.Screen name="Lista" component={ListStack} options={{ headerShown: false }} />
      <Tab.Screen name="Publicar" component={PublishScreen} />
      <Tab.Screen name="Mensajes" component={MsgStack} options={{ headerShown: false }} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

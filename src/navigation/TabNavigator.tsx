import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

function Placeholder({ nombre }: { nombre: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{nombre}</Text>
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Mapa">{() => <Placeholder nombre="Mapa" />}</Tab.Screen>
      <Tab.Screen name="Lista">{() => <Placeholder nombre="Lista" />}</Tab.Screen>
      <Tab.Screen name="Publicar">{() => <Placeholder nombre="Publicar" />}</Tab.Screen>
      <Tab.Screen name="Mensajes">{() => <Placeholder nombre="Mensajes" />}</Tab.Screen>
    </Tab.Navigator>
  );
}

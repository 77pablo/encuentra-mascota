import React from 'react';
import { Text, View } from 'react-native';

// Placeholder temporal: la pantalla de chat real se implementa en la Tarea 15.
// Existe aquí solo para que la ruta "Chat" resuelva y compile el stack de
// navegación de las pestañas Mapa/Lista (botón "Contactar" de PetDetailScreen).
export default function ChatScreen({ route }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Chat</Text>
    </View>
  );
}

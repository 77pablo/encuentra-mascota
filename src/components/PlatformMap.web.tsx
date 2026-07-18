import React from 'react';
import { View, Text } from 'react-native';

export function Marker(_props: any) {
  return null;
}

export default function MapView({ style, children }: any) {
  return (
    <View style={[{ backgroundColor: '#e9eef2', alignItems: 'center', justifyContent: 'center', padding: 16 }, style]}>
      <Text style={{ textAlign: 'center', color: '#556' }}>
        🗺️ El mapa solo está disponible en la app móvil.{'\n'}(En la versión web se muestra este recuadro.)
      </Text>
      {children}
    </View>
  );
}

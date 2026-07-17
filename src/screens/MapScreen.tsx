import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';

export default function MapScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);

  useFocusEffect(
    useCallback(() => {
      listActivePets().then(setPets).catch(() => setPets([]));
    }, []),
  );

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }}
        initialRegion={{ latitude: -33.45, longitude: -70.66, latitudeDelta: 0.3, longitudeDelta: 0.3 }}>
        {pets.map((p) => (
          <Marker key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor={p.estado === 'perdida' ? 'red' : 'green'}
            title={`${p.estado === 'perdida' ? 'Perdida' : 'Encontrada'} · ${p.especie}`}
            description={p.descripcion.slice(0, 40)}
            onCalloutPress={() => navigation.navigate('PetDetail', { id: p.id })}
          />
        ))}
      </MapView>
    </View>
  );
}

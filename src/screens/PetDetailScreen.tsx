import React, { useEffect, useState } from 'react';
import { Button, Image, ScrollView, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { getPet, Pet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';

export default function PetDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);

  useEffect(() => {
    getPet(id).then(setPet).catch(() => setPet(null));
  }, [id]);

  if (!pet) return <Text style={{ padding: 24 }}>Cargando…</Text>;

  const esMio = pet.user_id === user?.id;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {pet.fotos.map((f) => (
        <Image key={f} source={{ uri: f }} style={{ height: 240, borderRadius: 8 }} />
      ))}
      <Text style={{ fontSize: 20, fontWeight: '700' }}>
        {pet.estado === 'perdida' ? '🔴 Perdida' : '🟢 Encontrada'} · {pet.especie}
        {pet.raza ? ` (${pet.raza})` : ''}
      </Text>
      {pet.nombre ? <Text>Nombre: {pet.nombre}</Text> : null}
      <Text>{pet.descripcion}</Text>
      {pet.recompensa ? <Text style={{ color: '#b8860b' }}>Recompensa: {pet.recompensa}</Text> : null}
      <MapView style={{ height: 160, borderRadius: 8 }}
        region={{ latitude: pet.lat, longitude: pet.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
        <Marker coordinate={{ latitude: pet.lat, longitude: pet.lng }} />
      </MapView>
      {!esMio && (
        <Button title="Contactar 💬"
          onPress={() => navigation.navigate('Chat', { petId: pet.id, otherUserId: pet.user_id })} />
      )}
    </ScrollView>
  );
}

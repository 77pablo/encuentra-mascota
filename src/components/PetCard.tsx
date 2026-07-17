import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Pet } from '../services/pets';

export default function PetCard({ pet, onPress }: { pet: Pet; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ flexDirection: 'row', gap: 12, padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
      {pet.fotos[0] ? (
        <Image source={{ uri: pet.fotos[0] }} style={{ width: 64, height: 64, borderRadius: 8 }} />
      ) : (
        <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#ddd' }} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700' }}>
          {pet.estado === 'perdida' ? '🔴 Perdida' : '🟢 Encontrada'} · {pet.especie}
          {pet.raza ? ` (${pet.raza})` : ''}
        </Text>
        <Text numberOfLines={2}>{pet.descripcion}</Text>
        {pet.recompensa ? <Text style={{ color: '#b8860b' }}>Recompensa: {pet.recompensa}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

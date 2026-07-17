import React, { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';
import PetCard from '../components/PetCard';

export default function ListScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [estado, setEstado] = useState<'todas' | 'perdida' | 'encontrada'>('todas');

  useFocusEffect(
    useCallback(() => {
      listActivePets().then(setPets).catch(() => setPets([]));
    }, []),
  );

  const filtradas = useMemo(
    () => (estado === 'todas' ? pets : pets.filter((p) => p.estado === estado)),
    [pets, estado],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 8, padding: 8 }}>
        <Button title="Todas" onPress={() => setEstado('todas')} />
        <Button title="Perdidas" onPress={() => setEstado('perdida')} />
        <Button title="Encontradas" onPress={() => setEstado('encontrada')} />
      </View>
      <FlatList data={filtradas} keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PetCard pet={item} onPress={() => navigation.navigate('PetDetail', { id: item.id })} />
        )} />
    </View>
  );
}

import React, { useCallback, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { closePet, Pet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';
import { notify } from '../lib/notify';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [mis, setMis] = useState<Pet[]>([]);

  const cargar = useCallback(() => {
    supabase.from('pets').select('*').eq('user_id', user!.id).eq('activo', true)
      .then(({ data }) => setMis((data ?? []) as Pet[]));
  }, [user]);

  useFocusEffect(cargar);

  const marcar = async (id: string) => {
    await closePet(id);
    notify('¡Genial!', 'Reporte cerrado.');
    cargar();
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Mis reportes activos</Text>
      <FlatList data={mis} keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text>No tienes reportes activos.</Text>}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>
              {item.estado} · {item.especie} — {item.descripcion.slice(0, 40)}
            </Text>
            <Button title="Ya apareció ✅" onPress={() => marcar(item.id)} />
          </View>
        )} />
      <View style={{ marginTop: 16 }}>
        <Button title="Cerrar sesión" color="#c00" onPress={signOut} />
      </View>
    </View>
  );
}

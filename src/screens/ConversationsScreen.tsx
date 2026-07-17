import React, { useCallback, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listConversations, Conversation } from '../services/messages';
import { useAuth } from '../hooks/useAuth';

export default function ConversationsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);

  useFocusEffect(
    useCallback(() => {
      listConversations(user!.id)
        .then(setConvs)
        .catch((e) => console.error('No se pudieron cargar las conversaciones:', e));
    }, [user]),
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={convs}
        keyExtractor={(c) => `${c.petId}:${c.otherUser}`}
        ListEmptyComponent={<Text style={{ padding: 24 }}>Aún no tienes conversaciones.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat', { petId: item.petId, otherUserId: item.otherUser })}
            style={{ padding: 14, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '700' }}>{item.otherNombre} · {item.petLabel}</Text>
            <Text numberOfLines={1} style={{ color: '#555' }}>{item.lastTexto}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

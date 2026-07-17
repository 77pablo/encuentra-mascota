import React, { useState } from 'react';
import { Button, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { sendMessage } from '../services/messages';

export default function ChatScreen({ route }: any) {
  const { petId, otherUserId } = route.params;
  const { user } = useAuth();
  const me = user!.id;
  const messages = useRealtimeMessages(petId, me, otherUserId);
  const [texto, setTexto] = useState('');

  const onSend = async () => {
    const t = texto;
    setTexto('');
    try {
      await sendMessage(petId, me, otherUserId, t);
    } catch {
      setTexto(t); // restaurar si falla
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList data={messages} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 12, gap: 8 }}
        renderItem={({ item }) => (
          <View style={{ alignSelf: item.from_user === me ? 'flex-end' : 'flex-start',
            backgroundColor: item.from_user === me ? '#dcf8c6' : '#eee', borderRadius: 12, padding: 10, maxWidth: '80%' }}>
            <Text>{item.texto}</Text>
          </View>
        )} />
      <View style={{ flexDirection: 'row', gap: 8, padding: 8 }}>
        <TextInput placeholder="Escribe un mensaje…" value={texto} onChangeText={setTexto}
          style={{ flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14 }} />
        <Button title="Enviar" onPress={onSend} disabled={!texto.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

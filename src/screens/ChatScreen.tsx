import React, { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { useUnread } from '../hooks/useUnread';
import { markThreadRead, sendMessage } from '../services/messages';
import { supabase } from '../lib/supabase';
import { AppText, Screen } from '../ui';
import { colors, font, radius, spacing } from '../theme';

export default function ChatScreen({ route }: any) {
  const { petId, otherUserId } = route.params;
  const { user } = useAuth();
  const me = user!.id;
  const messages = useRealtimeMessages(petId, me, otherUserId);
  const [texto, setTexto] = useState('');
  const { refresh: refreshUnread } = useUnread();

  useEffect(() => {
    markThreadRead(petId, me, otherUserId)
      .then(() => refreshUnread())
      .catch((e) => console.error('No se pudo marcar el hilo como leído:', e));
  }, [petId, me, otherUserId, messages.length, refreshUnread]);

  const onSend = async () => {
    const t = texto;
    setTexto('');
    try {
      await sendMessage(petId, me, otherUserId, t);
      // Push "best effort": si falla, el chat igual funcionó.
      supabase.functions
        .invoke('send-push', {
          body: { toUserId: otherUserId, title: 'Nuevo mensaje sobre una mascota', body: t.slice(0, 80) },
        })
        .catch(() => {});
    } catch {
      setTexto(t); // restaurar si falla
    }
  };

  const puedeEnviar = texto.trim().length > 0;

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.from_user === me;
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <AppText size={15} color={mine ? colors.white : colors.ink}>
                    {item.texto}
                  </AppText>
                </View>
              </View>
            );
          }}
        />
        <View style={styles.inputRow}>
          <TextInput
            placeholder="Escribe un mensaje…"
            placeholderTextColor={colors.muted}
            value={texto}
            onChangeText={setTexto}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onSend}
            disabled={!puedeEnviar}
            style={[styles.sendButton, !puedeEnviar && styles.sendButtonDisabled]}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    flexGrow: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubbleMine: {
    backgroundColor: colors.brand,
  },
  bubbleOther: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

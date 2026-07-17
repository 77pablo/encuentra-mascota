import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listConversations, Conversation } from '../services/messages';
import { useAuth } from '../hooks/useAuth';
import { AppText, EmptyState, Screen } from '../ui';
import { colors, radius, spacing } from '../theme';

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
    <Screen padded>
      <FlatList
        data={convs}
        keyExtractor={(c) => `${c.petId}:${c.otherUser}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            emoji="💬"
            title="Sin conversaciones todavía"
            subtitle="Cuando escribas o te escriban, tus chats aparecen aquí."
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat', { petId: item.petId, otherUserId: item.otherUser })}
            activeOpacity={0.85}
            style={styles.row}
          >
            <View style={styles.avatar}>
              <AppText weight="bold" color={colors.brand} size={18}>
                {item.otherNombre ? item.otherNombre.charAt(0).toUpperCase() : '🐾'}
              </AppText>
            </View>
            <View style={styles.info}>
              <AppText weight="bold" size={15}>
                {item.otherNombre}
              </AppText>
              <AppText muted size={12} numberOfLines={1}>
                {item.petLabel}
              </AppText>
              <AppText muted size={13} numberOfLines={1} style={styles.preview}>
                {item.lastTexto}
              </AppText>
            </View>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  preview: {
    marginTop: 2,
  },
});

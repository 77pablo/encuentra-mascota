import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { listConversations, Conversation } from '../services/messages';
import { useAuth } from '../hooks/useAuth';
import { timeAgo } from '../lib/time';
import { AppText, Card, EmptyState, ErrorState, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

export default function ConversationsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    // Sin sesión no hay a quién preguntarle: dejamos la lista vacía y cortamos
    // la carga. Si no, el spinner se quedaba girando para siempre.
    if (!user) {
      setConvs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    listConversations(user.id)
      .then(setConvs)
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useFocusEffect(cargar);

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <Screen padded>
        <ErrorState message={error} onRetry={cargar} />
      </Screen>
    );
  }

  return (
    <Screen padded>
      <Title size={22} style={styles.screenTitle}>
        Mensajes
      </Title>
      <FlatList
        data={convs}
        keyExtractor={(c) => `${c.petId}:${c.otherUser}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            illustration
            title="Sin conversaciones todavía"
            subtitle="Cuando escribas o te escriban, tus chats aparecen aquí."
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat', { petId: item.petId, otherUserId: item.otherUser })}
            activeOpacity={0.85}
          >
            <Card style={styles.row}>
              <View style={styles.avatar}>
                <AppText weight="bold" color={colors.brand} size={18}>
                  {item.otherNombre ? item.otherNombre.charAt(0).toUpperCase() : '🐾'}
                </AppText>
              </View>
              <View style={styles.info}>
                <View style={styles.infoTop}>
                  <AppText weight="bold" size={15} numberOfLines={1} style={styles.name}>
                    {item.otherNombre}
                  </AppText>
                  <AppText muted size={11}>
                    {timeAgo(item.lastAt)}
                  </AppText>
                </View>
                <AppText muted size={12} numberOfLines={1}>
                  {item.petLabel}
                </AppText>
                <AppText muted size={13} numberOfLines={1} style={styles.preview}>
                  {item.lastTexto}
                </AppText>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  list: {
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  infoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
  },
  preview: {
    marginTop: 2,
  },
});

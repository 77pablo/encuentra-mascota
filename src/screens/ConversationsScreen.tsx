import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { listConversations, Conversation, paramsDeCtx } from '../services/messages';
import { useAuth } from '../hooks/useAuth';
import { timeAgo } from '../lib/time';
import { AppText, Card, EmptyState, ErrorState, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

export default function ConversationsScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
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
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Title size={22}>Mensajes</Title>
      </View>
      <FlatList
        data={convs}
        keyExtractor={(c) => `${c.ctx.tipo}:${c.ctx.tipo === 'pet_borrado' ? '' : c.ctx.id}:${c.otherUser}`}
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
            onPress={() =>
              navigation.navigate('Chat', { ...paramsDeCtx(item.ctx), otherUserId: item.otherUser })
            }
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

const crearEstilos = (colors: Colors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
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

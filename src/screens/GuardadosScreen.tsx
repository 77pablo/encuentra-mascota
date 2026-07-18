import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { listMyFavorites } from '../services/favorites';
import { Pet } from '../services/pets';
import PetCard from '../components/PetCard';
import { useAuth } from '../hooks/useAuth';
import { AppText, EmptyState, ErrorState, Loading, Screen, Title } from '../ui';
import { colors, spacing } from '../theme';

export default function GuardadosScreen({ navigation }: any) {
  const { user } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!user) {
      setPets([]);
      setLoading(false);
      return;
    }
    setError(null);
    listMyFavorites(user.id)
      .then(setPets)
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [user]);

  useFocusEffect(cargar);

  const onRefresh = () => {
    setRefreshing(true);
    cargar();
  };

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
        Guardados
      </Title>
      <AppText muted size={13} style={styles.subtitle}>
        Los reportes que marcaste con el corazón.
      </AppText>

      <FlatList
        data={pets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
        ListEmptyComponent={
          <EmptyState
            illustration
            title="Todavía no guardaste ningún reporte"
            subtitle="Toca el corazón de una mascota para tenerla a mano acá."
          />
        }
        renderItem={({ item }) => (
          <PetCard pet={item} onPress={() => navigation.navigate('PetDetail', { id: item.id })} />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    marginTop: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.md,
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { listMyFavorites } from '../services/favorites';
import { Adoption, getAdoptionsByIds } from '../services/adoptions';
import { Pet } from '../services/pets';
import PetCard from '../components/PetCard';
import { useAuth } from '../hooks/useAuth';
import { useAdoptionSaves } from '../context/AdoptionSavesProvider';
import { AppText, Card, EmptyState, ErrorState, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<Adoption['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Tarjeta compacta de una adopción guardada — mismo look que `PetCard` (foto
// chica + info + corazón) pero para `Adoption` en vez de `Pet`, para que la
// sección de adopciones se sienta igual que la de reportes guardados.
function AdoptionSavedCard({ adoption, onPress }: { adoption: Adoption; onPress: () => void }) {
  const { estaGuardada, alternar } = useAdoptionSaves();
  const guardada = estaGuardada(adoption.id);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.card}>
        <View style={styles.row}>
          {adoption.fotos[0] ? (
            <Image source={{ uri: adoption.fotos[0] }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name="paw" size={26} color={colors.muted} />
            </View>
          )}
          <View style={styles.info}>
            <AppText weight="bold" size={15} numberOfLines={1}>
              {adoption.nombre || especieLabel[adoption.especie]}
            </AppText>
            <AppText muted size={12} numberOfLines={1}>
              En adopción · {especieLabel[adoption.especie]}
              {adoption.comuna ? ` · ${adoption.comuna}` : ''}
            </AppText>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.heartButton}
            onPress={(e) => {
              e.stopPropagation?.();
              alternar(adoption.id);
            }}
          >
            <Ionicons name={guardada ? 'heart' : 'heart-outline'} size={20} color={colors.lost} />
          </TouchableOpacity>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

export default function GuardadosScreen({ navigation }: any) {
  const { user } = useAuth();
  const { guardadas } = useAdoptionSaves();
  const [pets, setPets] = useState<Pet[]>([]);
  const [adoptions, setAdoptions] = useState<Adoption[]>([]);
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

  // Las adopciones guardadas se cargan aparte: `guardadas` (el set de ids en
  // memoria de `AdoptionSavesProvider`) ya se mantiene al día solo (guardar o
  // quitar desde cualquier pantalla actualiza el set), así que basta con
  // reaccionar a sus cambios para traer las filas completas por id.
  useEffect(() => {
    if (!user || guardadas.size === 0) {
      setAdoptions([]);
      return;
    }
    getAdoptionsByIds([...guardadas])
      .then(setAdoptions)
      .catch((e) => console.error('No se pudieron cargar las adopciones guardadas:', e));
  }, [user, guardadas]);

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
        ListFooterComponent={
          adoptions.length > 0 ? (
            <View style={styles.adoptionsSection}>
              <Title size={18}>Adopciones guardadas</Title>
              <AppText muted size={13} style={styles.subtitle}>
                Las publicaciones de adopción que marcaste con el corazón.
              </AppText>
              <View style={styles.adoptionsList}>
                {adoptions.map((adoption) => (
                  <AdoptionSavedCard
                    key={adoption.id}
                    adoption={adoption}
                    onPress={() => navigation.navigate('AdopcionDetail', { id: adoption.id })}
                  />
                ))}
              </View>
            </View>
          ) : null
        }
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
  adoptionsSection: {
    marginTop: spacing.lg,
  },
  adoptionsList: {
    gap: spacing.md,
  },
  card: {
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
  },
  photoPlaceholder: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  heartButton: {
    padding: spacing.xs,
    alignSelf: 'flex-start',
  },
});

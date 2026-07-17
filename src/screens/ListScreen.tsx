import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';
import PetCard from '../components/PetCard';
import { AppText, Button, EmptyState, Screen } from '../ui';
import { colors, radius, spacing } from '../theme';

type Filtro = 'todas' | 'perdida' | 'encontrada';

const filtros: { key: Filtro; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'perdida', label: 'Perdidas' },
  { key: 'encontrada', label: 'Encontradas' },
];

export default function ListScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [estado, setEstado] = useState<Filtro>('todas');

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
    <Screen padded>
      <Button
        title="¿Encontraste una mascota?"
        icon="search"
        onPress={() => navigation.navigate('Encontre')}
        style={styles.findButton}
      />
      <View style={styles.chipsRow}>
        {filtros.map((f) => {
          const active = estado === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setEstado(f.key)}
              activeOpacity={0.8}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            >
              <AppText
                weight="bold"
                size={13}
                color={active ? colors.white : colors.muted}
              >
                {f.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
      <FlatList
        data={filtradas}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            emoji="🐾"
            title="Aún no hay mascotas"
            subtitle="Sé el primero en publicar un reporte."
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
  findButton: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipInactive: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  list: {
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
});

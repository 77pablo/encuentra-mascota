import React from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText, Badge, Card, Title } from '../ui';
import { colors, radius, spacing } from '../theme';
import { Pet } from '../services/pets';
import { distanceLabel } from '../lib/geo';
import { timeAgo } from '../lib/time';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

export default function PetCard({
  pet,
  onPress,
  distanceKm,
}: {
  pet: Pet;
  onPress: () => void;
  distanceKm?: number;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.card}>
        <View style={styles.row}>
          {pet.fotos[0] ? (
            <Image source={{ uri: pet.fotos[0] }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <AppText size={28}>🐾</AppText>
            </View>
          )}
          <View style={styles.info}>
            <Badge estado={pet.estado} />
            <Title size={16} numberOfLines={1} style={styles.title}>
              {especieLabel[pet.especie]}
              {pet.nombre ? ` · ${pet.nombre}` : ''}
              {pet.raza ? (
                <AppText muted size={13}>
                  {' '}
                  ({pet.raza})
                </AppText>
              ) : null}
            </Title>
            <AppText muted size={13} numberOfLines={2} style={styles.description}>
              {pet.descripcion}
            </AppText>
            <AppText muted size={12}>
              🕓 {timeAgo(pet.creado_en)}
            </AppText>
            {distanceKm !== undefined ? (
              <AppText muted size={12}>
                📍 {distanceLabel(distanceKm)}
              </AppText>
            ) : null}
            {pet.recompensa ? (
              <View style={styles.rewardPill}>
                <AppText weight="bold" size={12} color={colors.ink}>
                  🎁 Recompensa: {pet.recompensa}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  photo: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
  },
  photoPlaceholder: {
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    marginTop: spacing.xs,
  },
  description: {
    lineHeight: 18,
  },
  rewardPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sun,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: spacing.xs,
  },
});

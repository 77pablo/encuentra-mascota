import React, { useMemo } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Badge, Card } from '../ui';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { Pet } from '../services/pets';
import { distanceLabel } from '../lib/geo';
import { timeAgo } from '../lib/time';
import { ETIQUETA_RECOMPENSA, tieneRecompensa } from '../lib/recompensa';
import { useFavorites } from '../hooks/useFavorites';
import { useRequireAuth } from '../hooks/useRequireAuth';

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
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { isFavorite, toggle } = useFavorites();
  const requireAuth = useRequireAuth();
  const guardada = isFavorite(pet.id);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.card}>
        <View style={styles.row}>
          {pet.fotos[0] ? (
            <Image source={{ uri: pet.fotos[0] }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name="paw" size={26} color={colors.muted} />
            </View>
          )}
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <AppText weight="bold" size={15} numberOfLines={1} style={styles.name}>
                {pet.nombre || especieLabel[pet.especie]}
              </AppText>
              <Badge estado={pet.estado} />
            </View>
            <AppText muted size={12} numberOfLines={1}>
              {especieLabel[pet.especie]}
              {pet.raza ? ` · ${pet.raza}` : ''}
              {distanceKm !== undefined ? (
                <>
                  {'  ·  '}
                  <AppText weight="bold" color={colors.found} size={12}>
                    {distanceLabel(distanceKm)}
                  </AppText>
                </>
              ) : null}
              {'  ·  '}
              {timeAgo(pet.creado_en)}
            </AppText>
            {pet.descripcion ? (
              <AppText muted size={13} numberOfLines={2} style={styles.description}>
                {pet.descripcion}
              </AppText>
            ) : null}
            {tieneRecompensa(pet.recompensa) ? (
              <View style={styles.rewardPill}>
                <AppText weight="bold" size={12} color={colors.ink}>
                  🎁 {ETIQUETA_RECOMPENSA}
                </AppText>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.heartButton}
            onPress={(e) => {
              e.stopPropagation?.();
              // Sin sesión el corazón no guarda en el aire: invita a crear cuenta.
              if (!requireAuth('guardar')) return;
              toggle(pet.id);
            }}
          >
            <Ionicons
              name={guardada ? 'heart' : 'heart-outline'}
              size={20}
              color={guardada ? colors.lost : colors.muted}
            />
          </TouchableOpacity>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
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
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
  },
  description: {
    lineHeight: 18,
    marginTop: 2,
  },
  rewardPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sun,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: 2,
  },
  heartButton: {
    padding: spacing.xs,
    alignSelf: 'flex-start',
  },
});

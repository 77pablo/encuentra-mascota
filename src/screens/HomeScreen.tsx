import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { countReunidas, listActivePets, Pet } from '../services/pets';
import { useMyLocation } from '../hooks/useMyLocation';
import { useAuth } from '../hooks/useAuth';
import { distanceKm as getDistanceKm, distanceLabel } from '../lib/geo';
import { timeAgo } from '../lib/time';
import { AppText, Badge, Button, Card, Chip, ErrorState, Loading, Mascota, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const RECIENTES_LIMIT = 4;

const CHIPS = ['Cerca de ti', 'Perros', 'Gatos', 'Perdidos'];

export default function HomeScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [reunidas, setReunidas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useMyLocation(true);
  const { user } = useAuth();

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listActivePets(), countReunidas()])
      .then(([activePets, count]) => {
        setPets(activePets);
        setReunidas(count);
      })
      .catch((e: any) => setError(e?.message ?? 'No pudimos cargar la información.'))
      .finally(() => setLoading(false));
  }, []);

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

  const emailName = user?.email ? user.email.split('@')[0] : '';
  const greetingName = emailName ? emailName.charAt(0).toUpperCase() + emailName.slice(1) : '';
  const avatarLetter = user?.email ? user.email.charAt(0).toUpperCase() : '?';
  const hasCoords = !!location.coords;

  // Ya vienen ordenadas de más nueva a más vieja; solo tomamos las primeras
  // y, si tenemos ubicación, les calculamos la distancia (sin reordenar).
  const topPets = pets.slice(0, RECIENTES_LIMIT);
  const recientes: { pet: Pet; distanceKm?: number }[] = location.coords
    ? topPets.map((p) => ({
        pet: p,
        distanceKm: getDistanceKm(location.coords!, { lat: p.lat, lng: p.lng }),
      }))
    : topPets.map((p) => ({ pet: p }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Encabezado de saludo */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AppText muted size={13}>
              Hola 👋
            </AppText>
            <Title size={20} numberOfLines={1} style={styles.headerTitle}>
              {greetingName ? `¿Buscamos juntos, ${greetingName}?` : '¿Buscamos juntos?'}
            </Title>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.locationChip}>
              <Ionicons name="location" size={13} color={colors.brand} />
              <AppText
                size={12}
                weight="semi"
                color={colors.brand}
                numberOfLines={1}
                style={styles.locationChipLabel}
              >
                {hasCoords ? 'Tu zona' : 'Tu barrio'}
              </AppText>
            </View>
            <View style={styles.avatar}>
              <AppText weight="bold" color={colors.white} size={15}>
                {avatarLetter}
              </AppText>
            </View>
          </View>
        </View>

        {/* Tarjeta hero */}
        <Card style={styles.hero}>
          <View style={styles.heroMascotaWrap} pointerEvents="none">
            <Mascota size={76} />
          </View>
          <View style={styles.heroText}>
            <Title size={22} color={colors.white} style={styles.heroTitle}>
              ¿Se perdió o te encontraste una?
            </Title>
            <AppText color={colors.white} size={13} style={styles.heroSubtitle}>
              El barrio ayuda a que vuelva a casa.
            </AppText>
          </View>
          <View style={styles.heroButtons}>
            <Button
              title="Se me perdió"
              variant="danger"
              onPress={() => navigation.navigate('Publicar', { estado: 'perdida' })}
              style={styles.heroButton}
            />
            <Button
              title="Me encontré"
              variant="secondary"
              onPress={() => navigation.navigate('Publicar', { estado: 'encontrada' })}
              style={styles.heroButton}
            />
          </View>
        </Card>

        {/* Chips de filtro */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {CHIPS.map((label, i) => (
            <Chip
              key={label}
              label={label}
              active={i === 0}
              onPress={() => navigation.navigate('Lista')}
              style={i > 0 ? styles.chipSpacing : undefined}
            />
          ))}
        </ScrollView>

        {reunidas > 0 ? (
          <AppText muted size={13} style={styles.reunidasLine}>
            Ya van {reunidas} vuelta{reunidas === 1 ? '' : 's'} a casa 🎉
          </AppText>
        ) : null}

        {/* Sección "cerca de ti" */}
        <View style={styles.sectionHeader}>
          <Title size={17}>Cerca de ti</Title>
          <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Lista')}>
            <AppText weight="semi" color={colors.brand} size={13}>
              Ver todo
            </AppText>
          </TouchableOpacity>
        </View>

        {recientes.length === 0 ? (
          <AppText muted style={styles.emptyRecientes}>
            Aún no hay reportes por acá. Publica el primero.
          </AppText>
        ) : (
          <View style={styles.recientesList}>
            {recientes.map(({ pet, distanceKm: dKm }) => (
              <TouchableOpacity
                key={pet.id}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PetDetail', { id: pet.id })}
              >
                <Card style={styles.petCard}>
                  {pet.fotos[0] ? (
                    <Image source={{ uri: pet.fotos[0] }} style={styles.petPhoto} />
                  ) : (
                    <View style={[styles.petPhoto, styles.petPhotoPlaceholder]}>
                      <Ionicons name="paw" size={22} color={colors.muted} />
                    </View>
                  )}
                  <View style={styles.petInfo}>
                    <View style={styles.petNameRow}>
                      <AppText weight="bold" size={14} numberOfLines={1} style={styles.petName}>
                        {pet.nombre || especieLabel[pet.especie]}
                      </AppText>
                      <Badge estado={pet.estado} />
                    </View>
                    <AppText muted size={12} numberOfLines={1}>
                      {especieLabel[pet.especie]}
                      {dKm !== undefined ? (
                        <>
                          {'  ·  '}
                          <AppText weight="bold" color={colors.found} size={12}>
                            {distanceLabel(dKm)}
                          </AppText>
                        </>
                      ) : null}
                      {'  ·  '}
                      {timeAgo(pet.creado_en)}
                    </AppText>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.heartButton}
                    onPress={(e) => {
                      e.stopPropagation?.();
                    }}
                  >
                    <Ionicons name="heart-outline" size={20} color={colors.muted} />
                  </TouchableOpacity>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexShrink: 1,
    flexGrow: 1,
    marginRight: spacing.sm,
  },
  headerTitle: {
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    backgroundColor: colors.sky,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: 96,
  },
  locationChipLabel: {
    marginLeft: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    backgroundColor: colors.brand,
    overflow: 'hidden',
  },
  heroMascotaWrap: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    opacity: 0.9,
  },
  heroText: {
    maxWidth: '68%',
    minHeight: 92,
    justifyContent: 'center',
  },
  heroTitle: {
    lineHeight: 28,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    opacity: 0.85,
  },
  heroButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heroButton: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  chipsRow: {
    paddingRight: spacing.xl,
  },
  chipSpacing: {
    marginLeft: spacing.sm,
  },
  reunidasLine: {
    marginTop: -spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  emptyRecientes: {
    paddingVertical: spacing.md,
  },
  recientesList: {
    gap: spacing.sm,
  },
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
  },
  petPhoto: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  petPhotoPlaceholder: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petInfo: {
    flex: 1,
    gap: 4,
  },
  petNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  petName: {
    flexShrink: 1,
  },
  heartButton: {
    padding: spacing.xs,
  },
});

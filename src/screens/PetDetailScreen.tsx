import React, { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from '../components/PlatformMap';
import { getPet, Pet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';
import { AppText, Badge, Button, Card, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

export default function PetDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    getPet(id).then(setPet).catch(() => setPet(null));
  }, [id]);

  const onCarouselLayout = (e: LayoutChangeEvent) => {
    setCarouselWidth(e.nativeEvent.layout.width);
  };

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
    setActiveIndex(index);
  };

  if (!pet) {
    return (
      <Screen padded>
        <AppText muted style={styles.loading}>
          Cargando…
        </AppText>
      </Screen>
    );
  }

  const esMio = pet.user_id === user?.id;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {pet.fotos.length > 0 ? (
          <View onLayout={onCarouselLayout}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onCarouselScroll}
              onMomentumScrollEnd={onCarouselScroll}
              scrollEventThrottle={16}
            >
              {pet.fotos.map((f) => (
                <Image
                  key={f}
                  source={{ uri: f }}
                  style={[styles.photo, carouselWidth ? { width: carouselWidth } : null]}
                />
              ))}
            </ScrollView>
            {pet.fotos.length > 1 ? (
              <View style={styles.dotsRow}>
                {pet.fotos.map((f, i) => (
                  <View key={f} style={[styles.dot, i === activeIndex && styles.dotActive]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <AppText size={48}>🐾</AppText>
          </View>
        )}

        <Badge estado={pet.estado} />

        <Title size={22} style={styles.title}>
          {especieLabel[pet.especie]}
          {pet.nombre ? ` · ${pet.nombre}` : ''}
        </Title>

        {pet.raza ? (
          <AppText muted size={14}>
            Raza: {pet.raza}
          </AppText>
        ) : null}
        {pet.nombre ? (
          <AppText muted size={14}>
            Nombre: {pet.nombre}
          </AppText>
        ) : null}

        <Card style={styles.descriptionCard}>
          <AppText size={15} style={styles.descriptionText}>
            {pet.descripcion}
          </AppText>
        </Card>

        {pet.recompensa ? (
          <View style={styles.rewardPill}>
            <AppText weight="bold" size={14} color={colors.ink}>
              💰 Recompensa: {pet.recompensa}
            </AppText>
          </View>
        ) : null}

        <MapView
          style={styles.map}
          region={{ latitude: pet.lat, longitude: pet.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        >
          <Marker coordinate={{ latitude: pet.lat, longitude: pet.lng }} />
        </MapView>

        {!esMio && (
          <Button
            title="Contactar"
            icon="chatbubble-ellipses"
            onPress={() => navigation.navigate('Chat', { petId: pet.id, otherUserId: pet.user_id })}
            style={styles.contactButton}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginTop: spacing.xl,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  photo: {
    width: '100%',
    height: 260,
    borderRadius: radius.md,
  },
  photoPlaceholder: {
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  dotActive: {
    backgroundColor: colors.brand,
    width: 16,
  },
  title: {
    marginTop: spacing.xs,
  },
  descriptionCard: {
    marginTop: spacing.xs,
  },
  descriptionText: {
    lineHeight: 22,
  },
  rewardPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sun,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  map: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  contactButton: {
    marginTop: spacing.md,
  },
});

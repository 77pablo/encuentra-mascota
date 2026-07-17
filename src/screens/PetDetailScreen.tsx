import React, { useCallback, useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from '../components/PlatformMap';
import { getPet, Pet } from '../services/pets';
import { denunciarPet } from '../services/moderation';
import { useAuth } from '../hooks/useAuth';
import { shareReport } from '../lib/share';
import { timeAgo } from '../lib/time';
import { notify } from '../lib/notify';
import { AppText, Badge, Button, Card, ErrorState, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const MOTIVOS_DENUNCIA = [
  'Contenido falso o engañoso',
  'Contenido ofensivo',
  'Spam',
  'Otro',
] as const;

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

export default function PetDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mostrarMotivos, setMostrarMotivos] = useState(false);
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    getPet(id)
      .then(setPet)
      .catch((e: any) => setError(e?.message ?? 'No se pudo cargar el reporte.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const onCarouselLayout = (e: LayoutChangeEvent) => {
    setCarouselWidth(e.nativeEvent.layout.width);
  };

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
    setActiveIndex(index);
  };

  if (loading) {
    return <Loading />;
  }

  if (error || !pet) {
    return (
      <Screen padded>
        <ErrorState message={error ?? undefined} onRetry={cargar} />
      </Screen>
    );
  }

  const esMio = pet.user_id === user?.id;

  const denunciar = async (motivo: string) => {
    if (!user || !pet) return;
    setEnviandoDenuncia(true);
    try {
      await denunciarPet(pet.id, user.id, motivo);
      setMostrarMotivos(false);
      notify('Gracias', 'Recibimos tu denuncia y la revisaremos.');
    } catch (e: any) {
      if (e?.code === '23505') {
        setMostrarMotivos(false);
        notify('Ya habías denunciado este reporte.');
      } else {
        notify('Error', e?.message ?? 'No se pudo enviar la denuncia.');
      }
    } finally {
      setEnviandoDenuncia(false);
    }
  };

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

        <AppText muted size={13}>
          🕓 {timeAgo(pet.creado_en)}
        </AppText>

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

        <Button
          title="Compartir"
          variant="secondary"
          icon="logo-whatsapp"
          onPress={() => shareReport(pet)}
          style={styles.shareButton}
        />

        {!esMio && (
          <View style={styles.reportSection}>
            <Button
              title="Denunciar"
              variant="ghost"
              icon="flag-outline"
              disabled={enviandoDenuncia}
              onPress={() => setMostrarMotivos((v) => !v)}
              style={styles.reportButton}
            />
            {mostrarMotivos ? (
              <View style={styles.reasonList}>
                <AppText muted size={13} style={styles.reasonTitle}>
                  ¿Por qué quieres denunciar este reporte?
                </AppText>
                {MOTIVOS_DENUNCIA.map((motivo) => (
                  <Button
                    key={motivo}
                    title={motivo}
                    variant="secondary"
                    loading={enviandoDenuncia}
                    disabled={enviandoDenuncia}
                    onPress={() => denunciar(motivo)}
                    style={styles.reasonButton}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  shareButton: {
    marginTop: spacing.sm,
  },
  reportSection: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  reportButton: {
    minHeight: 0,
    paddingVertical: spacing.xs,
  },
  reasonList: {
    width: '100%',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  reasonTitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  reasonButton: {
    width: '100%',
  },
});

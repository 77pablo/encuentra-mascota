import React, { useCallback, useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from '../components/PlatformMap';
import { getPet, listActivePets, Pet } from '../services/pets';
import { denunciarPet } from '../services/moderation';
import { useAuth } from '../hooks/useAuth';
import { shareReport } from '../lib/share';
import { findMatches, PetMatch } from '../lib/matches';
import { listSightings, Sighting } from '../services/sightings';
import { sortByRecency, sightingDistanceKm, summaryLabel } from '../lib/sightings';
import { distanceLabel } from '../lib/geo';
import { timeAgo } from '../lib/time';
import { notify } from '../lib/notify';
import PetCard from '../components/PetCard';
import AficheGenerator from '../components/AficheGenerator';
import { faltaWhatsapp } from '../lib/afiche';
import { getMyProfile, Profile } from '../services/profile';
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
  const [matches, setMatches] = useState<PetMatch[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [perfil, setPerfil] = useState<Profile | null>(null);
  const [generandoAfiche, setGenerandoAfiche] = useState(false);

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

  // Cuando ya tenemos la mascota, buscamos posibles coincidencias entre los
  // reportes activos (perdida ↔ encontrada, especie compatible y cercanas).
  // Silencioso: si falla la carga, simplemente no mostramos sugerencias.
  useEffect(() => {
    if (!pet) {
      setMatches([]);
      return;
    }
    let vivo = true;
    listActivePets()
      .then((pets) => {
        if (vivo) setMatches(findMatches(pet, pets));
      })
      .catch(() => {
        if (vivo) setMatches([]);
      });
    return () => {
      vivo = false;
    };
  }, [pet]);

  // Carga el rastro de avistamientos del reporte. Se vuelve a llamar cada vez
  // que la pantalla recupera el foco (p. ej. al volver de "Lo vi por acá").
  const cargarAvistamientos = useCallback(() => {
    listSightings(id)
      .then(setSightings)
      .catch(() => setSightings([]));
  }, [id]);

  useEffect(() => {
    cargarAvistamientos();
    const off = navigation.addListener('focus', cargarAvistamientos);
    return off;
  }, [navigation, cargarAvistamientos]);

  const onAficheDone = useCallback(() => setGenerandoAfiche(false), []);
  const onAficheError = useCallback(
    (m: string) => {
      setGenerandoAfiche(false);
      notify('Error', m);
    },
    [],
  );

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
  const origen = { lat: pet.lat, lng: pet.lng };
  const rastro = sortByRecency(sightings);
  const resumenAvistamientos = summaryLabel(origen, sightings);

  const reportarAvistamiento = () =>
    navigation.navigate('AddSighting', { petId: pet.id, petLat: pet.lat, petLng: pet.lng });

  const crearAfiche = async () => {
    if (!user) return;
    try {
      const p = await getMyProfile(user.id);
      setPerfil(p);
      if (faltaWhatsapp(p)) {
        notify('Agregá tu WhatsApp', 'Cargá tu WhatsApp en tu perfil para que puedan contactarte desde el afiche.');
        navigation.navigate('Perfil');
        return;
      }
      setGenerandoAfiche(true);
    } catch (e: any) {
      notify('Error', e?.message ?? 'No se pudo preparar el afiche.');
    }
  };

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

        <View style={styles.headerRow}>
          <Title size={22} numberOfLines={2} style={styles.title}>
            {pet.nombre || especieLabel[pet.especie]}
          </Title>
          <Badge estado={pet.estado} />
        </View>
        <AppText muted size={13} style={styles.meta}>
          {especieLabel[pet.especie]}
          {pet.raza ? ` · ${pet.raza}` : ''}
          {'  ·  '}
          {timeAgo(pet.creado_en)}
        </AppText>

        <Card style={styles.descriptionCard}>
          <AppText size={15} style={styles.descriptionText}>
            {pet.descripcion}
          </AppText>
        </Card>

        {pet.recompensa ? (
          <View style={styles.rewardPill}>
            <Ionicons name="sunny" size={16} color={colors.ink} style={styles.rewardIcon} />
            <AppText weight="bold" size={14} color={colors.ink}>
              Recompensa: {pet.recompensa}
            </AppText>
          </View>
        ) : null}

        <MapView
          style={styles.map}
          region={{ latitude: pet.lat, longitude: pet.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        >
          <Marker coordinate={{ latitude: pet.lat, longitude: pet.lng }} />
          {sightings.map((s) => (
            <Marker
              key={s.id}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              pinColor={colors.sun}
              title="Visto por acá"
              description={s.nota ?? undefined}
            />
          ))}
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

        {esMio && (
          <Button
            title="Crear afiche"
            variant="secondary"
            icon="print"
            loading={generandoAfiche}
            onPress={crearAfiche}
            style={styles.shareButton}
          />
        )}

        <View style={styles.sightingsSection}>
          <View style={styles.matchesHeader}>
            <Ionicons name="paw" size={18} color={colors.brand} />
            <Title size={17} style={styles.matchesTitle}>
              Visto por acá
            </Title>
          </View>
          <AppText muted size={13} style={styles.matchesSubtitle}>
            {resumenAvistamientos ?? 'Todavía nadie reportó haberlo visto. Si lo viste, marca el punto en el mapa.'}
          </AppText>

          <Button
            title="Lo vi por acá"
            icon="location"
            onPress={reportarAvistamiento}
            style={styles.sightingButton}
          />

          {rastro.length > 0 ? (
            <View style={styles.sightingsList}>
              {rastro.map((s) => (
                <Card key={s.id} style={styles.sightingCard}>
                  <View style={styles.sightingRow}>
                    <Ionicons name="pin" size={16} color={colors.sun} style={styles.sightingIcon} />
                    <View style={styles.sightingBody}>
                      {s.nota ? (
                        <AppText size={14} style={styles.sightingNote}>
                          {s.nota}
                        </AppText>
                      ) : (
                        <AppText size={14} muted style={styles.sightingNote}>
                          Sin nota
                        </AppText>
                      )}
                      <AppText muted size={12} style={styles.sightingMeta}>
                        {distanceLabel(sightingDistanceKm(origen, s))} del reporte · {timeAgo(s.creado_en)}
                      </AppText>
                    </View>
                  </View>
                  {s.foto ? <Image source={{ uri: s.foto }} style={styles.sightingPhoto} /> : null}
                </Card>
              ))}
            </View>
          ) : null}
        </View>

        {matches.length > 0 && (
          <View style={styles.matchesSection}>
            <View style={styles.matchesHeader}>
              <Ionicons name="sparkles" size={18} color={colors.brand} />
              <Title size={17} style={styles.matchesTitle}>
                Posibles coincidencias
              </Title>
            </View>
            <AppText muted size={13} style={styles.matchesSubtitle}>
              {pet.estado === 'perdida'
                ? 'Mascotas encontradas cerca que podrían ser la tuya.'
                : 'Personas que buscan una mascota parecida por la zona.'}
            </AppText>
            <View style={styles.matchesList}>
              {matches.map((m) => (
                <PetCard
                  key={m.pet.id}
                  pet={m.pet}
                  distanceKm={m.distanceKm}
                  onPress={() => navigation.push('PetDetail', { id: m.pet.id })}
                />
              ))}
            </View>
          </View>
        )}

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

        {generandoAfiche && perfil && (
          <AficheGenerator pet={pet} profile={perfil} onDone={onAficheDone} onError={onAficheError} />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  title: {
    flexShrink: 1,
  },
  meta: {
    marginTop: 2,
  },
  descriptionCard: {
    marginTop: spacing.xs,
  },
  descriptionText: {
    lineHeight: 22,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.sun,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rewardIcon: {
    marginRight: spacing.xs,
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
    marginTop: spacing.md,
  },
  sightingsSection: {
    marginTop: spacing.lg,
  },
  sightingButton: {
    marginTop: spacing.md,
  },
  sightingsList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sightingCard: {
    gap: spacing.sm,
  },
  sightingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sightingIcon: {
    marginTop: 2,
    marginRight: spacing.sm,
  },
  sightingBody: {
    flex: 1,
  },
  sightingNote: {
    lineHeight: 20,
  },
  sightingMeta: {
    marginTop: 2,
  },
  sightingPhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
  },
  matchesSection: {
    marginTop: spacing.lg,
  },
  matchesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  matchesTitle: {
    flexShrink: 1,
  },
  matchesSubtitle: {
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  matchesList: {
    gap: spacing.md,
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

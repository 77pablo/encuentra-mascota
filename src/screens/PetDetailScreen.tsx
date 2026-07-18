import React, { useCallback, useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from '../components/PlatformMap';
import { getPet, listActivePets, Pet } from '../services/pets';
import { markReunited } from '../services/reunions';
import { denunciarPet } from '../services/moderation';
import { useAuth } from '../hooks/useAuth';
import { shareReport } from '../lib/share';
import { findMatches, PetMatch } from '../lib/matches';
import { listSightings, Sighting } from '../services/sightings';
import { addUpdate, listUpdates, PetUpdate } from '../services/petUpdates';
import { sortByRecency, sightingDistanceKm, summaryLabel } from '../lib/sightings';
import { distanceLabel } from '../lib/geo';
import { isReunited, reunionLabel } from '../lib/reunion';
import { timeAgo } from '../lib/time';
import { notify } from '../lib/notify';
import { pickFromLibrary } from '../lib/pickImage';
import { uploadPetPhoto } from '../services/storage';
import PetCard from '../components/PetCard';
import AficheGenerator from '../components/AficheGenerator';
import { faltaWhatsapp } from '../lib/afiche';
import { getMyProfile, Profile } from '../services/profile';
import { AppText, Badge, Button, Card, Confetti, ErrorState, Input, Loading, Screen, Title } from '../ui';
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
  // Novedades del dueño (bitácora del reporte)
  const [novedades, setNovedades] = useState<PetUpdate[]>([]);
  const [nuevaNovedad, setNuevaNovedad] = useState('');
  const [publicandoNovedad, setPublicandoNovedad] = useState(false);
  const [perfil, setPerfil] = useState<Profile | null>(null);
  const [generandoAfiche, setGenerandoAfiche] = useState(false);
  // Flujo "¡Volvió a casa!" (final feliz)
  const [mostrarReunion, setMostrarReunion] = useState(false);
  const [notaFeliz, setNotaFeliz] = useState('');
  const [fotoFeliz, setFotoFeliz] = useState<string | null>(null);
  const [guardandoReunion, setGuardandoReunion] = useState(false);
  const [mostrarConfetti, setMostrarConfetti] = useState(false);

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

  // Carga la bitácora de novedades del dueño. Se refresca al recuperar el foco,
  // igual que los avistamientos. Silencioso: si falla, dejamos la lista vacía.
  const cargarNovedades = useCallback(() => {
    listUpdates(id)
      .then(setNovedades)
      .catch(() => setNovedades([]));
  }, [id]);

  useEffect(() => {
    cargarNovedades();
    const off = navigation.addListener('focus', cargarNovedades);
    return off;
  }, [navigation, cargarNovedades]);

  const publicarNovedad = async () => {
    if (!user) return;
    const texto = nuevaNovedad.trim();
    if (!texto) return;
    setPublicandoNovedad(true);
    try {
      await addUpdate(id, user.id, texto);
      setNuevaNovedad('');
      cargarNovedades();
    } catch (e: any) {
      notify('No se pudo publicar', e?.message ?? 'Intentá de nuevo en un momento.');
    } finally {
      setPublicandoNovedad(false);
    }
  };

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

  const reunida = isReunited(pet);
  const nombreMostrar = pet.nombre || especieLabel[pet.especie];

  const elegirFotoFeliz = async () => {
    try {
      const uris = await pickFromLibrary(1);
      if (uris[0]) setFotoFeliz(uris[0]);
    } catch (e: any) {
      notify('No se pudo abrir la galería', e?.message ?? 'Intentá de nuevo.');
    }
  };

  const confirmarReunion = async () => {
    if (!pet) return;
    setGuardandoReunion(true);
    try {
      let fotoUrl: string | null = null;
      if (fotoFeliz && user) {
        fotoUrl = await uploadPetPhoto(fotoFeliz, user.id);
      }
      const nota = notaFeliz.trim() || null;
      await markReunited(pet.id, { nota, foto: fotoUrl });
      // Reflejamos el cambio en pantalla sin volver a pedir a la base.
      setPet({ ...pet, activo: false, reunida_en: new Date().toISOString(), final_feliz: nota, final_foto: fotoUrl });
      setMostrarReunion(false);
      setMostrarConfetti(true);
    } catch (e: any) {
      notify('No se pudo guardar', e?.message ?? 'Intentá de nuevo en un momento.');
    } finally {
      setGuardandoReunion(false);
    }
  };

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

        {reunida ? (
          <Card style={styles.finalCard}>
            <View style={styles.finalBadge}>
              <Ionicons name="heart" size={13} color={colors.white} />
              <AppText weight="bold" color={colors.white} size={11} style={styles.finalBadgeLabel}>
                FINAL FELIZ
              </AppText>
            </View>
            <Title size={18} style={styles.finalTitle}>
              ¡Qué alegría! {nombreMostrar} volvió a casa
            </Title>
            {reunionLabel(pet) ? (
              <AppText muted size={13} style={styles.finalSub}>
                {reunionLabel(pet)}
              </AppText>
            ) : null}
            {pet.final_feliz ? (
              <AppText size={15} style={styles.finalNota}>
                “{pet.final_feliz}”
              </AppText>
            ) : null}
            {pet.final_foto ? (
              <Image source={{ uri: pet.final_foto }} style={styles.finalFoto} />
            ) : null}
          </Card>
        ) : (
          <>
            {!esMio && (
              <Button
                title="Contactar"
                icon="chatbubble-ellipses"
                onPress={() => navigation.navigate('Chat', { petId: pet.id, otherUserId: pet.user_id })}
                style={styles.contactButton}
              />
            )}

            {esMio && (
              <Button
                title="¡Volvió a casa!"
                icon="heart"
                onPress={() => setMostrarReunion((v) => !v)}
                style={styles.contactButton}
              />
            )}

            {esMio && mostrarReunion && (
              <Card style={styles.reunionPanel}>
                <View style={styles.reunionHeader}>
                  <Ionicons name="home" size={18} color={colors.brand} />
                  <Title size={16} style={styles.reunionHeaderTitle}>
                    ¿{nombreMostrar} ya está en casa?
                  </Title>
                </View>
                <AppText muted size={13} style={styles.reunionText}>
                  Qué buena noticia. Si querés, dejá un mensajito y una foto del reencuentro para cerrar con un final feliz.
                </AppText>
                <Input
                  label="Tu mensaje (opcional)"
                  value={notaFeliz}
                  onChangeText={setNotaFeliz}
                  placeholder="Apareció sana y salva a tres cuadras…"
                  multiline
                />
                {fotoFeliz ? (
                  <Image source={{ uri: fotoFeliz }} style={styles.reunionPreview} />
                ) : null}
                <Button
                  title={fotoFeliz ? 'Cambiar foto' : 'Agregar foto (opcional)'}
                  variant="secondary"
                  icon="camera"
                  onPress={elegirFotoFeliz}
                  style={styles.reunionAction}
                />
                <Button
                  title="Confirmar reencuentro"
                  icon="heart"
                  loading={guardandoReunion}
                  onPress={confirmarReunion}
                  style={styles.reunionAction}
                />
                <Button
                  title="Ahora no"
                  variant="ghost"
                  disabled={guardandoReunion}
                  onPress={() => setMostrarReunion(false)}
                />
              </Card>
            )}

          </>
        )}

        {/* Compartir y afiche están SIEMPRE disponibles, también en un final
            feliz: un reencuentro es justo lo que más ganas dan de compartir. */}
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
            {resumenAvistamientos ??
              (reunida
                ? 'No quedaron avistamientos registrados.'
                : 'Todavía nadie reportó haberlo visto. Si lo viste, marca el punto en el mapa.')}
          </AppText>

          {/* No se aceptan avistamientos nuevos en un reporte ya reunido; el
              rastro se mantiene como historia del reencuentro. */}
          {!reunida && (
            <Button
              title="Lo vi por acá"
              icon="location"
              onPress={reportarAvistamiento}
              style={styles.sightingButton}
            />
          )}

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

        <View style={styles.novedadesSection}>
          <View style={styles.matchesHeader}>
            <Ionicons name="megaphone" size={18} color={colors.brand} />
            <Title size={17} style={styles.matchesTitle}>
              Novedades
            </Title>
          </View>
          <AppText muted size={13} style={styles.matchesSubtitle}>
            {esMio
              ? 'Contá cómo va la búsqueda. Cada novedad avisa al barrio que el reporte sigue vivo.'
              : 'Lo que el dueño va contando sobre la búsqueda.'}
          </AppText>

          {esMio && (
            <>
              <Input
                value={nuevaNovedad}
                onChangeText={setNuevaNovedad}
                placeholder="Sigo buscando por el sector… gracias a todos."
                multiline
              />
              <Button
                title="Publicar novedad"
                icon="send"
                loading={publicandoNovedad}
                disabled={!nuevaNovedad.trim()}
                onPress={publicarNovedad}
                style={styles.novedadButton}
              />
            </>
          )}

          {novedades.length > 0 ? (
            <View style={styles.novedadesList}>
              {novedades.map((n) => (
                <Card key={n.id} style={styles.novedadCard}>
                  <AppText size={14} style={styles.novedadTexto}>
                    {n.texto}
                  </AppText>
                  <AppText muted size={12} style={styles.novedadMeta}>
                    {timeAgo(n.creado_en)}
                  </AppText>
                </Card>
              ))}
            </View>
          ) : (
            <AppText muted size={13} style={styles.novedadesVacio}>
              El dueño todavía no publicó novedades.
            </AppText>
          )}
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
      <Confetti visible={mostrarConfetti} onDone={() => setMostrarConfetti(false)} />
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
  finalCard: {
    marginTop: spacing.md,
    backgroundColor: colors.sky,
    gap: spacing.xs,
  },
  finalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors.found,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  finalBadgeLabel: {
    letterSpacing: 0.5,
  },
  finalTitle: {
    marginTop: spacing.sm,
    lineHeight: 24,
  },
  finalSub: {
    marginTop: 2,
  },
  finalNota: {
    marginTop: spacing.sm,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  finalFoto: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  reunionPanel: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  reunionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reunionHeaderTitle: {
    flexShrink: 1,
  },
  reunionText: {
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  reunionPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
  },
  reunionAction: {
    marginTop: spacing.xs,
  },
  novedadesSection: {
    marginTop: spacing.lg,
  },
  novedadButton: {
    marginTop: spacing.sm,
  },
  novedadesList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  novedadCard: {
    gap: spacing.xs,
  },
  novedadTexto: {
    lineHeight: 20,
  },
  novedadMeta: {
    marginTop: 2,
  },
  novedadesVacio: {
    marginTop: spacing.sm,
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

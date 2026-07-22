import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { countReunidas, Pet } from '../services/pets';
import { buscarReportes, contarReportesEnComuna } from '../services/busqueda';
import { listFinalesFelices } from '../services/reunions';
import { getMyProfile } from '../services/profile';
import { comunaDeCoords } from '../lib/comunas';
import { useMyLocation } from '../hooks/useMyLocation';
import { useAuth } from '../hooks/useAuth';
import { useFavorites } from '../hooks/useFavorites';
import { distanceKm as getDistanceKm, distanceLabel } from '../lib/geo';
import { reunionLabel } from '../lib/reunion';
import { timeAgo } from '../lib/time';
import { AppText, Badge, Button, Card, Chip, ErrorState, Loading, Mascota, Screen, Title } from '../ui';
import { ZoneAlertBanner } from '../components/ZoneAlertBanner';
import MensajesButton from '../components/MensajesButton';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const RECIENTES_LIMIT = 4;

const CHIPS = ['Cerca de ti', 'Perros', 'Gatos', 'Perdidos'];

export default function HomeScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [reunidas, setReunidas] = useState(0);
  const [finales, setFinales] = useState<Pet[]>([]);
  const [nombrePerfil, setNombrePerfil] = useState<string | null>(null);
  const [comunaInicio, setComunaInicio] = useState<string | null>(null);
  const [comunaCount, setComunaCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useMyLocation(true);
  const { user } = useAuth();
  const { isFavorite, toggle } = useFavorites();

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    // La tira de "finales felices" es decorativa: si su consulta falla (p. ej.
    // la migración 0008 aún no está aplicada), degradamos a [] en vez de tumbar
    // toda la pantalla de Inicio.
    // Inicio solo muestra una tira corta: pedimos 6, no la base entera.
    // El nombre del perfil es para el saludo: si falla, degrada a null (usamos
    // el metadata o el correo) sin tumbar Inicio.
    Promise.all([
      buscarReportes({}, null, 6).then((p) => p.reportes as Pet[]),
      countReunidas(),
      listFinalesFelices(6).catch(() => [] as Pet[]),
      user ? getMyProfile(user.id).catch(() => null) : Promise.resolve(null),
    ])
      .then(([activePets, count, finalesFelices, perfil]) => {
        setPets(activePets);
        setReunidas(count);
        setFinales(finalesFelices);
        setNombrePerfil(perfil?.nombre?.trim() || null);
      })
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useFocusEffect(cargar);

  // Comuna del usuario (de su ubicación) + cuántos reportes activos tiene, para
  // la sección "En tu comuna" que lleva a la pestaña Comunidad. Degrada en
  // silencio si falla (p. ej. migración 0021 sin aplicar).
  useEffect(() => {
    if (!location.coords) return;
    const c = comunaDeCoords(location.coords.lat, location.coords.lng);
    if (!c) return;
    setComunaInicio(c.nombre);
    contarReportesEnComuna(c.nombre)
      .then(setComunaCount)
      .catch(() => setComunaCount(null));
  }, [location.coords]);

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

  // El saludo usa el nombre real del perfil; si no está, cae al nombre del
  // registro (metadata) y, como último recurso, a la parte local del correo.
  const displayName =
    nombrePerfil ||
    (user?.user_metadata?.nombre as string | undefined)?.trim() ||
    (user?.email ? user.email.split('@')[0] : '');
  const greetingName = displayName
    ? displayName.charAt(0).toUpperCase() + displayName.slice(1)
    : '';
  const avatarLetter = displayName ? displayName.charAt(0).toUpperCase() : '?';
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
            <MensajesButton />
            <View style={styles.avatar}>
              {user ? (
                <AppText weight="bold" color={colors.white} size={15}>
                  {avatarLetter}
                </AppText>
              ) : (
                // Invitado: un ícono de línea en vez de una inicial inventada.
                <Ionicons name="person-outline" size={17} color={colors.white} />
              )}
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

        {/* Entradas a las guías "recién se me perdió" / "encontré una
            mascota" (func. 4). Sección propia y autocontenida para mergear
            sin choque con el nudge de vigencia. */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('GuiaPerdida')}>
          <Card style={styles.guiaCard}>
            <Ionicons name="footsteps" size={20} color={colors.brand} />
            <View style={styles.guiaTextWrap}>
              <AppText weight="bold" size={14}>
                ¿Se te perdió tu mascota?
              </AppText>
              <AppText muted size={12}>
                Guía calmada de qué hacer en la primera hora
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Card>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('GuiaEncontrada')}>
          <Card style={styles.guiaCard}>
            <Ionicons name="heart-circle-outline" size={20} color={colors.found} />
            <View style={styles.guiaTextWrap}>
              <AppText weight="bold" size={14}>
                ¿Te encontraste una mascota?
              </AppText>
              <AppText muted size={12}>
                Guía de qué hacer para que vuelva con su familia
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Card>
        </TouchableOpacity>

        {/* En tu comuna → pestaña Comunidad */}
        {comunaInicio && comunaCount !== null && comunaCount > 0 ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Explorar', { comuna: comunaInicio })}
          >
            <Card style={styles.comunaCard}>
              <Ionicons name="business" size={20} color={colors.brand} />
              <View style={styles.comunaTextWrap}>
                <AppText weight="bold" size={14}>
                  En {comunaInicio}
                </AppText>
                <AppText muted size={12}>
                  {comunaCount} {comunaCount === 1 ? 'reporte activo' : 'reportes activos'} · ver comunidad
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Card>
          </TouchableOpacity>
        ) : null}

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
              onPress={() => navigation.navigate('Explorar')}
              style={i > 0 ? styles.chipSpacing : undefined}
            />
          ))}
        </ScrollView>

        {reunidas > 0 ? (
          <AppText muted size={13} style={styles.reunidasLine}>
            Ya van {reunidas} vuelta{reunidas === 1 ? '' : 's'} a casa 🎉
          </AppText>
        ) : null}

        <ZoneAlertBanner pets={pets} onPress={() => navigation.navigate('Explorar')} />

        {/* Tira de finales felices */}
        {finales.length > 0 ? (
          <View style={styles.finalesSection}>
            <View style={styles.finalesHeader}>
              <View style={styles.finalesHeaderLeft}>
                <Ionicons name="heart" size={16} color={colors.found} />
                <Title size={17} style={styles.finalesTitle}>
                  Finales felices
                </Title>
              </View>
              <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('VolvieronACasa')}>
                <AppText weight="semi" color={colors.brand} size={13}>
                  Ver todas
                </AppText>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.finalesRow}
            >
              {finales.map((p) => {
                const foto = p.final_foto || p.fotos[0];
                return (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.85}
                    style={styles.finalCard}
                    onPress={() => navigation.navigate('PetDetail', { id: p.id })}
                  >
                    {foto ? (
                      <Image source={{ uri: foto }} style={styles.finalPhoto} />
                    ) : (
                      <View style={[styles.finalPhoto, styles.finalPhotoPlaceholder]}>
                        <Ionicons name="heart" size={22} color={colors.found} />
                      </View>
                    )}
                    <AppText weight="bold" size={13} numberOfLines={1} style={styles.finalName}>
                      {p.nombre || especieLabel[p.especie]}
                    </AppText>
                    <AppText muted size={11} numberOfLines={1}>
                      {reunionLabel(p) || 'Volvió a casa'}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Sección "cerca de ti" */}
        <View style={styles.sectionHeader}>
          <Title size={17}>Cerca de ti</Title>
          <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Explorar')}>
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
                      toggle(pet.id);
                    }}
                  >
                    <Ionicons
                      name={isFavorite(pet.id) ? 'heart' : 'heart-outline'}
                      size={20}
                      color={isFavorite(pet.id) ? colors.lost : colors.muted}
                    />
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

const crearEstilos = (colors: Colors) => StyleSheet.create({
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
    maxWidth: 120,
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
  comunaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.sky,
  },
  guiaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  guiaTextWrap: {
    flex: 1,
    gap: 2,
  },
  comunaTextWrap: {
    flex: 1,
    gap: 2,
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
  finalesSection: {
    marginTop: spacing.xs,
  },
  finalesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  finalesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  finalesTitle: {
    flexShrink: 1,
  },
  finalesRow: {
    paddingRight: spacing.xl,
    gap: spacing.md,
  },
  finalCard: {
    width: 130,
  },
  finalPhoto: {
    width: 130,
    height: 100,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  finalPhotoPlaceholder: {
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalName: {
    marginTop: 2,
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

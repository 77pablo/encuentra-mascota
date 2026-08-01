import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { countReunidas, Pet } from '../services/pets';
import { buscarReportes, contarReportesEnComuna, type FiltrosBusqueda } from '../services/busqueda';
import { listFinalesFelices } from '../services/reunions';
import { getMyProfile } from '../services/profile';
import { getImpacto, Impacto } from '../services/impacto';
import { comunaDeCoords } from '../lib/comunas';
import { useMyLocation } from '../hooks/useMyLocation';
import { useAuth } from '../hooks/useAuth';
import { useFavorites } from '../hooks/useFavorites';
import { distanceKm as getDistanceKm, distanceLabel } from '../lib/geo';
import { reunionLabel } from '../lib/reunion';
import { timeAgo } from '../lib/time';
import { AppText, Badge, Button, Card, Chip, ErrorState, Loading, Mascota, Screen, Title } from '../ui';
import { ZoneAlertBanner } from '../components/ZoneAlertBanner';
import { RecordatoriosBanner } from '../components/RecordatoriosBanner';
import { BannerVigencia } from '../components/BannerVigencia';
import { InstalarAppCard } from '../components/InstalarAppCard';
import MensajesButton from '../components/MensajesButton';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const RECIENTES_LIMIT = 4;

// Radio de la tira de Inicio. Un título que dice "Cerca de ti" tiene que poder
// sostenerlo: sin radio, el servidor ordena por distancia pero igual devuelve el
// reporte más cercano aunque esté a 800 km. Con radio, o hay algo cerca de
// verdad o la sección dice honestamente que todavía no hay nada.
const RADIO_INICIO_KM = 25;

// Parámetros con los que un acceso de Inicio llega a Explorar. Los lee
// `filtrosDesdeRuta` (src/lib/petFilters).
export interface AccesoInicio {
  label: string;
  params: {
    comuna?: string;
    especie?: 'perro' | 'gato' | 'otro';
    estado?: 'perdida' | 'encontrada';
    cerca?: boolean;
  };
}

// Los cuatro accesos rápidos de arriba. Hasta la tanda 9 eran cuatro etiquetas
// sueltas que hacían `navigate('Explorar')` sin parámetros: decoración con
// forma de control. Ahora cada uno viaja con el filtro que promete su etiqueta.
// Se exportan para que un test pueda cruzarlos con el lector de la ruta y
// detectar un acceso que navegue vacío.
export const ACCESOS_INICIO: AccesoInicio[] = [
  { label: 'Cerca de ti', params: { cerca: true } },
  { label: 'Perros', params: { especie: 'perro' } },
  { label: 'Gatos', params: { especie: 'gato' } },
  { label: 'Perdidos', params: { estado: 'perdida' } },
];

export default function HomeScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [reunidas, setReunidas] = useState(0);
  const [finales, setFinales] = useState<Pet[]>([]);
  const [impacto, setImpacto] = useState<Impacto | null>(null);
  const [nombrePerfil, setNombrePerfil] = useState<string | null>(null);
  const [comunaInicio, setComunaInicio] = useState<string | null>(null);
  const [comunaCount, setComunaCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useMyLocation(true);
  const { user } = useAuth();
  const { isFavorite, toggle } = useFavorites();

  // El punto desde el que se pide la tira. Si no lo hay, la consulta va sin
  // referencia y la sección NO puede titularse "Cerca de ti" (ver más abajo).
  const coords = location.coords;

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    // La tira de "finales felices" es decorativa: si su consulta falla (p. ej.
    // la migración 0008 aún no está aplicada), degradamos a [] en vez de tumbar
    // toda la pantalla de Inicio.
    // Inicio solo muestra una tira corta: pedimos 6, no la base entera.
    // El nombre del perfil es para el saludo: si falla, degrada a null (usamos
    // el metadata o el correo) sin tumbar Inicio.
    //
    // Con ubicación la consulta lleva el punto y el radio: hasta la tanda 9
    // esto era `buscarReportes({}, ...)` —todo Chile por fecha— debajo de un
    // título que decía "Cerca de ti". Alguien en Punta Arenas veía Arica.
    const filtrosTira: FiltrosBusqueda = coords
      ? { lat: coords.lat, lng: coords.lng, radioKm: RADIO_INICIO_KM, orden: 'cerca' }
      : {};
    Promise.all([
      buscarReportes(filtrosTira, null, 6).then((p) => p.reportes as Pet[]),
      countReunidas(),
      listFinalesFelices(6).catch(() => [] as Pet[]),
      user ? getMyProfile(user.id).catch(() => null) : Promise.resolve(null),
      // Tarjeta de impacto: agregados globales, decorativa. Si la RPC 0039
      // aún no está aplicada o falla por lo que sea, se oculta sola.
      getImpacto().catch(() => null),
    ])
      .then(([activePets, count, finalesFelices, perfil, impactoData]) => {
        setPets(activePets);
        setReunidas(count);
        setFinales(finalesFelices);
        setNombrePerfil(perfil?.nombre?.trim() || null);
        setImpacto(impactoData);
      })
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [user, coords]);

  useFocusEffect(cargar);

  // Ir a Explorar con un filtro puesto. La forma anidada (`{ screen, params }`)
  // no es un adorno: "Explorar" es una PESTAÑA que adentro tiene su propio
  // stack, y los parámetros sueltos se quedan en el navigator sin llegar nunca
  // a la pantalla que los tiene que leer.
  const irAExplorar = useCallback(
    (params?: AccesoInicio['params']) => {
      navigation.navigate('Explorar', params ? { screen: 'Explorar', params } : undefined);
    },
    [navigation],
  );

  // `useMyLocation(true)` ya lo pidió al montar; esto es para volver a intentar
  // después de un "ahora no" (o de un permiso que el navegador dejó pendiente).
  const pedirUbicacion = useCallback(() => {
    location.request();
  }, [location]);

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
  const hasImpacto =
    !!impacto &&
    (impacto.reencuentros > 0 || impacto.buscando > 0 || impacto.adopciones > 0 || impacto.aportes > 0);

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

        {/* Tarjeta de instalar la PWA: web-only, descartable con ✕ (recuerda
            la elección) y se oculta sola si ya está instalada. */}
        <InstalarAppCard variante="tarjeta" />

        {/* Banner de recordatorios del carnet "Mi mascota" (Función 6): solo
            aparece con sesión y si alguna dosis vence pronto o ya venció.
            Degrada en silencio si `my_pets` falla (ver RecordatoriosBanner). */}
        {user ? (
          <RecordatoriosBanner onPress={() => navigation.navigate('Perfil', { screen: 'MyPets' })} />
        ) : null}

        {/* Vigencia del reporte: aviso in-app de que alguno propio está por
            vencer (30+ días) o ya salió de las búsquedas (45+). Va acá, en
            Inicio, porque hasta ahora había que ABRIR la ficha del reporte para
            enterarse, y a los 45 días el reporte se apagaba en silencio.
            Lleva a "Mis reportes activos", que es donde está el botón de
            reactivar. Degrada en silencio (ver BannerVigencia). */}
        {user ? <BannerVigencia onPress={() => navigation.navigate('Perfil')} /> : null}

        {/* En tu comuna → pestaña Comunidad */}
        {comunaInicio && comunaCount !== null && comunaCount > 0 ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => irAExplorar({ comuna: comunaInicio })}
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
          {ACCESOS_INICIO.map((acceso, i) => (
            <Chip
              key={acceso.label}
              label={acceso.label}
              // El activo describe lo que se está viendo abajo; ya no es "el
              // primero" por costumbre. Sin ubicación, la tira NO es cercana a
              // nadie, así que ninguno queda encendido.
              active={acceso.params.cerca === true && hasCoords}
              onPress={() => irAExplorar(acceso.params)}
              style={i > 0 ? styles.chipSpacing : undefined}
            />
          ))}
        </ScrollView>

        {reunidas > 0 ? (
          <AppText muted size={13} style={styles.reunidasLine}>
            Ya van {reunidas} vuelta{reunidas === 1 ? '' : 's'} a casa 🎉
          </AppText>
        ) : null}

        <ZoneAlertBanner pets={pets} onPress={() => irAExplorar()} />

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

        {/* Tarjeta de impacto de la comunidad: agregados globales, sin datos
            personales, visible para invitado y autenticado. Solo aparece si
            hay algo que mostrar (algún número > 0). */}
        {hasImpacto ? (
          <Card style={styles.impactoCard}>
            <Title size={16}>Lo que logramos juntos</Title>
            <View style={styles.impactoGrid}>
              <View style={styles.impactoItem}>
                <Ionicons name="heart" size={18} color={colors.found} />
                <AppText weight="bold" size={20} style={styles.impactoNumero}>
                  {impacto!.reencuentros}
                </AppText>
                <AppText muted size={12}>
                  reencuentros
                </AppText>
              </View>
              {/* `buscando` cuenta SOLO los reportes de mascotas perdidas
                  (mig. 0044). Hasta la 0039 sumaba también las "encontradas"
                  —mascotas que alguien HALLÓ, que no las busca nadie— y el
                  número contradecía esta etiqueta. Si se cambia el texto, hay
                  que cambiar el filtro de la RPC con él. */}
              <View style={styles.impactoItem}>
                <Ionicons name="paw" size={18} color={colors.brand} />
                <AppText weight="bold" size={20} style={styles.impactoNumero}>
                  {impacto!.buscando}
                </AppText>
                <AppText muted size={12}>
                  mascotas buscando
                </AppText>
              </View>
              <View style={styles.impactoItem}>
                <Ionicons name="home-outline" size={18} color={colors.found} />
                <AppText weight="bold" size={20} style={styles.impactoNumero}>
                  {impacto!.adopciones}
                </AppText>
                <AppText muted size={12}>
                  encontraron familia
                </AppText>
              </View>
              <View style={styles.impactoItem}>
                <Ionicons name="people-outline" size={18} color={colors.brand} />
                <AppText weight="bold" size={20} style={styles.impactoNumero}>
                  {impacto!.aportes}
                </AppText>
                <AppText muted size={12}>
                  aportes de vecinos
                </AppText>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Tira de reportes. El título depende de si de verdad sabemos dónde
            está la persona: prometer cercanía sin ubicación era la mentira más
            visible de la app, porque la ve todo el mundo al entrar. */}
        <View style={styles.sectionHeader}>
          <Title size={17}>{hasCoords ? 'Cerca de ti' : 'Lo último publicado'}</Title>
          <TouchableOpacity activeOpacity={0.7} onPress={() => irAExplorar()}>
            <AppText weight="semi" color={colors.brand} size={13}>
              Ver todo
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Sin ubicación no escondemos la sección: ofrecemos activarla, que es
            lo único que convierte esa tira en algo realmente cercano. */}
        {!hasCoords ? (
          <Card style={styles.ubicacionCard}>
            <AppText size={13} muted>
              Si nos dejás ver tu ubicación, acá te mostramos lo que está pasando a tu
              alrededor en vez de todo Chile.
            </AppText>
            <Button
              title="Usar mi ubicación"
              variant="secondary"
              icon="navigate"
              loading={location.status === 'loading'}
              onPress={pedirUbicacion}
              style={styles.ubicacionBoton}
            />
          </Card>
        ) : null}

        {recientes.length === 0 ? (
          <AppText muted style={styles.emptyRecientes}>
            {hasCoords
              ? `Todavía no hay reportes a menos de ${RADIO_INICIO_KM} km tuyo. Ojalá siga así.`
              : 'Todavía no hay reportes publicados. Si viste algo, contale al barrio.'}
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
  ubicacionCard: {
    gap: spacing.sm,
    backgroundColor: colors.sky,
  },
  ubicacionBoton: {
    marginTop: spacing.xs,
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
  impactoCard: {
    gap: spacing.md,
  },
  impactoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  impactoItem: {
    width: '50%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
  },
  impactoNumero: {
    marginTop: 2,
  },
});

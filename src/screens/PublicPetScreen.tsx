import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import MapView, { Marker } from '../components/PlatformMap';
import { getPet, Pet } from '../services/pets';
import { avisarSinCuenta } from '../services/avisoAnonimo';
import { useAuth } from '../hooks/useAuth';
import { notify } from '../lib/notify';
import { shareReport } from '../lib/share';
import { timeAgo } from '../lib/time';
import { ETIQUETA_RECOMPENSA, tieneRecompensa } from '../lib/recompensa';
import { AppText, AvisoEstafa, Badge, Button, Card, ErrorState, Input, Loading, Screen, Title } from '../ui';
import { Colors, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Vista pública y de solo lectura de un reporte, accesible por link
// compartido incluso sin haber iniciado sesión. No permite denunciar; en vez
// de "Contactar" invita a iniciar sesión (o lleva al chat si ya hay sesión).
export default function PublicPetScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const id: string | undefined = route?.params?.id;
  const { user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  // "Lo vi acá": el aviso que puede dejar alguien SIN CUENTA (migración 0050).
  const [nota, setNota] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avisado, setAvisado] = useState(false);
  const [errorAviso, setErrorAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!id) {
      setError('No se encontró el reporte.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getPet(id)
      .then(setPet)
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
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

  const irAContactar = () => {
    if (user) {
      // Ya hay sesión: llevar al flujo normal de contacto (chat).
      //
      // Esta pantalla vive en el stack RAÍZ (link público `mascota/:id`, que es
      // lo que abre el QR de un afiche y todo push de reporte), y ahí NO existe
      // `Chat`: hay que direccionar de forma anidada y ABSOLUTA hasta el `Chat`
      // que vive dentro del stack de una pestaña.
      //
      // La pestaña es `Explorar`, que desde julio absorbió a Mapa/Lista/
      // Comunidad. Durante meses acá decía `'Mapa'`, una pestaña que ya no
      // existe: el botón "Contactar" no hacía absolutamente nada, justo para el
      // vecino que acababa de escanear el afiche con el animal en brazos.
      navigation.navigate('App', {
        screen: 'Explorar',
        params: { screen: 'Chat', params: { petId: pet.id, otherUserId: pet.user_id } },
      });
    } else {
      // Se reemplaza (en vez de apilar) para que, tras iniciar sesión, el
      // navegador raíz no intente volver a esta pantalla pública.
      navigation.replace('Login');
    }
  };

  // La ubicación es OPCIONAL y se pide solo si la persona la ofrece. Pedir el
  // permiso de GPS al entrar, sin que nadie lo haya pedido, es la forma más
  // rápida de que cierren la pestaña.
  const usarUbicacion = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      notify('Sin permiso', 'No pasa nada: podés avisar igual, sin la ubicación.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  };

  const avisar = async () => {
    setEnviando(true);
    setErrorAviso(null);
    try {
      // El servicio difumina el punto antes de mandarlo: la coordenada exacta
      // de quien avisa (que está parado ahí) no se guarda en ninguna parte.
      await avisarSinCuenta(pet.id, { nota, lat: coords?.lat ?? null, lng: coords?.lng ?? null });
      setAvisado(true);
    } catch (e: any) {
      // Solo se agradece si de verdad salió. Decir "listo" con el aviso caído
      // manda a esa persona a su casa creyendo que la familia ya sabe.
      setErrorAviso(mensajeDeErrorDb(e));
    } finally {
      setEnviando(false);
    }
  };

  // Quién ve la tarjeta: cualquiera que NO sea el dueño, en un reporte de
  // mascota PERDIDA y todavía activo. En un "encontrada" el animal ya está con
  // alguien y quien publicó no espera avistamientos, busca a la familia.
  const puedeAvisar = !esMio && pet.estado === 'perdida' && pet.activo !== false;

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

        {/* El MONTO no se publica (PetFBI): atrae al que llama diciendo "la tengo,
            transferime", e incentiva a perseguir al animal. Ver lib/recompensa.ts. */}
        {tieneRecompensa(pet.recompensa) ? (
          <>
            <View style={styles.rewardPill}>
              <Ionicons name="sunny" size={16} color={colors.ink} style={styles.rewardIcon} />
              <AppText weight="bold" size={14} color={colors.ink}>
                {ETIQUETA_RECOMPENSA}
              </AppText>
            </View>
            <View style={styles.avisoEstafa}>
              <AvisoEstafa variante="recompensa" />
            </View>
          </>
        ) : null}

        <MapView
          style={styles.map}
          region={{ latitude: pet.lat, longitude: pet.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        >
          <Marker coordinate={{ latitude: pet.lat, longitude: pet.lng }} />
        </MapView>

        {/* AVISAR SIN CUENTA. Va ANTES del botón de contacto a propósito: quien
            llega acá desde el QR de un afiche o un link de WhatsApp está en la
            vereda con el animal al lado, y para esa persona "iniciá sesión" es
            una pared. Esto tiene que poder hacerse en veinte segundos. */}
        {puedeAvisar ? (
          avisado ? (
            <Card style={styles.avisoOkCard}>
              <View style={styles.avisoOkRow}>
                <Ionicons name="checkmark-circle" size={24} color={colors.found} />
                <AppText weight="semi" size={16} style={styles.avisoOkText}>
                  Listo, su familia ya sabe.
                </AppText>
              </View>
              <AppText muted size={13}>
                Gracias por parar. Eso hace toda la diferencia.
              </AppText>
            </Card>
          ) : (
            <Card style={styles.avisoCard}>
              <Title size={18}>¿La estás viendo?</Title>
              <AppText muted size={14} style={styles.avisoTexto}>
                Avisale a su familia. No hace falta cuenta ni dejar tus datos.
              </AppText>
              <Input
                label="Algo que ayude (opcional)"
                placeholder="Ej: está en la plaza, tranquila"
                value={nota}
                onChangeText={setNota}
                multiline
              />
              {/* NO se ofrece sumar la ubicación, y es a propósito.
                  El botón existía y pedía permiso de GPS, la RPC guardaba el
                  punto difuminado en `datos.lat/lng`… y NADIE lo lee: el mapa
                  de la ficha se pinta solo desde `sightings`, y un aviso
                  anónimo no crea fila ahí. O sea que se le pedía a un vecino un
                  permiso de ubicación para escribir una coordenada que no se
                  muestra en ningún lado, y el aviso que le llegaba al dueño
                  decía "entrá a ver dónde fue" sobre un mapa sin ningún pin
                  nuevo.
                  Mientras no haya dónde verla, no se pide. La RPC sigue
                  aceptando lat/lng para el día que exista esa superficie. */}
              {errorAviso ? (
                <AppText size={13} color={colors.lost}>
                  {errorAviso}
                </AppText>
              ) : null}
              <Button
                title="Lo vi acá"
                icon="paw"
                onPress={avisar}
                loading={enviando}
                disabled={enviando}
              />
            </Card>
          )
        ) : null}

        {!esMio && (
          <Button
            title="Inicia sesión para contactar"
            icon="chatbubble-ellipses"
            onPress={irAContactar}
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
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
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
  avisoEstafa: {
    marginTop: spacing.sm,
  },
  map: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  avisoCard: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  avisoTexto: {
    lineHeight: 20,
  },
  avisoOkCard: {
    backgroundColor: colors.sky,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  avisoOkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avisoOkText: {
    flexShrink: 1,
  },
  contactButton: {
    marginTop: spacing.md,
  },
  shareButton: {
    marginTop: spacing.sm,
  },
});

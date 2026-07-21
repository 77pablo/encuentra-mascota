import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, EmptyState, ErrorState, Loading, Screen, Title } from '../ui';
import { colors, radius, shadow, spacing } from '../theme';
import { useBusquedaAdopciones } from '../hooks/useBusquedaAdopciones';
import { AdopcionConDistancia, FiltrosAdopcion } from '../services/busquedaAdopciones';
import { Adoption } from '../services/adoptions';
import { useAdoptionSaves } from '../context/AdoptionSavesProvider';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useAuth } from '../hooks/useAuth';
import { useMyLocation } from '../hooks/useMyLocation';
import { notify } from '../lib/notify';
import { distanceLabel } from '../lib/geo';
import { timeAgo } from '../lib/time';

// El feed tipo Instagram de adopción: SOLO animales en adopción (tabla
// `adoptions`), separado a propósito de los reportes de perdida/encontrada.
// Espeja `ListScreen` en la mecánica (chips que viajan al servidor, scroll
// infinito, "cerca de mí"), pero con tarjetas grandes de foto y sin barra de
// búsqueda de texto (la RPC `buscar_adopciones` no la tiene, ver el diseño).

type EspecieFiltro = 'todas' | Adoption['especie'];
type TamanoFiltro = 'todos' | NonNullable<Adoption['tamano']>;

const especieFiltros: { key: EspecieFiltro; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

const tamanoFiltros: { key: TamanoFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'chico', label: 'Chico' },
  { key: 'mediano', label: 'Mediano' },
  { key: 'grande', label: 'Grande' },
];

const especieLabel: Record<Adoption['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const edadLabel: Record<NonNullable<Adoption['edad']>, string> = {
  cachorro: 'Cachorro',
  adulto: 'Adulto',
  senior: 'Senior',
};

const tamanoLabel: Record<NonNullable<Adoption['tamano']>, string> = {
  chico: 'Chico',
  mediano: 'Mediano',
  grande: 'Grande',
};

// "Se lleva bien con niños, perros y gatos" — solo con los tri-estados en
// 'si'; si no hay ninguno, no se muestra el renglón (todos estos campos son
// opcionales en la 0030).
function convivenciaLabel(a: AdopcionConDistancia): string | null {
  const partes: string[] = [];
  if (a.convive_ninos === 'si') partes.push('niños');
  if (a.convive_perros === 'si') partes.push('perros');
  if (a.convive_gatos === 'si') partes.push('gatos');
  if (partes.length === 0) return null;
  if (partes.length === 1) return `Se lleva bien con ${partes[0]}`;
  const ultima = partes[partes.length - 1];
  const resto = partes.slice(0, -1).join(', ');
  return `Se lleva bien con ${resto} y ${ultima}`;
}

function AdoptionCard({
  adoption,
  onPress,
  onContact,
}: {
  adoption: AdopcionConDistancia;
  onPress: () => void;
  onContact: () => void;
}) {
  const { user } = useAuth();
  const { estaGuardada, alternar } = useAdoptionSaves();
  const requireAuth = useRequireAuth();
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const esMia = adoption.user_id === user?.id;
  const guardada = estaGuardada(adoption.id);
  const convivencia = convivenciaLabel(adoption);

  const onCarouselLayout = (e: LayoutChangeEvent) => setCarouselWidth(e.nativeEvent.layout.width);
  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth) return;
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / carouselWidth));
  };

  const metaPartes = [especieLabel[adoption.especie]];
  if (adoption.edad) metaPartes.push(edadLabel[adoption.edad]);
  if (adoption.tamano) metaPartes.push(tamanoLabel[adoption.tamano]);
  if (adoption.distancia_km != null) metaPartes.push(distanceLabel(adoption.distancia_km));
  metaPartes.push(timeAgo(adoption.creado_en));

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress}>
      <Card style={styles.card}>
        <View onLayout={onCarouselLayout} style={styles.photoWrap}>
          {adoption.fotos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onCarouselScroll}
              onMomentumScrollEnd={onCarouselScroll}
              scrollEventThrottle={16}
            >
              {adoption.fotos.map((f) => (
                <Image
                  key={f}
                  source={{ uri: f }}
                  style={[styles.photo, carouselWidth ? { width: carouselWidth } : null]}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name="paw" size={40} color={colors.muted} />
            </View>
          )}

          {adoption.fotos.length > 1 ? (
            <View style={styles.dotsRow} pointerEvents="none">
              {adoption.fotos.map((f, i) => (
                <View key={f} style={[styles.dot, i === activeIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.heartButton}
            onPress={(e) => {
              e.stopPropagation?.();
              if (!requireAuth('guardar')) return;
              alternar(adoption.id);
            }}
          >
            <Ionicons
              name={guardada ? 'heart' : 'heart-outline'}
              size={22}
              color={guardada ? colors.lost : colors.white}
            />
          </TouchableOpacity>

          {esMia ? (
            <View style={styles.ownBadge} pointerEvents="none">
              <AppText weight="bold" color={colors.white} size={11}>
                Tu publicación
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <AppText weight="bold" size={16} numberOfLines={1}>
            {adoption.nombre || especieLabel[adoption.especie]}
          </AppText>
          <AppText muted size={12} numberOfLines={1} style={styles.metaLine}>
            {metaPartes.join('  ·  ')}
          </AppText>
          {convivencia ? (
            <AppText muted size={13} numberOfLines={1} style={styles.convivenciaLine}>
              {convivencia}
            </AppText>
          ) : null}

          {!esMia ? (
            <Button
              title="Quiero conocerlo"
              variant="secondary"
              icon="chatbubble-ellipses-outline"
              onPress={(e) => {
                e.stopPropagation?.();
                onContact();
              }}
              style={styles.contactButton}
            />
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

export default function AdopcionFeedScreen({ navigation }: any) {
  const [especie, setEspecie] = useState<EspecieFiltro>('todas');
  const [tamano, setTamano] = useState<TamanoFiltro>('todos');
  const [cercaDeMi, setCercaDeMi] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const location = useMyLocation();
  const requireAuth = useRequireAuth();

  // Mismo cuidado que ListScreen: si el usuario negó el permiso mientras
  // "Cerca de mí" estaba activo, avisamos y volvemos a "Recientes".
  useEffect(() => {
    if (cercaDeMi && location.status === 'denied') {
      notify(
        'No pudimos acceder a tu ubicación',
        'Activa el permiso de ubicación para ver las mascotas más cercanas a ti.',
      );
      setCercaDeMi(false);
    }
  }, [cercaDeMi, location.status]);

  const toggleCercaDeMi = () => {
    if (cercaDeMi) {
      setCercaDeMi(false);
      return;
    }
    setCercaDeMi(true);
    location.request();
  };

  const cerca = cercaDeMi && location.coords !== null;
  const filtros: FiltrosAdopcion = useMemo(
    () => ({
      especie: especie === 'todas' ? null : especie,
      tamano: tamano === 'todos' ? null : tamano,
      lat: cerca ? location.coords!.lat : null,
      lng: cerca ? location.coords!.lng : null,
      radioKm: null,
      orden: cerca ? 'cerca' : 'recientes',
    }),
    [especie, tamano, cerca, location.coords],
  );

  const { adopciones, cargando, cargandoMas, error, hayMas, recargar, cargarMas } =
    useBusquedaAdopciones(filtros);

  // El pull-to-refresh dispara `recargar()`, que reusa el mismo `cargando` de
  // la primera página; cuando termina (con o sin error) soltamos el spinner.
  useEffect(() => {
    if (!cargando) setRefreshing(false);
  }, [cargando]);

  const onRefresh = () => {
    setRefreshing(true);
    recargar();
  };

  const irAPublicar = () => {
    if (!requireAuth('publicar')) return;
    navigation.navigate('PublicarAdopcion');
  };

  const contactar = (adoption: AdopcionConDistancia) => {
    if (!requireAuth('contactar')) return;
    navigation.navigate('Chat', { adoptionId: adoption.id, otherUserId: adoption.user_id });
  };

  const hayFiltrosPuestos = especie !== 'todas' || tamano !== 'todos' || cerca;

  if (cargando && adopciones.length === 0) {
    return <Loading label="Buscando mascotas en adopción…" />;
  }

  if (error && adopciones.length === 0) {
    return (
      <Screen padded>
        <ErrorState message={error} onRetry={recargar} />
      </Screen>
    );
  }

  return (
    <Screen padded>
      <Title size={22} style={styles.screenTitle}>
        En adopción
      </Title>
      <AppText muted size={13} style={styles.subtitle}>
        Vecinos del barrio buscándoles un hogar. Guárdalas o escríbele a quien las tiene.
      </AppText>

      <View style={styles.chipsRow}>
        {especieFiltros.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            active={especie === f.key}
            onPress={() => setEspecie(f.key)}
          />
        ))}
      </View>
      <View style={styles.chipsRow}>
        {tamanoFiltros.map((f) => (
          <Chip key={f.key} label={f.label} active={tamano === f.key} onPress={() => setTamano(f.key)} />
        ))}
      </View>
      <View style={styles.chipsRow}>
        <Chip label="Recientes" active={!cerca} onPress={() => cercaDeMi && setCercaDeMi(false)} />
        <Chip
          label={location.status === 'loading' ? 'Buscando…' : '📍 Cerca de mí'}
          active={cerca}
          onPress={toggleCercaDeMi}
        />
      </View>

      <FlatList
        data={adopciones}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={hayMas ? cargarMas : undefined}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
        ListFooterComponent={
          cargandoMas ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          hayFiltrosPuestos ? (
            <EmptyState
              illustration
              title="No encontramos nada así"
              subtitle="Prueba con otra especie, otro tamaño o mira todas."
            />
          ) : (
            <EmptyState
              illustration
              title="Todavía nadie busca hogar por acá"
              subtitle="Cuando alguien publique una mascota en adopción, va a aparecer justo aquí."
            />
          )
        }
        renderItem={({ item }) => (
          <AdoptionCard
            adoption={item}
            onPress={() => navigation.navigate('AdopcionDetail', { id: item.id })}
            onContact={() => contactar(item)}
          />
        )}
      />

      <TouchableOpacity activeOpacity={0.88} style={styles.fab} onPress={irAPublicar}>
        <Ionicons name="add" size={18} color={colors.white} />
        <AppText weight="bold" color={colors.white} size={14} style={styles.fabLabel}>
          Publicar
        </AppText>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    marginTop: spacing.sm,
  },
  subtitle: {
    marginTop: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl * 2,
    flexGrow: 1,
  },
  separator: {
    height: spacing.lg,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    height: 320,
    backgroundColor: colors.sky,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    backgroundColor: colors.white,
    width: 16,
  },
  heartButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(35,35,29,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  body: {
    padding: spacing.lg,
    gap: 4,
  },
  metaLine: {
    marginTop: 1,
  },
  convivenciaLine: {
    marginTop: 2,
  },
  contactButton: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  fabLabel: {
    marginLeft: spacing.xs,
  },
});

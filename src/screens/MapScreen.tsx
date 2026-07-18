import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapView, { Marker } from '../components/PlatformMap';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';
import { useMyLocation } from '../hooks/useMyLocation';
import { AppText, Button, Screen } from '../ui';
import { colors, radius, shadow, spacing } from '../theme';

const SANTIAGO_REGION = { latitude: -33.45, longitude: -70.66, latitudeDelta: 0.3, longitudeDelta: 0.3 };

export default function MapScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { coords } = useMyLocation(true);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    listActivePets()
      .then(setPets)
      .catch((e: any) => setError(e?.message ?? 'No se pudieron cargar las mascotas.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(cargar);

  const initialRegion = coords
    ? { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.3, longitudeDelta: 0.3 }
    : SANTIAGO_REGION;

  return (
    <Screen>
      <View style={styles.mapWrap}>
        <MapView
          key={coords ? 'user-location' : 'santiago'}
          style={styles.map}
          initialRegion={initialRegion}
        >
          {pets.map((p) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              pinColor={p.estado === 'perdida' ? colors.lost : colors.found}
              title={`${p.estado === 'perdida' ? 'Perdida' : 'Encontrada'} · ${p.especie}`}
              description={p.descripcion.slice(0, 40)}
              onCalloutPress={() => navigation.navigate('PetDetail', { id: p.id })}
            />
          ))}
        </MapView>

        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: colors.lost }]} />
            <AppText size={12} weight="semi">
              Perdida
            </AppText>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: colors.found }]} />
            <AppText size={12} weight="semi">
              Encontrada
            </AppText>
          </View>
        </View>

        {loading ? (
          <View style={styles.banner}>
            <ActivityIndicator size="small" color={colors.brand} />
            <AppText size={13} weight="semi" style={styles.bannerText}>
              Cargando mascotas…
            </AppText>
          </View>
        ) : error ? (
          <View style={styles.banner}>
            <AppText size={13} weight="semi" color={colors.lost} style={styles.bannerText}>
              {error}
            </AppText>
            <Button title="Reintentar" onPress={cargar} style={styles.bannerButton} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  legend: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    ...shadow.card,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  banner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.card,
  },
  bannerText: {
    flex: 1,
  },
  bannerButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
});

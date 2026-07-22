import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker } from './PlatformMap';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { Pet } from '../services/pets';
import { buscarReportes, FiltrosBusqueda } from '../services/busqueda';
import { useMyLocation } from '../hooks/useMyLocation';
import { AppText, Button } from '../ui';
import { colors, radius, shadow, spacing } from '../theme';

// Cuerpo de MAPA de reportes: extraído de la vieja `MapScreen`. Cambio clave: en
// vez de traer TODO (`buscarReportes({}, ...)`), respeta los `filtros` que le
// baja `ExplorarScreen`, así el mapa y la lista muestran lo mismo. Tope de 100
// pines (dibujar miles cuelga el mapa y a esa escala no se distinguen).

const SANTIAGO_REGION = { latitude: -33.45, longitude: -70.66, latitudeDelta: 0.3, longitudeDelta: 0.3 };
const TOPE_PINES = 100;

export default function ReportesMapa({
  filtros,
  navigation,
}: {
  filtros: FiltrosBusqueda;
  navigation: any;
}) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { coords } = useMyLocation(true);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    buscarReportes(filtros, null, TOPE_PINES)
      .then((pagina) => setPets(pagina.reportes as Pet[]))
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [filtros]);

  // Recarga al enfocar y también cuando cambian los filtros (el callback cambia
  // de identidad → useFocusEffect re-suscribe estando enfocado).
  useFocusEffect(cargar);

  const initialRegion = coords
    ? { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.3, longitudeDelta: 0.3 }
    : SANTIAGO_REGION;

  return (
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

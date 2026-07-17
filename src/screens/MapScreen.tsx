import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from '../components/PlatformMap';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';
import { AppText, Screen } from '../ui';
import { colors, radius, shadow, spacing } from '../theme';

export default function MapScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);

  useFocusEffect(
    useCallback(() => {
      listActivePets().then(setPets).catch(() => setPets([]));
    }, []),
  );

  return (
    <Screen>
      <View style={styles.mapWrap}>
        <MapView
          style={styles.map}
          initialRegion={{ latitude: -33.45, longitude: -70.66, latitudeDelta: 0.3, longitudeDelta: 0.3 }}
        >
          {pets.map((p) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              pinColor={p.estado === 'perdida' ? 'red' : 'green'}
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
    borderRadius: radius.md,
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
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
});

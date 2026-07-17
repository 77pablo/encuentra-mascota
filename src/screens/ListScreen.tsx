import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';
import PetCard from '../components/PetCard';
import { AppText, Button, EmptyState, Input, Screen } from '../ui';
import { colors, radius, spacing } from '../theme';
import { distanceKm as getDistanceKm } from '../lib/geo';
import { useMyLocation } from '../hooks/useMyLocation';
import { notify } from '../lib/notify';
import { normalize } from '../lib/text';

type Filtro = 'todas' | 'perdida' | 'encontrada';
type EspecieFiltro = 'todas' | Pet['especie'];
type Radio = 5 | 20 | 50 | null; // null = Todo Chile (sin límite)

const filtros: { key: Filtro; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'perdida', label: 'Perdidas' },
  { key: 'encontrada', label: 'Encontradas' },
];

const especieFiltros: { key: EspecieFiltro; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

const radios: { key: Radio; label: string }[] = [
  { key: 5, label: '5 km' },
  { key: 20, label: '20 km' },
  { key: 50, label: '50 km' },
  { key: null, label: 'Todo Chile' },
];

export default function ListScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [estado, setEstado] = useState<Filtro>('todas');
  const [especie, setEspecie] = useState<EspecieFiltro>('todas');
  const [cercaDeMi, setCercaDeMi] = useState(false);
  const [radioKm, setRadioKm] = useState<Radio>(20);
  const [busqueda, setBusqueda] = useState('');
  const location = useMyLocation();

  useFocusEffect(
    useCallback(() => {
      listActivePets().then(setPets).catch(() => setPets([]));
    }, []),
  );

  // Si el usuario negó el permiso mientras "Cerca de mí" estaba activo,
  // avisamos y volvemos a mostrar todo (sin filtrar por distancia).
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

  const itemsConDistancia = useMemo(() => {
    const query = normalize(busqueda.trim());
    const base = pets.filter((p) => {
      const coincideEstado = estado === 'todas' || p.estado === estado;
      const coincideEspecie = especie === 'todas' || p.especie === especie;
      const coincideBusqueda =
        query === '' ||
        [p.nombre, p.raza, p.descripcion].some((campo) => campo && normalize(campo).includes(query));
      return coincideEstado && coincideEspecie && coincideBusqueda;
    });

    if (cercaDeMi && location.coords) {
      const origen = location.coords;
      return base
        .map((p) => ({ pet: p, distanceKm: getDistanceKm(origen, { lat: p.lat, lng: p.lng }) }))
        .filter((item) => radioKm === null || item.distanceKm <= radioKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    return base.map((p) => ({ pet: p, distanceKm: undefined as number | undefined }));
  }, [pets, estado, especie, busqueda, cercaDeMi, location.coords, radioKm]);

  const sinResultadosPorRadio = cercaDeMi && location.coords !== null && itemsConDistancia.length === 0 && pets.length > 0;
  const sinResultadosPorBusqueda = busqueda.trim() !== '' && itemsConDistancia.length === 0 && pets.length > 0;

  return (
    <Screen padded>
      <Button
        title="¿Encontraste una mascota?"
        icon="search"
        onPress={() => navigation.navigate('Encontre')}
        style={styles.findButton}
      />
      <Input
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por nombre, raza o color…"
        icon="search"
      />
      <View style={styles.chipsRow}>
        {filtros.map((f) => {
          const active = estado === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setEstado(f.key)}
              activeOpacity={0.8}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            >
              <AppText weight="bold" size={13} color={active ? colors.white : colors.muted}>
                {f.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.chipsRow}>
        {especieFiltros.map((f) => {
          const active = especie === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setEspecie(f.key)}
              activeOpacity={0.8}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            >
              <AppText weight="bold" size={13} color={active ? colors.white : colors.muted}>
                {f.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.chipsRow}>
        <TouchableOpacity
          onPress={toggleCercaDeMi}
          activeOpacity={0.8}
          style={[styles.chip, cercaDeMi ? styles.chipActive : styles.chipInactive]}
        >
          <AppText weight="bold" size={13} color={cercaDeMi ? colors.white : colors.muted}>
            📍 {location.status === 'loading' ? 'Buscando…' : 'Cerca de mí'}
          </AppText>
        </TouchableOpacity>
      </View>
      {cercaDeMi ? (
        <View style={styles.chipsRow}>
          {radios.map((r) => {
            const active = radioKm === r.key;
            return (
              <TouchableOpacity
                key={r.label}
                onPress={() => setRadioKm(r.key)}
                activeOpacity={0.8}
                style={[styles.radioChip, active ? styles.chipActive : styles.chipInactive]}
              >
                <AppText weight="bold" size={12} color={active ? colors.white : colors.muted}>
                  {r.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <FlatList
        data={itemsConDistancia}
        keyExtractor={(item) => item.pet.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          sinResultadosPorBusqueda ? (
            <EmptyState
              emoji="🔍"
              title="Sin resultados"
              subtitle="Prueba con otra palabra o quita filtros."
            />
          ) : sinResultadosPorRadio ? (
            <EmptyState
              emoji="📍"
              title="Nada cerca todavía"
              subtitle="Prueba ampliar el radio de búsqueda para ver más reportes."
            />
          ) : (
            <EmptyState
              emoji="🐾"
              title="Aún no hay mascotas"
              subtitle="Sé el primero en publicar un reporte."
            />
          )
        }
        renderItem={({ item }) => (
          <PetCard
            pet={item.pet}
            distanceKm={item.distanceKm}
            onPress={() => navigation.navigate('PetDetail', { id: item.pet.id })}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  findButton: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  radioChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipInactive: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
});

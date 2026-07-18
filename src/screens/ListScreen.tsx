import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { listActivePets, Pet } from '../services/pets';
import PetCard from '../components/PetCard';
import { AppText, Card, Chip, EmptyState, ErrorState, Input, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';
import { distanceKm as getDistanceKm } from '../lib/geo';
import { useMyLocation } from '../hooks/useMyLocation';
import { notify } from '../lib/notify';
import { normalize } from '../lib/text';
import { filterByExtras, RangoTiempo } from '../lib/petFilters';

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

const rangos: { key: RangoTiempo; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Última semana' },
];

export default function ListScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<Filtro>('todas');
  const [especie, setEspecie] = useState<EspecieFiltro>('todas');
  const [cercaDeMi, setCercaDeMi] = useState(false);
  const [radioKm, setRadioKm] = useState<Radio>(20);
  const [busqueda, setBusqueda] = useState('');
  const [conRecompensa, setConRecompensa] = useState(false);
  const [rango, setRango] = useState<RangoTiempo>('todo');
  const location = useMyLocation();

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    listActivePets()
      .then(setPets)
      .catch((e: any) => setError(e?.message ?? 'No se pudieron cargar las mascotas.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(cargar);

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
    const filtradas = pets.filter((p) => {
      const coincideEstado = estado === 'todas' || p.estado === estado;
      const coincideEspecie = especie === 'todas' || p.especie === especie;
      const coincideBusqueda =
        query === '' ||
        [p.nombre, p.raza, p.descripcion].some((campo) => campo && normalize(campo).includes(query));
      return coincideEstado && coincideEspecie && coincideBusqueda;
    });

    // Filtros avanzados (recompensa + rango de tiempo), antes del cálculo de distancia.
    const base = filterByExtras(filtradas, { conRecompensa, rango }, Date.now());

    if (cercaDeMi && location.coords) {
      const origen = location.coords;
      return base
        .map((p) => ({ pet: p, distanceKm: getDistanceKm(origen, { lat: p.lat, lng: p.lng }) }))
        .filter((item) => radioKm === null || item.distanceKm <= radioKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    return base.map((p) => ({ pet: p, distanceKm: undefined as number | undefined }));
  }, [pets, estado, especie, busqueda, conRecompensa, rango, cercaDeMi, location.coords, radioKm]);

  const sinResultadosPorRadio = cercaDeMi && location.coords !== null && itemsConDistancia.length === 0 && pets.length > 0;
  const sinResultadosPorBusqueda = busqueda.trim() !== '' && itemsConDistancia.length === 0 && pets.length > 0;
  const sinResultadosPorExtras =
    (conRecompensa || rango !== 'todo') && itemsConDistancia.length === 0 && pets.length > 0;

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

  return (
    <Screen padded>
      <Title size={22} style={styles.screenTitle}>
        Todas las mascotas
      </Title>

      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Encontre')}>
        <Card style={styles.findCard}>
          <View style={styles.findRow}>
            <View style={styles.findIconWrap}>
              <Ionicons name="search" size={20} color={colors.brand} />
            </View>
            <View style={styles.findTextWrap}>
              <AppText weight="bold" size={14}>
                ¿Encontraste una mascota?
              </AppText>
              <AppText muted size={12}>
                Publícala y ayuda a que vuelva a casa.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </View>
        </Card>
      </TouchableOpacity>

      <Input
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por nombre, raza o color…"
        icon="search"
      />

      <View style={styles.chipsRow}>
        {filtros.map((f) => (
          <Chip key={f.key} label={f.label} active={estado === f.key} onPress={() => setEstado(f.key)} />
        ))}
      </View>
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
        {rangos.map((r) => (
          <Chip key={r.key} label={r.label} active={rango === r.key} onPress={() => setRango(r.key)} />
        ))}
      </View>
      <View style={styles.chipsRow}>
        <Chip
          label="Con recompensa"
          active={conRecompensa}
          onPress={() => setConRecompensa((v) => !v)}
        />
        <Chip
          label={location.status === 'loading' ? 'Buscando…' : '📍 Cerca de mí'}
          active={cercaDeMi}
          onPress={toggleCercaDeMi}
        />
      </View>
      {cercaDeMi ? (
        <View style={styles.chipsRow}>
          {radios.map((r) => (
            <Chip key={r.label} label={r.label} active={radioKm === r.key} onPress={() => setRadioKm(r.key)} />
          ))}
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
              illustration
              title="No encontramos nada así"
              subtitle="Prueba con otra palabra o suelta algún filtro."
            />
          ) : sinResultadosPorRadio ? (
            <EmptyState
              illustration
              title="No encontramos nada así"
              subtitle="Prueba ampliar el radio de búsqueda para ver más reportes."
            />
          ) : sinResultadosPorExtras ? (
            <EmptyState
              illustration
              title="No encontramos nada así"
              subtitle="Prueba ampliar el rango de tiempo o soltar el filtro de recompensa."
            />
          ) : (
            <EmptyState
              illustration
              title="Por ahora, nada por acá"
              subtitle="Ojalá siga así. Si viste algo, cuéntale al barrio."
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
  screenTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  findCard: {
    backgroundColor: colors.sky,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  findRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  findIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findTextWrap: {
    flex: 1,
    gap: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.md,
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

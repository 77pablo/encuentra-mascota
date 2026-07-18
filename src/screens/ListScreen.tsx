import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pet } from '../services/pets';
import PetCard from '../components/PetCard';
import { AppText, Card, Chip, EmptyState, ErrorState, Input, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';
import { useMyLocation } from '../hooks/useMyLocation';
import { notify } from '../lib/notify';
import { desdeDeRango, RangoTiempo } from '../lib/petFilters';
import { useBusquedaReportes } from '../hooks/useBusquedaReportes';
import { FiltrosBusqueda } from '../services/busqueda';

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

// Esperamos a que el usuario deje de escribir antes de consultar: sin esto,
// "pelusa" dispararía seis búsquedas al servidor.
const ESPERA_TIPEO_MS = 400;

export default function ListScreen({ navigation }: any) {
  const [estado, setEstado] = useState<Filtro>('todas');
  const [especie, setEspecie] = useState<EspecieFiltro>('todas');
  const [cercaDeMi, setCercaDeMi] = useState(false);
  const [radioKm, setRadioKm] = useState<Radio>(20);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDiferida, setBusquedaDiferida] = useState('');
  const [conRecompensa, setConRecompensa] = useState(false);
  const [rango, setRango] = useState<RangoTiempo>('todo');
  const location = useMyLocation();

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDiferida(busqueda), ESPERA_TIPEO_MS);
    return () => clearTimeout(t);
  }, [busqueda]);

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

  // Todo el filtrado viaja al servidor. Antes esto se hacía en memoria sobre
  // TODOS los reportes; con la app en serio eso no escala.
  const cerca = cercaDeMi && location.coords !== null;
  const filtrosBusqueda: FiltrosBusqueda = useMemo(
    () => ({
      lat: cerca ? location.coords!.lat : null,
      lng: cerca ? location.coords!.lng : null,
      radioKm: cerca ? radioKm : null,
      estado: estado === 'todas' ? null : estado,
      especie: especie === 'todas' ? null : especie,
      texto: busquedaDiferida,
      conRecompensa,
      desde: desdeDeRango(rango, Date.now()),
      orden: cerca ? 'cerca' : 'recientes',
    }),
    [cerca, location.coords, radioKm, estado, especie, busquedaDiferida, conRecompensa, rango],
  );

  const { reportes, cargando, cargandoMas, error, hayMas, recargar, cargarMas } =
    useBusquedaReportes(filtrosBusqueda);

  const hayFiltrosPuestos =
    busquedaDiferida.trim() !== '' ||
    conRecompensa ||
    rango !== 'todo' ||
    estado !== 'todas' ||
    especie !== 'todas' ||
    cerca;

  if (cargando) {
    return <Loading />;
  }

  if (error) {
    return (
      <Screen padded>
        <ErrorState message={error} onRetry={recargar} />
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
        data={reportes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={hayMas ? cargarMas : undefined}
        onEndReachedThreshold={0.4}
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
              subtitle="Prueba con otra palabra, amplía el rango o suelta algún filtro."
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
            pet={item}
            distanceKm={item.distancia_km ?? undefined}
            onPress={() => navigation.navigate('PetDetail', { id: item.id })}
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
  footer: {
    paddingVertical: spacing.lg,
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ComunaPickerModal from '../components/ComunaPickerModal';
import ReportesLista from '../components/ReportesLista';
import ReportesMapa from '../components/ReportesMapa';
import SeguirComunaButton from '../components/SeguirComunaButton';
import MensajesButton from '../components/MensajesButton';
import { Pet } from '../services/pets';
import { AppText, Card, Chip, Input, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';
import { useMyLocation } from '../hooks/useMyLocation';
import { notify } from '../lib/notify';
import { desdeDeRango, RangoTiempo } from '../lib/petFilters';
import { FiltrosBusqueda } from '../services/busqueda';

// EXPLORAR: unifica las viejas pestañas Mapa + Lista + Comunidad en una sola.
// Dueña de TODOS los filtros y del toggle Lista/Mapa; baja el mismo objeto
// `filtros` a los dos cuerpos (`ReportesLista`/`ReportesMapa`), así alternar de
// vista conserva la búsqueda. "Seguir comuna" (lo que hacía Comunidad) aparece
// cuando hay un filtro de comuna puesto.

type Filtro = 'todas' | 'perdida' | 'encontrada';
type EspecieFiltro = 'todas' | Pet['especie'];
type Radio = 5 | 20 | 50 | null;
type Vista = 'lista' | 'mapa';

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

const ESPERA_TIPEO_MS = 400;

export default function ExplorarScreen({ navigation, route }: any) {
  const [estado, setEstado] = useState<Filtro>('todas');
  const [especie, setEspecie] = useState<EspecieFiltro>('todas');
  const [cercaDeMi, setCercaDeMi] = useState(false);
  const [radioKm, setRadioKm] = useState<Radio>(20);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDiferida, setBusquedaDiferida] = useState('');
  const [conRecompensa, setConRecompensa] = useState(false);
  const [rango, setRango] = useState<RangoTiempo>('todo');
  const [comunaFiltro, setComunaFiltro] = useState<string | null>(null);
  const [comunaPickerOpen, setComunaPickerOpen] = useState(false);
  const [vista, setVista] = useState<Vista>('lista');
  const location = useMyLocation();

  // Pre-cargar la comuna cuando se llega desde "En tu comuna" de Inicio.
  useEffect(() => {
    const c = route?.params?.comuna;
    if (typeof c === 'string' && c) setComunaFiltro(c);
  }, [route?.params?.comuna]);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDiferida(busqueda), ESPERA_TIPEO_MS);
    return () => clearTimeout(t);
  }, [busqueda]);

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
      comuna: comunaFiltro,
    }),
    [cerca, location.coords, radioKm, estado, especie, busquedaDiferida, conRecompensa, rango, comunaFiltro],
  );

  return (
    <Screen padded>
      <View style={styles.headerRow}>
        <Title size={22}>Explorar</Title>
        <MensajesButton />
      </View>

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
          <Chip key={f.key} label={f.label} active={especie === f.key} onPress={() => setEspecie(f.key)} />
        ))}
      </View>
      <View style={styles.chipsRow}>
        {rangos.map((r) => (
          <Chip key={r.key} label={r.label} active={rango === r.key} onPress={() => setRango(r.key)} />
        ))}
      </View>
      <View style={styles.chipsRow}>
        <Chip label="Con recompensa" active={conRecompensa} onPress={() => setConRecompensa((v) => !v)} />
        <Chip
          label={location.status === 'loading' ? 'Buscando…' : '📍 Cerca de mí'}
          active={cercaDeMi}
          onPress={toggleCercaDeMi}
        />
      </View>
      <View style={styles.chipsRow}>
        <Chip
          label={comunaFiltro ? `🏘 ${comunaFiltro}` : '🏘 Filtrar por comuna'}
          active={!!comunaFiltro}
          onPress={() => setComunaPickerOpen(true)}
        />
        {comunaFiltro ? <Chip label="✕ Quitar" onPress={() => setComunaFiltro(null)} /> : null}
      </View>
      {cercaDeMi ? (
        <View style={styles.chipsRow}>
          {radios.map((r) => (
            <Chip key={r.label} label={r.label} active={radioKm === r.key} onPress={() => setRadioKm(r.key)} />
          ))}
        </View>
      ) : null}

      {comunaFiltro ? <SeguirComunaButton comuna={comunaFiltro} /> : null}

      {/* Toggle Lista / Mapa: las dos vistas de la misma búsqueda. */}
      <View style={styles.toggleRow}>
        <Chip label="☰ Lista" active={vista === 'lista'} onPress={() => setVista('lista')} />
        <Chip label="🗺 Mapa" active={vista === 'mapa'} onPress={() => setVista('mapa')} />
      </View>

      <View style={styles.body}>
        {vista === 'lista' ? (
          <ReportesLista filtros={filtrosBusqueda} navigation={navigation} />
        ) : (
          <ReportesMapa filtros={filtrosBusqueda} navigation={navigation} />
        )}
      </View>

      <ComunaPickerModal
        visible={comunaPickerOpen}
        onClose={() => setComunaPickerOpen(false)}
        onSelect={setComunaFiltro}
        titulo="Filtrar por comuna"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  body: {
    flex: 1,
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ComunaPickerModal from '../components/ComunaPickerModal';
import ReportesLista from '../components/ReportesLista';
import ReportesMapa from '../components/ReportesMapa';
import SeguirComunaButton from '../components/SeguirComunaButton';
import GuardarBusquedaButton from '../components/GuardarBusquedaButton';
import MensajesButton from '../components/MensajesButton';
import { Pet } from '../services/pets';
import { AppText, Card, Chip, Input, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { useMyLocation } from '../hooks/useMyLocation';
import { notify } from '../lib/notify';
import { desdeDeRango, filtrosDesdeRuta, RangoTiempo } from '../lib/petFilters';
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
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
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
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const location = useMyLocation();

  // Cuántos filtros hay activos (para el contador del botón "Filtros"). La
  // búsqueda de texto no cuenta acá: vive en su propio input, siempre visible.
  const filtrosActivos =
    (estado !== 'todas' ? 1 : 0) +
    (especie !== 'todas' ? 1 : 0) +
    (rango !== 'todo' ? 1 : 0) +
    (conRecompensa ? 1 : 0) +
    (comunaFiltro ? 1 : 0) +
    (cercaDeMi ? 1 : 0);

  // Filtros con los que se llega desde los accesos de Inicio (los cuatro chips
  // y la tarjeta "En tu comuna"). Se aplica el juego COMPLETO que devuelve
  // `filtrosDesdeRuta`, no un parche: un acceso promete un filtro, así que tocar
  // "Gatos" después de "Perdidos" tiene que dar gatos y no gatos-perdidos.
  // Si la ruta no trae nada aplicable devuelve null y no se toca lo que la
  // persona ya había elegido acá adentro.
  useEffect(() => {
    const f = filtrosDesdeRuta(route?.params);
    if (!f) return;
    setComunaFiltro(f.comuna);
    setEspecie(f.especie ?? 'todas');
    setEstado(f.estado ?? 'todas');
    setCercaDeMi(f.cerca);
    if (f.cerca) location.request();
    // Los filtros arrancan plegados; si llegaron puestos desde afuera se abren,
    // para que se vea qué se aplicó y se pueda soltar.
    setFiltrosAbiertos(true);
    // `location` cambia de identidad en cada render: si va en las dependencias,
    // el efecto se dispara solo para siempre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params]);

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

      {/* Control: botón de filtros colapsables (cerrado por defecto, para que la
          lista/mapa se vea enseguida) + toggle Lista/Mapa siempre visible. */}
      <View style={styles.controlRow}>
        <Chip
          label={`⚙ Filtros${filtrosActivos > 0 ? ` (${filtrosActivos})` : ''} ${filtrosAbiertos ? '▴' : '▾'}`}
          active={filtrosAbiertos || filtrosActivos > 0}
          onPress={() => setFiltrosAbiertos((v) => !v)}
        />
        <View style={styles.toggleGroup}>
          <Chip label="☰ Lista" active={vista === 'lista'} onPress={() => setVista('lista')} />
          <Chip label="🗺 Mapa" active={vista === 'mapa'} onPress={() => setVista('mapa')} />
        </View>
      </View>

      {filtrosAbiertos ? (
        <View>
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
          {/* "Avisarme de esta búsqueda" (Función 2): necesita comuna Y un estado
              concreto (perdida/encontrada). Con "Todas" no hay `tipo` válido para
              guardar, así que el botón no aparece. */}
          {comunaFiltro && estado !== 'todas' ? (
            <GuardarBusquedaButton
              tipo={estado}
              especie={especie === 'todas' ? null : especie}
              comuna={comunaFiltro}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.body}>
        {vista === 'lista' ? (
          <ReportesLista
            filtros={filtrosBusqueda}
            navigation={navigation}
            // El vacío de una comuna/zona sin datos ofrece "Ver todo Chile";
            // los filtros de lugar viven acá, así que la salida la damos acá.
            //
            // Solo si HAY un filtro de lugar puesto. Si no, el botón aparecía
            // igual y no hacía absolutamente nada: buscar "pelusa" sin comuna
            // ni ubicación mostraba "Ver todo Chile", y al tocarlo la pantalla
            // quedaba idéntica porque no había nada que soltar.
            onAmpliarBusqueda={
              comunaFiltro || cercaDeMi
                ? () => {
                    setComunaFiltro(null);
                    setCercaDeMi(false);
                  }
                : undefined
            }
            // Con el panel abierto, el "Avisarme de X" ya está unas líneas más
            // arriba: repetirlo en el vacío daba dos botones idénticos pegados.
            ofrecerSeguirComuna={!filtrosAbiertos}
          />
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

const crearEstilos = (colors: Colors) => StyleSheet.create({
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
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  body: {
    flex: 1,
  },
});

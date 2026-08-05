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
import { AppText, Button, Card, Chip, EmptyState, ErrorState, Input, Loading, Screen, Title } from '../ui';
import { radius, shadow, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import ComunaPickerModal from '../components/ComunaPickerModal';
import { useBusquedaAdopciones } from '../hooks/useBusquedaAdopciones';
import { AdopcionConDistancia, FiltrosAdopcion } from '../services/busquedaAdopciones';
import { Adoption } from '../services/adoptions';
import { useAdoptionSaves } from '../context/AdoptionSavesProvider';
import { useRequireAuth } from '../hooks/useRequireAuth';
import MensajesButton from '../components/MensajesButton';
import { useAuth } from '../hooks/useAuth';
import { useMyLocation } from '../hooks/useMyLocation';
import { notify } from '../lib/notify';
import { distanceLabel } from '../lib/geo';
import { timeAgo } from '../lib/time';

// El feed tipo Instagram de adopción: SOLO animales en adopción (tabla
// `adoptions`), separado a propósito de los reportes de perdida/encontrada.
// Espeja `ListScreen` en la mecánica (chips que viajan al servidor, scroll
// infinito, "cerca de mí"), pero con tarjetas grandes de foto.
//
// Paridad con el resto de la app (tanda 11): buscador de texto, filtro por
// edad y el radio —que el servicio aceptaba desde la 0030 y esta pantalla
// mandaba SIEMPRE en null—. Los tres viajan al servidor, no se filtran acá:
// filtrar en el cliente rompería la paginación por cursor.

type EspecieFiltro = 'todas' | Adoption['especie'];
type TamanoFiltro = 'todos' | NonNullable<Adoption['tamano']>;
type EdadFiltro = 'todas' | NonNullable<Adoption['edad']>;
type Radio = 5 | 20 | 50 | null;

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

const edadFiltros: { key: EdadFiltro; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'cachorro', label: 'Cachorro' },
  { key: 'adulto', label: 'Adulto' },
  { key: 'senior', label: 'Senior' },
];

// Los radios que se ofrecen cuando hay un centro. Sin el 1 km de Explorar: acá
// no se busca un animal que se escapó a la vuelta, se mira hasta dónde estarías
// dispuesto a ir a conocer a uno. "Todo Chile" es el valor de arranque a
// propósito — ver el comentario de `radioKm` más abajo.
const radios: { key: Radio; label: string }[] = [
  { key: 5, label: '5 km' },
  { key: 20, label: '20 km' },
  { key: 50, label: '50 km' },
  { key: null, label: 'Todo Chile' },
];

// Mismo rebote que Explorar: no se dispara una búsqueda por tecla.
const ESPERA_TIPEO_MS = 400;

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
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
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
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [especie, setEspecie] = useState<EspecieFiltro>('todas');
  const [tamano, setTamano] = useState<TamanoFiltro>('todos');
  const [edad, setEdad] = useState<EdadFiltro>('todas');
  // Lo tipeado y lo que ya se puede mandar (rebote de `ESPERA_TIPEO_MS`).
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDiferida, setBusquedaDiferida] = useState('');
  // EL RADIO. Arranca en `null` = todo Chile, que es exactamente lo que esta
  // pantalla ya hacía: "cerca de mí" ORDENABA por distancia sin recortar nada.
  // Poner un default finito le vaciaría el feed a quien vive donde todavía no
  // publica nadie, y cablear un filtro no puede cambiarle la pantalla a quien
  // no lo tocó. Acota quien quiere acotar.
  const [radioKm, setRadioKm] = useState<Radio>(null);
  // Filtro por comuna (F5, migración 0033). Mismo patrón que ExplorarScreen:
  // chip que abre el picker + chip "✕ Quitar" cuando ya hay una elegida.
  const [comunaFiltro, setComunaFiltro] = useState<string | null>(null);
  const [comunaPickerOpen, setComunaPickerOpen] = useState(false);
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

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDiferida(busqueda), ESPERA_TIPEO_MS);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cerca = cercaDeMi && location.coords !== null;
  const filtros: FiltrosAdopcion = useMemo(
    () => ({
      especie: especie === 'todas' ? null : especie,
      tamano: tamano === 'todos' ? null : tamano,
      edad: edad === 'todas' ? null : edad,
      texto: busquedaDiferida,
      comuna: comunaFiltro,
      lat: cerca ? location.coords!.lat : null,
      lng: cerca ? location.coords!.lng : null,
      // Sin centro no hay círculo: un radio suelto le pediría a la base un
      // anillo alrededor de nada y dejaría el feed vacío sin explicación.
      radioKm: cerca ? radioKm : null,
      orden: cerca ? 'cerca' : 'recientes',
    }),
    [especie, tamano, edad, busquedaDiferida, comunaFiltro, cerca, radioKm, location.coords],
  );

  const { adopciones, cargando, cargandoMas, error, hayMas, recargar, cargarMas } =
    useBusquedaAdopciones(filtros);

  // ¿Ya terminó alguna búsqueda? Distingue "la pantalla está abriéndose" de
  // "estoy filtrando algo": lo usa el bloque de espera de más abajo.
  const [yaCargoAlgunaVez, setYaCargoAlgunaVez] = useState(false);
  useEffect(() => {
    if (!cargando) setYaCargoAlgunaVez(true);
  }, [cargando]);

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

  // Acotar QUÉ buscás (especie, tamaño) no es lo mismo que acotar DÓNDE
  // (comuna, "cerca de mí"), y contarlos juntos le echaba la culpa al usuario
  // nuevo: filtrar por tu barrio en una base casi vacía devolvía "prueba con
  // otra especie", cuando lo que pasa es que todavía nadie publicó ahí.
  const hayFiltrosDeContenido =
    especie !== 'todas' || tamano !== 'todos' || edad !== 'todas' || busquedaDiferida.trim() !== '';

  // Salidas del vacío por lugar. A diferencia de los reportes, acá NO se ofrece
  // "seguir la comuna": eso escribe en `notification_prefs.comunas_seguidas` y
  // la Edge Function solo lo consulta para el evento `reporte_nuevo`. Prometer
  // un aviso de adopciones por comuna sería prometer algo que nadie manda.
  const publicarBoton = (
    <Button title="Publicar en adopción" variant="secondary" icon="add" onPress={irAPublicar} />
  );
  const verTodasLasComunas = (
    <Button title="Ver todas las comunas" variant="ghost" onPress={() => setComunaFiltro(null)} />
  );

  let vacio: React.ReactNode;
  if (hayFiltrosDeContenido) {
    vacio = (
      <EmptyState
        illustration
        title="No encontramos nada así"
        subtitle="Prueba con otra especie, otro tamaño o mira todas."
        action={comunaFiltro ? verTodasLasComunas : undefined}
      />
    );
  } else if (comunaFiltro) {
    vacio = (
      <EmptyState
        illustration
        title={`Todavía nadie busca hogar en ${comunaFiltro}`}
        subtitle="Cuando alguien publique por acá va a aparecer justo aquí. Si tenés una para dar en adopción, empezá vos."
        action={
          <>
            {publicarBoton}
            {verTodasLasComunas}
          </>
        }
      />
    );
  } else if (cerca) {
    vacio = (
      <EmptyState
        illustration
        title="Por tu zona todavía nadie busca hogar"
        subtitle="Probá mirando todas: puede haber alguna un poco más lejos esperando familia."
        action={
          <>
            {publicarBoton}
            <Button title="Ver todas" variant="ghost" onPress={() => setCercaDeMi(false)} />
          </>
        }
      />
    );
  } else {
    vacio = (
      <EmptyState
        illustration
        title="Todavía nadie busca hogar por acá"
        subtitle="Cuando alguien publique una mascota en adopción, va a aparecer justo aquí."
        action={publicarBoton}
      />
    );
  }

  // La pantalla de espera ENTERA es solo para la primera vez.
  //
  // Con un buscador arriba, seguir usándola en cada búsqueda es un bug: cada
  // tecleo dispara una consulta y, si la lista está vacía —que es justo cuando
  // estás buscando otra cosa—, el spinner a pantalla completa desmontaba el
  // Input. Se perdía el foco y lo escrito quedaba fuera de alcance a mitad de
  // la palabra. De la segunda vez en adelante la espera va donde va la lista.
  if (cargando && adopciones.length === 0 && !yaCargoAlgunaVez) {
    return <Loading label="Buscando mascotas en adopción…" />;
  }

  // El error va DONDE IRÍA LA LISTA, no en lugar de la pantalla entera.
  //
  // Antes reemplazaba todo, y con los filtros nuevos eso encierra a la persona:
  // si la 0052 no está aplicada, escribir en el buscador devuelve error, y con
  // la pantalla reemplazada no queda ninguna forma de borrar lo que escribiste.
  // El listado SIN ese filtro funciona perfecto: hay que poder soltarlo.
  let cuerpoVacio: React.ReactNode = vacio;
  if (cargando) cuerpoVacio = <Loading label="Buscando…" />;
  else if (error && adopciones.length === 0)
    cuerpoVacio = <ErrorState message={error} onRetry={recargar} />;

  return (
    <Screen padded>
      <View style={styles.headerRow}>
        <Title size={22}>En adopción</Title>
        <MensajesButton />
      </View>
      <AppText muted size={13} style={styles.subtitle}>
        Vecinos del barrio buscándoles un hogar. Guárdalas o escríbele a quien las tiene.
      </AppText>

      <Input
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por nombre o descripción…"
        icon="search"
      />

      <View style={styles.chipsRow} accessibilityRole="radiogroup">
        {especieFiltros.map((f) => (
          <Chip
            key={f.key}
            rol="opcion"
            label={f.label}
            active={especie === f.key}
            onPress={() => setEspecie(f.key)}
          />
        ))}
      </View>
      <View style={styles.chipsRow} accessibilityRole="radiogroup">
        {tamanoFiltros.map((f) => (
          <Chip key={f.key} rol="opcion" label={f.label} active={tamano === f.key} onPress={() => setTamano(f.key)} />
        ))}
      </View>
      <View style={styles.chipsRow} accessibilityRole="radiogroup">
        {edadFiltros.map((f) => (
          <Chip key={f.key} rol="opcion" label={f.label} active={edad === f.key} onPress={() => setEdad(f.key)} />
        ))}
      </View>
      <View style={styles.chipsRow} accessibilityRole="radiogroup">
        <Chip rol="opcion" label="Recientes" active={!cerca} onPress={() => cercaDeMi && setCercaDeMi(false)} />
        <Chip
          rol="opcion"
          label={location.status === 'loading' ? 'Buscando…' : '📍 Cerca de mí'}
          active={cerca}
          onPress={toggleCercaDeMi}
        />
      </View>
      {/* Los radios solo cuando hay centro: ver el comentario de `radioKm`. */}
      {cerca ? (
        <View style={styles.chipsRow} accessibilityRole="radiogroup">
          {radios.map((r) => (
            <Chip
              key={r.label}
              rol="opcion"
              label={r.label}
              active={radioKm === r.key}
              onPress={() => setRadioKm(r.key)}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.chipsRow}>
        <Chip
          // No es un "elegí uno" ni un on/off: dispara el selector de comuna.
          // Sin `rol` acá el componente lo tomaba por 'casilla' en cuanto vio
          // `active` (ver el comentario de Chip.tsx), y quedaba anunciado
          // "casilla" para algo que no se puede tildar — el mismo caso que
          // ExplorarScreen ya resuelve con 'boton'.
          rol="boton"
          label={comunaFiltro ? `🏘 ${comunaFiltro}` : '🏘 Filtrar por comuna'}
          active={!!comunaFiltro}
          onPress={() => setComunaPickerOpen(true)}
        />
        {comunaFiltro ? <Chip label="✕ Quitar" onPress={() => setComunaFiltro(null)} /> : null}
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
        ListEmptyComponent={cuerpoVacio}
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
    // sobre la foto: blanco fijo (card seria invisible en oscuro)
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

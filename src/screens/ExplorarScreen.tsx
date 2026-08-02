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
import { radioExplorarSugeridoKm } from '../lib/radioSugerido';
import {
  COLORES,
  COLOR_ETIQUETA,
  type ColorPelaje,
  TAMANOS,
  TAMANO_ETIQUETA,
  type Tamano,
} from '../lib/senasMascota';
import { FiltrosBusqueda } from '../services/busqueda';

// EXPLORAR: unifica las viejas pestañas Mapa + Lista + Comunidad en una sola.
// Dueña de TODOS los filtros y del toggle Lista/Mapa; baja el mismo objeto
// `filtros` a los dos cuerpos (`ReportesLista`/`ReportesMapa`), así alternar de
// vista conserva la búsqueda. "Seguir comuna" (lo que hacía Comunidad) aparece
// cuando hay un filtro de comuna puesto.

type Filtro = 'todas' | 'perdida' | 'encontrada';
type EspecieFiltro = 'todas' | Pet['especie'];
type Radio = 1 | 5 | 20 | 50 | null;
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
// El 1 km es nuevo y no es decorativo: sin un botón por debajo de 5 km, el
// dueño de un gato de interior (mediana de 50 m, según el estudio de
// Queensland) no tenía forma de pedir "la manzana de al lado".
const radios: { key: Radio; label: string }[] = [
  { key: 1, label: '1 km' },
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
  // El radio que la persona eligió a mano. `null` acá NO es "todo Chile": es
  // "todavía no tocó ningún botón", y en ese caso manda la sugerencia calibrada
  // por especie (ver `radioKm` más abajo). Sugerir está bien; imponer no: si
  // alguien puso 50 km a propósito y después filtra por gato, dejarle la
  // búsqueda en 5 km es sacarle de la pantalla justo lo que estaba mirando.
  const [radioElegido, setRadioElegido] = useState<Radio | undefined>(undefined);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDiferida, setBusquedaDiferida] = useState('');
  const [conRecompensa, setConRecompensa] = useState(false);
  const [rango, setRango] = useState<RangoTiempo>('todo');
  // Señas estructuradas (migración 0054). Uno de cada uno, no varios: el
  // filtro es "mostrame los negros", no "los negros y los grises".
  const [colorFiltro, setColorFiltro] = useState<ColorPelaje | null>(null);
  const [tamanoFiltro, setTamanoFiltro] = useState<Tamano | null>(null);
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
    (colorFiltro ? 1 : 0) +
    (tamanoFiltro ? 1 : 0) +
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

  // RADIO CALIBRADO POR ESPECIE (ver src/lib/radioSugerido.ts).
  //
  // Un gato aparece a una mediana de 315 m: un reporte de gato a 20 km no es tu
  // gato y vos tampoco podés ayudar con él. Un perro camina kilómetros, así que
  // ahí los 20 km de siempre están bien y achicárselos sería romper una
  // búsqueda que ya andaba. `radioExplorarSugeridoKm` nunca devuelve MÁS que
  // los 20 km de antes: calibrar acá solo puede achicar, y solo cuando hay una
  // especie elegida.
  const radioKm: Radio =
    radioElegido !== undefined
      ? radioElegido
      : (radioExplorarSugeridoKm(especie === 'todas' ? null : especie) as Radio);

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
      // `null` cuando no se eligió nada, y eso importa: `buscarReportes` solo
      // agrega los parámetros nuevos a la llamada si acá viene algo. Mandarlos
      // siempre dejaría Explorar en blanco contra una base sin la 0054.
      color: colorFiltro,
      tamano: tamanoFiltro,
    }),
    [
      cerca,
      location.coords,
      radioKm,
      estado,
      especie,
      busquedaDiferida,
      conRecompensa,
      rango,
      comunaFiltro,
      colorFiltro,
      tamanoFiltro,
    ],
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
          lista/mapa se vea enseguida) + toggle Lista/Mapa siempre visible.

          Lo que escucha quien no ve la pantalla (ver src/ui/Chip.tsx): el ⚙ y
          las flechitas ▴▾ el lector de pantalla los deletrea, así que cada chip
          con emoji lleva su `accessibilityLabel` en castellano. Y que el panel
          esté abierto o cerrado se dice con `expandido`, no con un triángulo. */}
      <View style={styles.controlRow}>
        <Chip
          rol="boton"
          label={`⚙ Filtros${filtrosActivos > 0 ? ` (${filtrosActivos})` : ''} ${filtrosAbiertos ? '▴' : '▾'}`}
          accessibilityLabel={`Filtros${filtrosActivos > 0 ? `, ${filtrosActivos} activos` : ''}`}
          active={filtrosAbiertos || filtrosActivos > 0}
          expandido={filtrosAbiertos}
          onPress={() => setFiltrosAbiertos((v) => !v)}
        />
        <View style={styles.toggleGroup} role="radiogroup" accessibilityLabel="Cómo ver los reportes">
          <Chip
            rol="opcion"
            label="☰ Lista"
            accessibilityLabel="Ver en lista"
            active={vista === 'lista'}
            onPress={() => setVista('lista')}
          />
          <Chip
            rol="opcion"
            label="🗺 Mapa"
            accessibilityLabel="Ver en el mapa"
            active={vista === 'mapa'}
            onPress={() => setVista('mapa')}
          />
        </View>
      </View>

      {filtrosAbiertos ? (
        <View>
          {/* Cada fila de chips es una PREGUNTA distinta, y el rol lo tiene que
              decir: acá todos los grupos son "elegí uno" (radiogroup + radio),
              y solo los dos filtros sueltos de más abajo se prenden y apagan
              por su cuenta (casilla). Sin el nombre en el contenedor, quien
              tabula escucha cinco filas de opciones seguidas sin saber de qué
              es cada una. */}
          <View style={styles.chipsRow} role="radiogroup" accessibilityLabel="Estado del reporte">
            {filtros.map((f) => (
              <Chip key={f.key} rol="opcion" label={f.label} active={estado === f.key} onPress={() => setEstado(f.key)} />
            ))}
          </View>
          <View style={styles.chipsRow} role="radiogroup" accessibilityLabel="Especie">
            {especieFiltros.map((f) => (
              <Chip key={f.key} rol="opcion" label={f.label} active={especie === f.key} onPress={() => setEspecie(f.key)} />
            ))}
          </View>
          {/* SEÑAS (0054). Van DENTRO del panel plegable y no sueltas arriba:
              diez chips más siempre visibles taparían la lista, que es lo que
              la persona vino a mirar. Volver a tocar el mismo chip lo suelta.

              OJO: acá el color es UNO solo —"mostrame los negros"—, mientras
              que en el formulario de publicar (`SelectorSenas`) se marcan hasta
              tres. Es el mismo chip con la misma pinta y promete cosas
              distintas, así que el rol tiene que ser distinto: radio acá,
              casilla allá. */}
          <View style={styles.chipsRow} role="radiogroup" accessibilityLabel="Color del pelaje">
            {COLORES.map((c) => (
              <Chip
                key={c}
                rol="opcion"
                label={COLOR_ETIQUETA[c]}
                active={colorFiltro === c}
                onPress={() => setColorFiltro((v) => (v === c ? null : c))}
              />
            ))}
          </View>
          <View style={styles.chipsRow} role="radiogroup" accessibilityLabel="Tamaño">
            {TAMANOS.map((t) => (
              <Chip
                key={t}
                rol="opcion"
                label={TAMANO_ETIQUETA[t]}
                active={tamanoFiltro === t}
                onPress={() => setTamanoFiltro((v) => (v === t ? null : t))}
              />
            ))}
          </View>
          <View style={styles.chipsRow} role="radiogroup" accessibilityLabel="Cuándo se publicó">
            {rangos.map((r) => (
              <Chip key={r.key} rol="opcion" label={r.label} active={rango === r.key} onPress={() => setRango(r.key)} />
            ))}
          </View>
          <View style={styles.chipsRow}>
            {/* Estos dos no compiten con nadie: se prenden y se apagan solos. */}
            <Chip
              rol="casilla"
              label="Con recompensa"
              active={conRecompensa}
              onPress={() => setConRecompensa((v) => !v)}
            />
            <Chip
              rol="casilla"
              label={location.status === 'loading' ? 'Buscando…' : '📍 Cerca de mí'}
              accessibilityLabel={
                location.status === 'loading' ? 'Buscando tu ubicación' : 'Cerca de mí'
              }
              active={cercaDeMi}
              onPress={toggleCercaDeMi}
            />
          </View>
          <View style={styles.chipsRow}>
            {/* Abre un selector: es un botón, no un estado que se marca. */}
            <Chip
              rol="boton"
              label={comunaFiltro ? `🏘 ${comunaFiltro}` : '🏘 Filtrar por comuna'}
              accessibilityLabel={
                comunaFiltro ? `Comuna: ${comunaFiltro}. Cambiar` : 'Filtrar por comuna'
              }
              active={!!comunaFiltro}
              onPress={() => setComunaPickerOpen(true)}
            />
            {comunaFiltro ? (
              <Chip
                rol="boton"
                label="✕ Quitar"
                accessibilityLabel="Quitar el filtro de comuna"
                onPress={() => setComunaFiltro(null)}
              />
            ) : null}
          </View>
          {cercaDeMi ? (
            <View style={styles.chipsRow} role="radiogroup" accessibilityLabel="Radio de búsqueda">
              {radios.map((r) => (
                <Chip
                  key={r.label}
                  rol="opcion"
                  label={r.label}
                  active={radioKm === r.key}
                  onPress={() => setRadioElegido(r.key)}
                />
              ))}
            </View>
          ) : null}
          {/* Una línea, no un párrafo: quien lee acaba de perder a su animal.
              Solo aparece cuando la sugerencia está haciendo algo (gatos). */}
          {cercaDeMi && radioElegido === undefined && especie === 'gato' ? (
            <AppText muted size={12} style={styles.pistaRadio}>
              Achicamos el círculo: un gato casi nunca se va más de unas cuadras. Podés ampliarlo
              cuando quieras.
            </AppText>
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
  pistaRadio: {
    paddingTop: spacing.sm,
    lineHeight: 17,
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

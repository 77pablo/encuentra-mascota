import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from '../components/PlatformMap';
import ComunaPickerModal from '../components/ComunaPickerModal';
import { adoptionSchema } from '../schemas/adoption';
import { moderarTextoReporte } from '../lib/moderarTexto';
import { uploadPetPhotos } from '../services/storage';
import { Adoption, createAdoption, AdoptionCreateInput } from '../services/adoptions';
import { useAuth } from '../hooks/useAuth';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { confirmAction, notify } from '../lib/notify';
// F3 — oferta de "Compartir tarjeta" tras publicar en adopción (mismo patrón
// que PublishScreen tras publicar un reporte).
import TarjetaGenerador from '../components/TarjetaGenerador';
import { datosDeAdopcion } from '../lib/tarjeta';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { comunaDeCoords } from '../lib/comunas';
import { AppText, Button, Card, Chip, Input, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Molde: PublishScreen (publicar un reporte). Mismas piezas — fotos, comuna
// autosugerida, moderación de texto, casilla de confirmación de imagen sin
// premarcar — pero para `adoptions` en vez de `pets`: sin estado
// perdida/encontrada, con los campos extra opcionales del spec de adopción
// (edad, tamaño, salud, convivencia, requisitos) como selectores tipo chips.

const especieOptions: { key: 'perro' | 'gato' | 'otro'; label: string }[] = [
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

const edadOptions: { key: 'cachorro' | 'adulto' | 'senior'; label: string }[] = [
  { key: 'cachorro', label: 'Cachorro' },
  { key: 'adulto', label: 'Adulto' },
  { key: 'senior', label: 'Senior' },
];

const tamanoOptions: { key: 'chico' | 'mediano' | 'grande'; label: string }[] = [
  { key: 'chico', label: 'Chico' },
  { key: 'mediano', label: 'Mediano' },
  { key: 'grande', label: 'Grande' },
];

// Tri-estado genérico ('si'|'no'|'no_se'): esterilizado, convive_ninos/perros/gatos.
const triOptions: { key: 'si' | 'no' | 'no_se'; label: string }[] = [
  { key: 'si', label: 'Sí' },
  { key: 'no', label: 'No' },
  { key: 'no_se', label: 'No sé' },
];

// Único campo con set de valores distinto (ver schemas/adoption.ts).
const vacunasOptions: { key: 'al_dia' | 'no' | 'no_se'; label: string }[] = [
  { key: 'al_dia', label: 'Al día' },
  { key: 'no', label: 'No' },
  { key: 'no_se', label: 'No sé' },
];

const MAX_FOTOS = 4;

// Fila de chips para un campo opcional: tocar la opción activa la deselecciona
// (vuelve a "sin especificar"), así ningún tri-estado queda forzado.
function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <View style={styles.fieldBlock}>
      <AppText weight="semi" muted size={13} style={styles.fieldLabel}>
        {label}
      </AppText>
      <View style={styles.chipsRow} accessibilityRole="radiogroup">
        {options.map((o) => (
          <Chip
            key={o.key}
            rol="opcion"
            label={o.label}
            active={value === o.key}
            onPress={() => onChange(value === o.key ? null : o.key)}
          />
        ))}
      </View>
    </View>
  );
}

export default function PublicarAdopcionScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { user } = useAuth();
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro'>('perro');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [edad, setEdad] = useState<'cachorro' | 'adulto' | 'senior' | null>(null);
  const [tamano, setTamano] = useState<'chico' | 'mediano' | 'grande' | null>(null);
  const [esterilizado, setEsterilizado] = useState<'si' | 'no' | 'no_se' | null>(null);
  const [vacunas, setVacunas] = useState<'al_dia' | 'no' | 'no_se' | null>(null);
  const [conviveNinos, setConviveNinos] = useState<'si' | 'no' | 'no_se' | null>(null);
  const [convivePerros, setConvivePerros] = useState<'si' | 'no' | 'no_se' | null>(null);
  const [conviveGatos, setConviveGatos] = useState<'si' | 'no' | 'no_se' | null>(null);
  const [requisitos, setRequisitos] = useState('');
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [coords, setCoords] = useState({ lat: -33.45, lng: -70.66 });
  const [comuna, setComuna] = useState<string | null>(null);
  const [comunaManual, setComunaManual] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- F3: "Compartir tarjeta" tras publicar (mismo patrón que PublishScreen) ---
  const [tarjetaAdopcion, setTarjetaAdopcion] = useState<Adoption | null>(null);
  const tarjetaResolver = useRef<(() => void) | null>(null);

  const ofrecerTarjeta = async (adopcion: Adoption) => {
    const quiere = await confirmAction(
      'Compartir tarjeta',
      '¿Quieres compartir una tarjeta con la foto de esta mascota (para WhatsApp o redes)?',
    );
    if (!quiere) return;
    await new Promise<void>((resolve) => {
      tarjetaResolver.current = resolve;
      setTarjetaAdopcion(adopcion);
    });
  };

  const onTarjetaFin = () => {
    setTarjetaAdopcion(null);
    tarjetaResolver.current?.();
    tarjetaResolver.current = null;
  };
  // --- fin bloque F3 ---

  // Auto-sugerir la comuna desde el punto del mapa, igual que PublishScreen.
  // Se recalcula al mover el pin salvo que el usuario ya la haya fijado a mano.
  useEffect(() => {
    if (comunaManual) return;
    const c = comunaDeCoords(coords.lat, coords.lng);
    if (c && c.nombre !== comuna) setComuna(c.nombre);
  }, [coords, comunaManual, comuna]);

  const elegirComuna = (nombreComuna: string) => {
    setComuna(nombreComuna);
    setComunaManual(true);
  };

  const addFotos = (nuevas: string[]) => {
    if (nuevas.length === 0) return;
    setFotoUris((prev) => [...prev, ...nuevas].slice(0, MAX_FOTOS));
  };

  const onTakePhoto = async () => {
    if (fotoUris.length >= MAX_FOTOS) return;
    const uri = await takePhoto();
    if (uri) addFotos([uri]);
  };

  const onPickFromLibrary = async () => {
    const restantes = MAX_FOTOS - fotoUris.length;
    if (restantes <= 0) return;
    const uris = await pickFromLibrary(restantes);
    addFotos(uris);
  };

  const removeFoto = (uri: string) => {
    setFotoUris((prev) => prev.filter((u) => u !== uri));
  };

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      notify('Sin permiso', 'Puedes mover el pin en el mapa a mano.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  };

  const onSubmit = async () => {
    const parsed = adoptionSchema.safeParse({
      especie,
      nombre,
      descripcion,
      edad: edad ?? undefined,
      tamano: tamano ?? undefined,
      esterilizado: esterilizado ?? undefined,
      vacunas: vacunas ?? undefined,
      convive_ninos: conviveNinos ?? undefined,
      convive_perros: convivePerros ?? undefined,
      convive_gatos: conviveGatos ?? undefined,
      requisitos,
    });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    // Filtro de contenido ANTES de subir las fotos (mismo orden que
    // PublishScreen): si el texto no pasa, no gastamos una subida al bucket.
    // `moderarTextoReporte` solo concatena y revisa los campos que recibe —
    // reutilizamos el slot `raza` (sin uso en adopción) para pasarle
    // `requisitos`, así también queda cubierto por el filtro anti-venta.
    const moderacion = moderarTextoReporte({ nombre, descripcion, raza: requisitos });
    if (!moderacion.ok) {
      notify('Revisá el texto', moderacion.motivo);
      return;
    }
    if (fotoUris.length === 0) {
      notify('Falta la foto', 'Agrega al menos una foto de la mascota.');
      return;
    }
    if (!comuna) {
      notify('Falta la comuna', 'Confirmá la comuna donde está la mascota.');
      return;
    }
    if (!confirmado) {
      notify(
        'Falta confirmar',
        'Marcá la casilla para confirmar que la foto es de la mascota y respeta las reglas.',
      );
      return;
    }
    setSaving(true);
    try {
      const urls = await uploadPetPhotos(fotoUris, user!.id);
      const input: AdoptionCreateInput = { ...parsed.data, lat: coords.lat, lng: coords.lng, comuna };
      const nuevaAdopcion = await createAdoption(input, urls, user!.id);
      notify('¡Publicado!', 'Tu mascota ya aparece en el feed de adopción.');
      await ofrecerTarjeta(nuevaAdopcion);
      navigation.goBack();
    } catch (e: any) {
      notify('No se pudo publicar', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          Publicar en adopción
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Cuéntanos de esta mascota para ayudarla a encontrar un hogar.
        </AppText>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Sobre la mascota
          </Title>
          <View style={styles.chipsRow} accessibilityRole="radiogroup">
            {especieOptions.map((o) => {
              const active = especie === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  activeOpacity={0.8}
                  onPress={() => setEspecie(o.key)}
                  style={[styles.chip, active ? styles.chipActiveBrand : styles.chipInactive]}
                  accessibilityRole="radio"
                  // `aria-checked` además del state: en web, react-native-web 0.21 ya no
                  // traduce `accessibilityState`. Ver RegisterScreen / la casilla de
                  // confirmación más abajo en esta misma pantalla.
                  accessibilityState={{ checked: active }}
                  aria-checked={active}
                >
                  <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                    {o.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          <Input placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} />
          <Input
            placeholder="Describe a la mascota: personalidad, historia, señas…"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />

          {fotoUris.length < MAX_FOTOS ? (
            <View style={styles.photoButtonsRow}>
              <Button
                title="Tomar foto"
                variant="secondary"
                icon="camera"
                onPress={onTakePhoto}
                style={styles.photoButton}
              />
              <Button
                title="Galería"
                variant="secondary"
                icon="image"
                onPress={onPickFromLibrary}
                style={styles.photoButton}
              />
            </View>
          ) : null}
          <AppText muted size={12} style={styles.photoHint}>
            {fotoUris.length}/{MAX_FOTOS} fotos
          </AppText>
          {fotoUris.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
              {fotoUris.map((uri) => (
                <View key={uri} style={styles.photoThumbWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity
                    accessibilityLabel="Quitar foto"
                    activeOpacity={0.8}
                    onPress={() => removeFoto(uri)}
                    style={styles.photoRemove}
                  >
                    <Ionicons name="close" size={14} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Más datos (opcional)
          </Title>
          <OptionRow label="Edad" options={edadOptions} value={edad} onChange={setEdad} />
          <OptionRow label="Tamaño" options={tamanoOptions} value={tamano} onChange={setTamano} />
          <OptionRow
            label="Esterilizado"
            options={triOptions}
            value={esterilizado}
            onChange={setEsterilizado}
          />
          <OptionRow label="Vacunas" options={vacunasOptions} value={vacunas} onChange={setVacunas} />
          <OptionRow
            label="Convive bien con niños"
            options={triOptions}
            value={conviveNinos}
            onChange={setConviveNinos}
          />
          <OptionRow
            label="Convive bien con perros"
            options={triOptions}
            value={convivePerros}
            onChange={setConvivePerros}
          />
          <OptionRow
            label="Convive bien con gatos"
            options={triOptions}
            value={conviveGatos}
            onChange={setConviveGatos}
          />
          <Input
            placeholder="Requisitos para adoptarla (opcional)"
            value={requisitos}
            onChangeText={setRequisitos}
            multiline
          />
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            ¿Dónde está?
          </Title>
          <AppText muted size={13} style={styles.helper}>
            Toca el mapa o arrastra el pin para ajustar el punto. La ubicación exacta nunca se
            muestra.
          </AppText>
          <Button
            title="Usar mi ubicación"
            variant="secondary"
            icon="location"
            onPress={useMyLocation}
            style={styles.actionButton}
          />
          <MapView
            style={styles.map}
            region={{ latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
            onPress={(e) =>
              setCoords({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })
            }
          >
            <Marker
              draggable
              coordinate={{ latitude: coords.lat, longitude: coords.lng }}
              onDragEnd={(e) =>
                setCoords({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })
              }
            />
          </MapView>

          <View style={styles.comunaRow}>
            <Ionicons name="business-outline" size={18} color={colors.brand} />
            <AppText size={14} style={styles.comunaLabel}>
              Comuna: <AppText weight="bold" size={14}>{comuna ?? 'sin detectar'}</AppText>
            </AppText>
            <Button
              title="Cambiar"
              variant="ghost"
              onPress={() => setSelectorOpen(true)}
              style={styles.comunaCambiar}
            />
          </View>
        </Card>

        {/* Casilla de confirmación, sin premarcar. Mismo patrón que
            PublishScreen/RegisterScreen: la persona atestigua que la foto es
            de la mascota y respeta las reglas; el resto lo cubre denunciar +
            retiro rápido. */}
        <TouchableOpacity
          style={styles.confirmRow}
          onPress={() => setConfirmado((v) => !v)}
          accessibilityRole="checkbox"
          // `aria-checked` además del state: en web, react-native-web 0.21 ya no
          // traduce `accessibilityState`. Ver RegisterScreen.
          accessibilityState={{ checked: confirmado }}
          aria-checked={confirmado}
          accessibilityLabel="Confirmo que la foto es de la mascota y respeta las reglas"
        >
          <Ionicons
            name={confirmado ? 'checkbox-outline' : 'square-outline'}
            size={22}
            color={confirmado ? colors.brand : colors.muted}
          />
          <AppText size={13} style={styles.confirmText}>
            Confirmo que la foto es de la mascota y que la publicación respeta las{' '}
            <AppText
              size={13}
              weight="bold"
              style={styles.confirmLink}
              onPress={() => navigation.navigate('Perfil', { screen: 'Legal' })}
            >
              reglas de la comunidad
            </AppText>
            .
          </AppText>
        </TouchableOpacity>

        <Button
          title="Publicar"
          icon="paw"
          onPress={onSubmit}
          disabled={saving}
          loading={saving}
          style={styles.submitButton}
        />
      </ScrollView>

      <ComunaPickerModal
        visible={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={elegirComuna}
      />

      {tarjetaAdopcion && (
        <TarjetaGenerador datos={datosDeAdopcion(tarjetaAdopcion)} onFin={onTarjetaFin} />
      )}
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  pageTitle: {
    marginBottom: spacing.xs,
  },
  pageSubtitle: {
    marginBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  fieldBlock: {
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipInactive: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  chipActiveBrand: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  actionButton: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  photoButton: {
    flex: 1,
  },
  photoHint: {
    marginTop: spacing.xs,
  },
  photoRow: {
    marginTop: spacing.sm,
  },
  photoThumbWrap: {
    marginRight: spacing.sm,
    position: 'relative',
  },
  photoThumb: {
    width: 90,
    height: 90,
    borderRadius: radius.md,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    marginBottom: spacing.xs,
  },
  comunaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  comunaLabel: {
    flex: 1,
  },
  comunaCambiar: {
    paddingHorizontal: spacing.sm,
  },
  map: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  confirmText: {
    flex: 1,
    lineHeight: 19,
  },
  confirmLink: {
    color: colors.brandDark,
    textDecorationLine: 'underline',
  },
  submitButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});

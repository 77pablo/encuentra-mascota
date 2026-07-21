import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from '../components/PlatformMap';
import ComunaPickerModal from '../components/ComunaPickerModal';
import { petSchema } from '../schemas/pet';
import { moderarTextoReporte } from '../lib/moderarTexto';
import { uploadPetPhotos } from '../services/storage';
import { createPet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { notify } from '../lib/notify';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { comunaDeCoords, comunasCercanas } from '../lib/comunas';
import { AppText, AvisoEstafa, Button, Card, Chip, Input, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const estadoOptions: { key: 'perdida' | 'encontrada'; label: string; color: string }[] = [
  { key: 'perdida', label: 'Perdida', color: colors.lost },
  { key: 'encontrada', label: 'Encontrada', color: colors.found },
];

const especieOptions: { key: 'perro' | 'gato' | 'otro'; label: string }[] = [
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

const MAX_FOTOS = 4;

export default function PublishScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const params = route?.params ?? {};
  const [estado, setEstado] = useState<'perdida' | 'encontrada'>(
    params.estado === 'perdida' || params.estado === 'encontrada' ? params.estado : 'perdida',
  );
  // Pre-carga opcional al reportar desde una ficha "Mi mascota" (Función 2).
  const especieParam =
    params.especie === 'perro' || params.especie === 'gato' || params.especie === 'otro'
      ? params.especie
      : 'perro';
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro'>(especieParam);
  const [raza, setRaza] = useState(typeof params.raza === 'string' ? params.raza : '');
  const [nombre, setNombre] = useState(typeof params.nombre === 'string' ? params.nombre : '');
  const [descripcion, setDescripcion] = useState(
    typeof params.descripcion === 'string' ? params.descripcion : '',
  );
  const [recompensa, setRecompensa] = useState('');
  const [fotoUris, setFotoUris] = useState<string[]>(
    typeof params.fotoUri === 'string' ? [params.fotoUri] : [],
  );
  // Vínculo con la ficha de origen, para que createPet lo guarde.
  const origenMyPet: string | null = typeof params.origenMyPet === 'string' ? params.origenMyPet : null;
  const [coords, setCoords] = useState({ lat: -33.45, lng: -70.66 });
  const [comuna, setComuna] = useState<string | null>(null);
  const [comunasAlcance, setComunasAlcance] = useState<string[]>([]);
  const [comunaManual, setComunaManual] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-sugerir la comuna desde el punto del mapa. Se recalcula cuando el
  // usuario mueve el pin, salvo que ya la haya fijado a mano. Al cambiar la
  // comuna "casa", se limpia el alcance (las vecinas de antes ya no aplican).
  useEffect(() => {
    if (comunaManual) return;
    const c = comunaDeCoords(coords.lat, coords.lng);
    if (c && c.nombre !== comuna) {
      setComuna(c.nombre);
      setComunasAlcance([]);
    }
  }, [coords, comunaManual, comuna]);

  const elegirComuna = (nombre: string) => {
    setComuna(nombre);
    setComunaManual(true);
    setComunasAlcance([]);
  };

  const toggleAlcance = (nombre: string) => {
    setComunasAlcance((prev) =>
      prev.includes(nombre) ? prev.filter((n) => n !== nombre) : [...prev, nombre],
    );
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
    const parsed = petSchema.safeParse({
      estado,
      especie,
      raza,
      nombre,
      descripcion,
      recompensa,
      comuna: comuna ?? undefined,
      comunas_alcance: comunasAlcance,
      ...coords,
    });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    // Filtro de contenido ANTES de subir las fotos: si el texto no pasa, no
    // gastamos una subida al bucket. Ver src/lib/moderarTexto.ts.
    const moderacion = moderarTextoReporte({ nombre, raza, descripcion, recompensa });
    if (!moderacion.ok) {
      notify('Revisá el texto', moderacion.motivo);
      return;
    }
    if (fotoUris.length === 0) {
      notify('Falta la foto', 'Agrega al menos una foto de la mascota.');
      return;
    }
    if (!comuna) {
      notify('Falta la comuna', 'Confirmá la comuna del reporte.');
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
      await createPet(parsed.data, urls, user!.id, origenMyPet);
      notify('¡Publicado!', 'Tu reporte ya aparece en el mapa.');
      navigation.navigate('Mapa');
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
          Publicar un reporte
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Completa los datos y ayúdanos a encontrar a esta mascota.
        </AppText>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            ¿Qué pasó?
          </Title>
          <View style={styles.chipsRow}>
            {estadoOptions.map((o) => {
              const active = estado === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  activeOpacity={0.8}
                  onPress={() => setEstado(o.key)}
                  style={[
                    styles.chip,
                    active ? { backgroundColor: o.color, borderColor: o.color } : styles.chipInactive,
                  ]}
                >
                  <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                    {o.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Sobre la mascota
          </Title>
          <View style={styles.chipsRow}>
            {especieOptions.map((o) => {
              const active = especie === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  activeOpacity={0.8}
                  onPress={() => setEspecie(o.key)}
                  style={[styles.chip, active ? styles.chipActiveBrand : styles.chipInactive]}
                >
                  <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                    {o.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          <Input placeholder="Raza (opcional)" value={raza} onChangeText={setRaza} />
          <Input placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} />
          <Input
            placeholder="Señas: color, tamaño, collar…"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />
          <Input placeholder="Recompensa (opcional)" value={recompensa} onChangeText={setRecompensa} />
          {recompensa.trim().length > 0 ? <AvisoEstafa variante="recompensa" /> : null}

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
            ¿Dónde?
          </Title>
          <AppText muted size={13} style={styles.helper}>
            Toca el mapa o arrastra el pin para ajustar el punto exacto.
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

          {comuna && comunasCercanas(comuna, 4).length > 0 ? (
            <>
              <AppText muted size={12} style={styles.helper}>
                Sumá comunas vecinas para que tu reporte llegue a más gente (opcional):
              </AppText>
              <View style={styles.chipsRow}>
                {comunasCercanas(comuna, 4).map((v) => (
                  <Chip
                    key={v.nombre}
                    label={v.nombre}
                    active={comunasAlcance.includes(v.nombre)}
                    onPress={() => toggleAlcance(v.nombre)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </Card>

        {/* Casilla de confirmación, sin premarcar. Es el control de imagen que
            eligió el usuario en vez de moderación por IA: la persona atestigua
            que la foto es de la mascota y respeta las reglas; el resto lo cubre
            denunciar + retiro rápido. Mismo patrón que RegisterScreen. */}
        <TouchableOpacity
          style={styles.confirmRow}
          onPress={() => setConfirmado((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmado }}
          accessibilityLabel="Confirmo que la foto es de la mascota y respeta las reglas"
        >
          <Ionicons
            name={confirmado ? 'checkbox-outline' : 'square-outline'}
            size={22}
            color={confirmado ? colors.brand : colors.muted}
          />
          <AppText size={13} style={styles.confirmText}>
            Confirmo que la foto es de la mascota y que el reporte respeta las{' '}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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

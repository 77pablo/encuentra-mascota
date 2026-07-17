import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from '../components/PlatformMap';
import { petSchema } from '../schemas/pet';
import { uploadPetPhotos } from '../services/storage';
import { createPet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';
import { notify } from '../lib/notify';
import { AppText, Button, Card, Input, Screen, Title } from '../ui';
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

export default function PublishScreen({ navigation }: any) {
  const { user } = useAuth();
  const [estado, setEstado] = useState<'perdida' | 'encontrada'>('perdida');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro'>('perro');
  const [raza, setRaza] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [recompensa, setRecompensa] = useState('');
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [coords, setCoords] = useState({ lat: -33.45, lng: -70.66 });
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const restantes = MAX_FOTOS - fotoUris.length;
    if (restantes <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: restantes,
    });
    if (!res.canceled) {
      const nuevas = res.assets.map((a) => a.uri);
      setFotoUris((prev) => [...prev, ...nuevas].slice(0, MAX_FOTOS));
    }
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
    const parsed = petSchema.safeParse({ estado, especie, raza, nombre, descripcion, recompensa, ...coords });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    if (fotoUris.length === 0) {
      notify('Falta la foto', 'Agrega al menos una foto de la mascota.');
      return;
    }
    setSaving(true);
    try {
      const urls = await uploadPetPhotos(fotoUris, user!.id);
      await createPet(parsed.data, urls, user!.id);
      notify('¡Publicado!', 'Tu reporte ya aparece en el mapa.');
      navigation.navigate('Mapa');
    } catch (e: any) {
      notify('Error al publicar', e.message ?? 'Intenta de nuevo.');
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

          {fotoUris.length < MAX_FOTOS ? (
            <Button
              title={fotoUris.length === 0 ? 'Elegir fotos' : 'Agregar otra foto'}
              variant="secondary"
              icon="image"
              onPress={pickImage}
              style={styles.actionButton}
            />
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
        </Card>

        <Button
          title="Publicar"
          icon="paw"
          onPress={onSubmit}
          disabled={saving}
          loading={saving}
          style={styles.submitButton}
        />
      </ScrollView>
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
    marginBottom: spacing.xs,
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
  map: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  submitButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});

import React, { useState, useEffect } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import MapView, { Marker } from '../components/PlatformMap';
import { addSighting } from '../services/sightings';
import { uploadPetPhoto } from '../services/storage';
import { useAuth } from '../hooks/useAuth';
import { useMyLocation } from '../hooks/useMyLocation';
import { notify } from '../lib/notify';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { AppText, Button, Card, Input, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

// Pantalla para reportar "lo vi por acá": elegir el punto en el mapa (o usar mi
// ubicación), una nota opcional y una foto opcional. El pin arranca en el punto
// del reporte para que la persona lo mueva a donde vio a la mascota.
export default function AddSightingScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const { petId, petLat, petLng } = route.params;
  const location = useMyLocation();
  const [coords, setCoords] = useState({ lat: petLat, lng: petLng });
  // petLat/petLng ya vienen difuminadas (createPet las difumina al crear el
  // reporte). Si el usuario no toca el mapa, hay que mandarlas tal cual: si
  // addSighting las difuminara otra vez, el avistamiento se alejaria hasta
  // otros ~250m del pin sin que la persona lo haya pedido. En cambio, apenas
  // el usuario usa su ubicacion real o mueve el pin a mano, esa coordenada es
  // "cruda" y siempre se tiene que difuminar. pinMovido distingue los dos casos.
  const [pinMovido, setPinMovido] = useState(false);
  const [nota, setNota] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reusamos useMyLocation: nunca lanza (maneja permiso y errores de GPS adentro).
  const usarMiUbicacion = () => {
    location.request();
  };
  useEffect(() => {
    if (location.coords) {
      setCoords(location.coords);
      setPinMovido(true);
    }
  }, [location.coords]);
  useEffect(() => {
    if (location.status === 'denied') {
      notify('Sin ubicación', 'Puedes mover el pin en el mapa a mano.');
    }
  }, [location.status]);

  const onTakePhoto = async () => {
    const uri = await takePhoto();
    if (uri) setFotoUri(uri);
  };

  const onPickFromLibrary = async () => {
    const uris = await pickFromLibrary(1);
    if (uris[0]) setFotoUri(uris[0]);
  };

  const onSubmit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let foto: string | null = null;
      if (fotoUri) {
        foto = await uploadPetPhoto(fotoUri, user.id);
      }
      await addSighting({
        pet_id: petId,
        user_id: user.id,
        lat: coords.lat,
        lng: coords.lng,
        nota: nota.trim() || null,
        foto,
        // Si el pin no se movio, coords sigue siendo petLat/petLng: ya vienen
        // difuminadas y no hay que difuminarlas de nuevo.
        yaDifuminado: !pinMovido,
      });
      notify('¡Gracias!', 'Sumaste una pista al rastro de esta mascota.');
      navigation.goBack();
    } catch (e: any) {
      notify('No se pudo enviar', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          ¿Dónde lo viste?
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Toca el mapa o arrastra el pin al lugar donde viste a la mascota. Tu pista ayuda a acercar el reencuentro.
        </AppText>

        <Card style={styles.section}>
          <Button
            title="Usar mi ubicación"
            variant="secondary"
            icon="location"
            onPress={usarMiUbicacion}
            style={styles.actionButton}
          />
          <MapView
            style={styles.map}
            region={{
              latitude: coords.lat,
              longitude: coords.lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            onPress={(e: any) => {
              setCoords({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              });
              setPinMovido(true);
            }}
          >
            <Marker
              draggable
              coordinate={{ latitude: coords.lat, longitude: coords.lng }}
              onDragEnd={(e: any) => {
                setCoords({
                  lat: e.nativeEvent.coordinate.latitude,
                  lng: e.nativeEvent.coordinate.longitude,
                });
                setPinMovido(true);
              }}
            />
          </MapView>
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            ¿Algo que contar? (opcional)
          </Title>
          <Input
            placeholder="Iba hacia el parque, tenía un collar rojo…"
            value={nota}
            onChangeText={setNota}
            multiline
          />

          {fotoUri ? (
            <View style={styles.photoThumbWrap}>
              <Image source={{ uri: fotoUri }} style={styles.photoThumb} />
              <TouchableOpacity
                accessibilityLabel="Quitar foto"
                activeOpacity={0.8}
                onPress={() => setFotoUri(null)}
                style={styles.photoRemove}
              >
                <Ionicons name="close" size={14} color={colors.white} />
              </TouchableOpacity>
            </View>
          ) : (
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
          )}
        </Card>

        <Button
          title="Enviar avistamiento"
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
    marginBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  actionButton: {
    alignSelf: 'stretch',
  },
  map: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  photoButton: {
    flex: 1,
  },
  photoThumbWrap: {
    marginTop: spacing.sm,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  photoThumb: {
    width: 120,
    height: 120,
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
  submitButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});

import React, { useState } from 'react';
import { Button, Image, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker } from '../components/PlatformMap';
import { petSchema } from '../schemas/pet';
import { uploadPetPhoto } from '../services/storage';
import { createPet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';
import { notify } from '../lib/notify';

export default function PublishScreen({ navigation }: any) {
  const { user } = useAuth();
  const [estado, setEstado] = useState<'perdida' | 'encontrada'>('perdida');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro'>('perro');
  const [raza, setRaza] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [recompensa, setRecompensa] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [coords, setCoords] = useState({ lat: -33.45, lng: -70.66 });
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!res.canceled) setFotoUri(res.assets[0].uri);
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
    if (!fotoUri) {
      notify('Falta la foto', 'Agrega al menos una foto de la mascota.');
      return;
    }
    setSaving(true);
    try {
      const url = await uploadPetPhoto(fotoUri, user!.id);
      await createPet(parsed.data, [url], user!.id);
      notify('¡Publicado!', 'Tu reporte ya aparece en el mapa.');
      navigation.navigate('Mapa');
    } catch (e: any) {
      notify('Error al publicar', e.message ?? 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={estado === 'perdida' ? '● Perdida' : 'Perdida'} onPress={() => setEstado('perdida')} />
        <Button title={estado === 'encontrada' ? '● Encontrada' : 'Encontrada'} onPress={() => setEstado('encontrada')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={especie === 'perro' ? '● Perro' : 'Perro'} onPress={() => setEspecie('perro')} />
        <Button title={especie === 'gato' ? '● Gato' : 'Gato'} onPress={() => setEspecie('gato')} />
        <Button title={especie === 'otro' ? '● Otro' : 'Otro'} onPress={() => setEspecie('otro')} />
      </View>
      <TextInput placeholder="Raza (opcional)" value={raza} onChangeText={setRaza} style={inputStyle} />
      <TextInput placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} style={inputStyle} />
      <TextInput placeholder="Señas: color, tamaño, collar…" value={descripcion} onChangeText={setDescripcion}
        multiline style={[inputStyle, { height: 90 }]} />
      <TextInput placeholder="Recompensa (opcional)" value={recompensa} onChangeText={setRecompensa} style={inputStyle} />
      <Button title="Elegir foto 📸" onPress={pickImage} />
      {fotoUri && <Image source={{ uri: fotoUri }} style={{ height: 180, borderRadius: 8 }} />}
      <Text style={{ fontWeight: '600' }}>Ubicación (mueve el pin):</Text>
      <Button title="Usar mi ubicación 📍" onPress={useMyLocation} />
      <MapView style={{ height: 200, borderRadius: 8 }}
        region={{ latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        onPress={(e) => setCoords({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}>
        <Marker draggable coordinate={{ latitude: coords.lat, longitude: coords.lng }}
          onDragEnd={(e) => setCoords({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })} />
      </MapView>
      <Button title={saving ? 'Publicando…' : 'Publicar'} onPress={onSubmit} disabled={saving} />
    </ScrollView>
  );
}

const inputStyle = { borderWidth: 1, borderRadius: 8, padding: 12 } as const;

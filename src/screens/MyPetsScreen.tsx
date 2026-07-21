import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { uploadPetPhoto } from '../services/storage';
import { moderarTextoReporte } from '../lib/moderarTexto';
import { myPetSchema } from '../schemas/myPet';
import {
  createMyPet,
  deleteMyPet,
  listMyPets,
  MyPet,
  updateMyPet,
} from '../services/myPets';
import { collarUrl } from '../lib/collarTag';
import CollarTag from '../components/CollarTag';
import { AppText, Button, Card, EmptyState, Input, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<MyPet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const especieOptions: { key: 'perro' | 'gato' | 'otro'; label: string }[] = [
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

// Foto ya subida al bucket (URL http) vs. una recién elegida (uri local que hay
// que subir). Solo se sube lo local.
function esRemota(uri: string | null): boolean {
  return !!uri && /^https?:\/\//.test(uri);
}

export default function MyPetsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [fichas, setFichas] = useState<MyPet[]>([]);
  const [loading, setLoading] = useState(true);

  // Form inline (alta o edición). `editId` null = alta nueva.
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro'>('perro');
  const [raza, setRaza] = useState('');
  const [senas, setSenas] = useState('');
  const [chip, setChip] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Ficha para la que se está generando la etiqueta de collar (monta CollarTag).
  const [collarPet, setCollarPet] = useState<MyPet | null>(null);
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listMyPets(user.id)
      .then(setFichas)
      .catch((e) => notify('No se pudo cargar', mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useFocusEffect(cargar);

  const abrirNueva = () => {
    setEditId(null);
    setNombre('');
    setEspecie('perro');
    setRaza('');
    setSenas('');
    setChip('');
    setFotoUri(null);
    setFormOpen(true);
  };

  const abrirEditar = (ficha: MyPet) => {
    setEditId(ficha.id);
    setNombre(ficha.nombre);
    setEspecie(ficha.especie);
    setRaza(ficha.raza ?? '');
    setSenas(ficha.senas ?? '');
    setChip(ficha.chip ?? '');
    setFotoUri(ficha.foto ?? null);
    setFormOpen(true);
  };

  const onTakePhoto = async () => {
    const uri = await takePhoto();
    if (uri) setFotoUri(uri);
  };

  const onPickFromLibrary = async () => {
    const uris = await pickFromLibrary(1);
    if (uris[0]) setFotoUri(uris[0]);
  };

  const guardar = async () => {
    const parsed = myPetSchema.safeParse({ nombre, especie, raza, senas, chip });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    // Mismo filtro de contenido que un reporte: nombre, raza y señas son texto libre.
    const moderacion = moderarTextoReporte({ nombre, raza, descripcion: senas || nombre, recompensa: '' });
    if (!moderacion.ok) {
      notify('Revisá el texto', moderacion.motivo);
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      // Solo subimos si la foto es nueva (uri local). Una foto remota ya vive en
      // el bucket y se reusa tal cual.
      let fotoUrl: string | null = fotoUri;
      if (fotoUri && !esRemota(fotoUri)) {
        fotoUrl = await uploadPetPhoto(fotoUri, user.id);
      }

      if (editId) {
        await updateMyPet(editId, {
          nombre,
          especie,
          raza,
          senas,
          chip,
          foto: fotoUrl,
        });
        notify('Listo', 'Actualizamos la ficha de tu mascota.');
      } else {
        await createMyPet(parsed.data, fotoUrl, user.id);
        notify('¡Guardada!', 'Ya tenés la ficha de tu mascota lista.');
      }
      setFormOpen(false);
      cargar();
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  const borrar = async (ficha: MyPet) => {
    const ok = await confirmAction(
      `¿Borrar la ficha de ${ficha.nombre}?`,
      'Se borrará la ficha y su etiqueta de collar dejará de funcionar. Esta acción no se puede deshacer.',
    );
    if (!ok || !user) return;
    try {
      await deleteMyPet(ficha.id, user.id);
      notify('Borrada', 'La ficha se eliminó.');
      cargar();
    } catch (e: any) {
      notify('No se pudo borrar', mensajeDeErrorDb(e));
    }
  };

  // Reportar como perdida EN UN TOQUE: lleva a Publicar con todo pre-cargado y el
  // vínculo con la ficha (origenMyPet) para que la RPC del collar sepa que está
  // perdida.
  const reportarPerdida = (ficha: MyPet) => {
    navigation.navigate('Publicar', {
      estado: 'perdida',
      especie: ficha.especie,
      raza: ficha.raza ?? '',
      nombre: ficha.nombre,
      descripcion: ficha.senas ?? '',
      origenMyPet: ficha.id,
      fotoUri: ficha.foto ?? undefined,
    });
  };

  const generarCollar = (ficha: MyPet) => {
    // Sin base web configurada el QR no llevaría a ningún lado: avisamos en vez
    // de generar una placa muerta.
    if (!collarUrl(ficha.collar_token)) {
      notify(
        'Falta configurar la web',
        'La etiqueta necesita la dirección pública de la app. Intentá desde la versión web.',
      );
      return;
    }
    setGenerando(true);
    setCollarPet(ficha);
  };

  if (loading) return <Loading />;

  if (formOpen) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Title size={22} style={styles.pageTitle}>
            {editId ? 'Editar ficha' : 'Nueva mascota'}
          </Title>

          <Card style={styles.section}>
            {fotoUri ? (
              <View style={styles.fotoWrap}>
                <Image source={{ uri: fotoUri }} style={styles.foto} />
                <TouchableOpacity
                  accessibilityLabel="Quitar foto"
                  activeOpacity={0.8}
                  onPress={() => setFotoUri(null)}
                  style={styles.fotoRemove}
                >
                  <Ionicons name="close" size={16} color={colors.white} />
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.photoButtonsRow}>
              <Button title="Tomar foto" variant="secondary" icon="camera" onPress={onTakePhoto} style={styles.photoButton} />
              <Button title="Galería" variant="secondary" icon="image" onPress={onPickFromLibrary} style={styles.photoButton} />
            </View>

            <Input label="Nombre" placeholder="Pelusa" value={nombre} onChangeText={setNombre} />

            <AppText weight="semi" muted size={13} style={styles.label}>
              Especie
            </AppText>
            <View style={styles.chipsRow}>
              {especieOptions.map((o) => {
                const active = especie === o.key;
                return (
                  <TouchableOpacity
                    key={o.key}
                    activeOpacity={0.8}
                    onPress={() => setEspecie(o.key)}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                  >
                    <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                      {o.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Input label="Raza (opcional)" placeholder="Quiltro" value={raza} onChangeText={setRaza} />
            <Input
              label="Señas particulares (opcional)"
              placeholder="Color, tamaño, cicatrices, collar…"
              value={senas}
              onChangeText={setSenas}
              multiline
            />
            <Input
              label="N° de microchip (opcional)"
              placeholder="981..."
              value={chip}
              onChangeText={setChip}
            />
          </Card>

          <Button
            title={editId ? 'Guardar cambios' : 'Guardar mascota'}
            icon="paw"
            onPress={guardar}
            loading={saving}
            disabled={saving}
            style={styles.saveButton}
          />
          <Button title="Cancelar" variant="ghost" onPress={() => setFormOpen(false)} disabled={saving} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          Mis mascotas
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Registrá a tu mascota una vez. Si algún día se pierde, la publicás en un toque, y con
          su etiqueta de collar cualquiera que la encuentre puede avisarte.
        </AppText>

        {fichas.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration
              title="Todavía no registraste ninguna"
              subtitle="Agregá a tu mascota para tener su ficha y su placa de collar listas."
            />
          </View>
        ) : (
          <View style={styles.list}>
            {fichas.map((ficha) => (
              <Card key={ficha.id} style={styles.fichaCard}>
                <View style={styles.fichaHeader}>
                  {ficha.foto ? (
                    <Image source={{ uri: ficha.foto }} style={styles.fichaFoto} />
                  ) : (
                    <View style={[styles.fichaFoto, styles.fichaFotoPlaceholder]}>
                      <AppText size={28}>🐾</AppText>
                    </View>
                  )}
                  <View style={styles.fichaInfo}>
                    <Title size={18}>{ficha.nombre}</Title>
                    <AppText muted size={13}>
                      {especieLabel[ficha.especie]}
                      {ficha.raza ? ` · ${ficha.raza}` : ''}
                    </AppText>
                  </View>
                  <View style={styles.fichaActions}>
                    <TouchableOpacity accessibilityLabel="Editar" onPress={() => abrirEditar(ficha)} style={styles.iconBtn}>
                      <Ionicons name="create-outline" size={20} color={colors.brand} />
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityLabel="Borrar" onPress={() => borrar(ficha)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={20} color={colors.lost} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Button
                  title="Reportar como perdida"
                  icon="alert-circle"
                  variant="danger"
                  onPress={() => reportarPerdida(ficha)}
                  style={styles.fichaButton}
                />
                <Button
                  title="Etiqueta de collar"
                  icon="qr-code"
                  variant="secondary"
                  onPress={() => generarCollar(ficha)}
                  disabled={generando}
                  loading={generando && collarPet?.id === ficha.id}
                  style={styles.fichaButton}
                />
              </Card>
            ))}
          </View>
        )}

        <Button
          title="Agregar mascota"
          icon="add"
          onPress={abrirNueva}
          style={styles.addButton}
        />
      </ScrollView>

      {collarPet ? (
        <CollarTag
          pet={collarPet}
          onDone={() => {
            setCollarPet(null);
            setGenerando(false);
          }}
          onError={(m) => {
            setCollarPet(null);
            setGenerando(false);
            notify('No se pudo generar', m);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  pageTitle: { marginBottom: spacing.xs },
  pageSubtitle: { marginBottom: spacing.sm },
  section: { gap: spacing.sm },
  label: { marginBottom: spacing.xs },
  emptyWrap: { paddingVertical: spacing.xxxl },
  list: { gap: spacing.md },
  fichaCard: { gap: spacing.sm },
  fichaHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fichaFoto: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.sky },
  fichaFotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  fichaInfo: { flex: 1 },
  fichaActions: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: { padding: spacing.xs },
  fichaButton: { alignSelf: 'stretch', marginTop: spacing.xs },
  addButton: { alignSelf: 'stretch', marginTop: spacing.md },
  saveButton: { alignSelf: 'stretch', marginTop: spacing.sm },
  fotoWrap: { alignSelf: 'center', position: 'relative', marginBottom: spacing.sm },
  foto: { width: 140, height: 140, borderRadius: radius.md, backgroundColor: colors.sky },
  fotoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtonsRow: { flexDirection: 'row', gap: spacing.sm },
  photoButton: { flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipInactive: { backgroundColor: colors.card, borderColor: colors.line },
});

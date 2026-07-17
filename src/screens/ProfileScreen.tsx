import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { closePet, deletePet, listMyReports, Pet } from '../services/pets';
import { getMyProfile, Profile, updateMyProfile } from '../services/profile';
import { uploadPetPhoto } from '../services/storage';
import { useAuth } from '../hooks/useAuth';
import { confirmAction, notify } from '../lib/notify';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { timeAgo } from '../lib/time';
import { AppText, Badge, Button, Card, Confetti, EmptyState, Input, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

export default function ProfileScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mis, setMis] = useState<Pet[]>([]);
  const [reunidas, setReunidas] = useState<Pet[]>([]);
  const [celebrating, setCelebrating] = useState(false);

  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nombreDraft, setNombreDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const cargar = useCallback(() => {
    if (!user) return;
    getMyProfile(user.id)
      .then(setProfile)
      .catch(() => {});
    listMyReports(user.id, true)
      .then(setMis)
      .catch(() => {});
    listMyReports(user.id, false)
      .then(setReunidas)
      .catch(() => {});
  }, [user]);

  useFocusEffect(cargar);

  const marcar = async (id: string) => {
    await closePet(id);
    setCelebrating(true);
    notify('¡Genial!', 'Reporte cerrado.');
    cargar();
  };

  const editar = (item: Pet) => {
    navigation.navigate('EditPet', { pet: item });
  };

  const borrar = async (id: string) => {
    const ok = await confirmAction('¿Borrar reporte?', 'Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await deletePet(id);
      notify('Borrado', 'El reporte se eliminó.');
      cargar();
    } catch (e: any) {
      notify('Error', e?.message ?? 'No se pudo borrar.');
    }
  };

  const aplicarFotoPerfil = async (uri: string) => {
    if (!user) return;
    setPhotoMenuOpen(false);
    setUploadingPhoto(true);
    try {
      const url = await uploadPetPhoto(uri, user.id);
      await updateMyProfile(user.id, { foto_perfil: url });
      notify('Listo', 'Tu foto de perfil se actualizó.');
      cargar();
    } catch (e: any) {
      notify('Error', e?.message ?? 'No se pudo subir la foto.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onTakeAvatarPhoto = async () => {
    const uri = await takePhoto();
    if (uri) await aplicarFotoPerfil(uri);
  };

  const onPickAvatarFromLibrary = async () => {
    const uris = await pickFromLibrary(1);
    if (uris[0]) await aplicarFotoPerfil(uris[0]);
  };

  const empezarEdicionNombre = () => {
    setNombreDraft(profile?.nombre ?? '');
    setEditingName(true);
  };

  const guardarNombre = async () => {
    if (!user) return;
    const nombre = nombreDraft.trim();
    if (!nombre) {
      notify('Falta el nombre', 'Escribe tu nombre.');
      return;
    }
    setSavingName(true);
    try {
      await updateMyProfile(user.id, { nombre });
      notify('Guardado', 'Tu nombre se actualizó.');
      setEditingName(false);
      cargar();
    } catch (e: any) {
      notify('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSavingName(false);
    }
  };

  const inicial = user?.email ? user.email.charAt(0).toUpperCase() : '🐾';
  const tieneNombre = !!profile?.nombre?.trim();
  const nombreMostrado = tieneNombre ? (profile!.nombre as string) : user?.email ?? '';

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={uploadingPhoto}
            onPress={() => setPhotoMenuOpen((v) => !v)}
            style={styles.avatarWrap}
          >
            <View style={styles.avatar}>
              {profile?.foto_perfil ? (
                <Image source={{ uri: profile.foto_perfil }} style={styles.avatarImage} />
              ) : (
                <AppText weight="bold" size={22} color={colors.brand}>
                  {inicial}
                </AppText>
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={13} color={colors.white} />
            </View>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <AppText weight="bold" size={16}>
              {nombreMostrado}
            </AppText>
            {tieneNombre ? (
              <AppText muted size={13}>
                {user?.email}
              </AppText>
            ) : null}
          </View>
        </View>

        {uploadingPhoto ? (
          <AppText muted size={13} style={styles.helperLine}>
            Subiendo foto…
          </AppText>
        ) : null}

        {photoMenuOpen ? (
          <View style={styles.photoButtonsRow}>
            <Button
              title="Tomar foto"
              variant="secondary"
              icon="camera"
              onPress={onTakeAvatarPhoto}
              style={styles.photoButton}
            />
            <Button
              title="Galería"
              variant="secondary"
              icon="image"
              onPress={onPickAvatarFromLibrary}
              style={styles.photoButton}
            />
          </View>
        ) : null}

        <Card style={styles.editCard}>
          {editingName ? (
            <>
              <Input label="Tu nombre" value={nombreDraft} onChangeText={setNombreDraft} placeholder="¿Cómo te llamas?" />
              <View style={styles.editActionsRow}>
                <Button
                  title="Guardar"
                  icon="checkmark"
                  onPress={guardarNombre}
                  loading={savingName}
                  disabled={savingName}
                  style={styles.editActionButton}
                />
                <Button
                  title="Cancelar"
                  variant="ghost"
                  onPress={() => setEditingName(false)}
                  disabled={savingName}
                  style={styles.editActionButton}
                />
              </View>
            </>
          ) : (
            <Button
              title="Editar perfil"
              variant="ghost"
              icon="create"
              onPress={empezarEdicionNombre}
              style={styles.editProfileButton}
            />
          )}
        </Card>

        <Title size={16} style={styles.sectionTitle}>
          Mis reportes activos
        </Title>
        {mis.length === 0 ? (
          <EmptyState
            emoji="🐾"
            title="No tienes reportes activos"
            subtitle="Cuando publiques una mascota, aparece aquí."
          />
        ) : (
          <View style={styles.list}>
            {mis.map((item) => (
              <Card key={item.id} style={styles.reportCard}>
                <Badge estado={item.estado} />
                <AppText weight="semi" size={14} style={styles.reportTitle}>
                  {especieLabel[item.especie]}
                </AppText>
                <AppText muted size={13} style={styles.reportDescription}>
                  {item.descripcion.slice(0, 60)}
                </AppText>
                <Button
                  title="Ya apareció"
                  variant="secondary"
                  icon="checkmark-circle"
                  onPress={() => marcar(item.id)}
                  style={styles.reportButton}
                />
                <View style={styles.reportActionsRow}>
                  <Button
                    title="Editar"
                    variant="ghost"
                    icon="create"
                    onPress={() => editar(item)}
                    style={styles.reportActionButton}
                  />
                  <Button
                    title="Borrar"
                    variant="ghost"
                    icon="trash"
                    onPress={() => borrar(item.id)}
                    style={styles.reportActionButton}
                  />
                </View>
              </Card>
            ))}
          </View>
        )}

        <Title size={16} style={styles.sectionTitle}>
          Reunidas 🎉
        </Title>
        {reunidas.length === 0 ? (
          <AppText muted size={13} style={styles.mutedLine}>
            Aún no tienes reencuentros.
          </AppText>
        ) : (
          <View style={styles.list}>
            {reunidas.map((item) => (
              <Card key={item.id} style={styles.reunidaCard}>
                <View style={styles.reunidaHeaderRow}>
                  <Badge label="REUNIDA" color={colors.found} />
                  <AppText muted size={12}>
                    {timeAgo(item.creado_en)}
                  </AppText>
                </View>
                <AppText weight="semi" size={14} style={styles.reportTitle}>
                  {especieLabel[item.especie]}
                </AppText>
                <AppText muted size={13}>
                  {item.descripcion.slice(0, 60)}
                </AppText>
              </Card>
            ))}
          </View>
        )}

        <Button
          title="Privacidad y términos"
          variant="ghost"
          icon="document-text"
          onPress={() => navigation.navigate('Legal')}
          style={styles.legalButton}
        />
        <Button title="Cerrar sesión" variant="danger" onPress={signOut} style={styles.signOutButton} />
      </ScrollView>

      <Confetti visible={celebrating} onDone={() => setCelebrating(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  headerText: {
    flex: 1,
  },
  helperLine: {
    marginTop: -spacing.xs,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photoButton: {
    flex: 1,
  },
  editCard: {
    gap: spacing.sm,
  },
  editProfileButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editActionButton: {
    flex: 1,
  },
  sectionTitle: {
    marginTop: spacing.xs,
  },
  mutedLine: {
    marginTop: -spacing.xs,
  },
  list: {
    gap: spacing.md,
  },
  reportCard: {
    gap: spacing.xs,
  },
  reportTitle: {
    marginTop: spacing.xs,
  },
  reportDescription: {
    marginBottom: spacing.xs,
  },
  reportButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  reportActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reportActionButton: {
    paddingHorizontal: spacing.md,
  },
  reunidaCard: {
    gap: spacing.xs,
  },
  reunidaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legalButton: {
    marginTop: spacing.lg,
  },
  signOutButton: {
    marginTop: spacing.sm,
  },
});

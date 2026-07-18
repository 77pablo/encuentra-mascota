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
import { AppText, Badge, Button, Card, Confetti, EmptyState, Input, Mascota, Screen, Title } from '../ui';
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

  const [editingPerfil, setEditingPerfil] = useState(false);
  const [nombreDraft, setNombreDraft] = useState('');
  const [telefonoDraft, setTelefonoDraft] = useState('');
  const [redSocialDraft, setRedSocialDraft] = useState('');
  const [savingPerfil, setSavingPerfil] = useState(false);

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

  // MODO INVITADO: sin sesión no hay perfil que mostrar. En vez de un perfil
  // fantasma con secciones vacías, una bienvenida corta con las dos puertas de
  // entrada. Va después de todos los hooks para no romper su orden.
  if (!user) {
    return (
      <Screen padded>
        <View style={styles.invitado}>
          <Mascota size={96} color={colors.brandDark} />
          <Title size={22} align="center" style={styles.invitadoTitulo}>
            Estás mirando de visita
          </Title>
          <AppText muted align="center" size={14} style={styles.invitadoTexto}>
            Entrá para publicar, guardar y hablar con el barrio.
          </AppText>
          <Button
            title="Entrar"
            icon="log-in-outline"
            onPress={() => navigation.navigate('Login')}
            style={styles.invitadoBoton}
          />
          <Button
            title="Crear cuenta"
            variant="secondary"
            icon="person-add-outline"
            onPress={() => navigation.navigate('Register')}
            style={styles.invitadoBoton}
          />
          <Button
            title="Privacidad y términos"
            variant="ghost"
            icon="document-text-outline"
            onPress={() => navigation.navigate('Legal')}
            style={styles.invitadoBoton}
          />
        </View>
      </Screen>
    );
  }

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

  const empezarEdicionPerfil = () => {
    setNombreDraft(profile?.nombre ?? '');
    setTelefonoDraft(profile?.telefono ?? '');
    setRedSocialDraft(profile?.red_social ?? '');
    setEditingPerfil(true);
  };

  const guardarPerfil = async () => {
    if (!user) return;
    const nombre = nombreDraft.trim();
    if (!nombre) {
      notify('Falta el nombre', 'Escribe tu nombre.');
      return;
    }
    setSavingPerfil(true);
    try {
      await updateMyProfile(user.id, {
        nombre,
        telefono: telefonoDraft.trim(),
        red_social: redSocialDraft.trim(),
      });
      notify('Guardado', 'Tu perfil se actualizó.');
      setEditingPerfil(false);
      cargar();
    } catch (e: any) {
      notify('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSavingPerfil(false);
    }
  };

  const inicial = user?.email ? user.email.charAt(0).toUpperCase() : '🐾';
  const tieneNombre = !!profile?.nombre?.trim();
  const nombreMostrado = tieneNombre ? (profile!.nombre as string) : user?.email ?? '';
  const telefonoMostrado = profile?.telefono?.trim();
  const redSocialMostrada = profile?.red_social?.trim();

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.headerCard}>
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
              {telefonoMostrado ? (
                <View style={styles.contactRow}>
                  <Ionicons name="call" size={13} color={colors.muted} />
                  <AppText muted size={13} style={styles.contactRowText}>
                    {telefonoMostrado}
                  </AppText>
                </View>
              ) : null}
              {redSocialMostrada ? (
                <View style={styles.contactRow}>
                  <Ionicons name="share-social" size={13} color={colors.muted} />
                  <AppText muted size={13} style={styles.contactRowText}>
                    {redSocialMostrada}
                  </AppText>
                </View>
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

          {editingPerfil ? (
            <View style={styles.editForm}>
              <Input
                label="Tu nombre"
                value={nombreDraft}
                onChangeText={setNombreDraft}
                placeholder="¿Cómo te llamas?"
              />
              <Input
                label="Teléfono / WhatsApp"
                value={telefonoDraft}
                onChangeText={setTelefonoDraft}
                placeholder="+56 9 1234 5678"
                keyboardType="phone-pad"
                icon="call"
              />
              <Input
                label="Red social (Instagram, Facebook…)"
                value={redSocialDraft}
                onChangeText={setRedSocialDraft}
                placeholder="@tu_usuario"
                icon="share-social"
              />
              <View style={styles.editActionsRow}>
                <Button
                  title="Guardar"
                  icon="checkmark"
                  onPress={guardarPerfil}
                  loading={savingPerfil}
                  disabled={savingPerfil}
                  style={styles.editActionButton}
                />
                <Button
                  title="Cancelar"
                  variant="ghost"
                  onPress={() => setEditingPerfil(false)}
                  disabled={savingPerfil}
                  style={styles.editActionButton}
                />
              </View>
            </View>
          ) : (
            <Button
              title="Editar perfil"
              variant="ghost"
              icon="create"
              onPress={empezarEdicionPerfil}
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
          title="Guardados"
          variant="ghost"
          icon="heart-outline"
          onPress={() => navigation.navigate('Guardados')}
          style={styles.legalButton}
        />
        <Button
          title="Mi zona de alerta"
          variant="ghost"
          icon="notifications-outline"
          onPress={() => navigation.navigate('AlertZone')}
        />
        <Button
          title="Privacidad y términos"
          variant="ghost"
          icon="document-text"
          onPress={() => navigation.navigate('Legal')}
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
  headerCard: {
    gap: spacing.md,
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
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  contactRowText: {
    marginLeft: spacing.xs,
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
  editForm: {
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
  invitado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  invitadoTitulo: {
    marginTop: spacing.lg,
  },
  invitadoTexto: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    maxWidth: 280,
    lineHeight: 20,
  },
  invitadoBoton: {
    width: '100%',
    maxWidth: 320,
    marginTop: spacing.sm,
  },
});

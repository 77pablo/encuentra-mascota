import React, { useCallback, useMemo, useState } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { closePet, deletePet, listMyReports, Pet, renovarReporte } from '../services/pets';
import { vencido } from '../lib/cicloVida';
import { camposDeContactoParaGuardar, getMyProfile, Profile, updateMyProfile } from '../services/profile';
import { uploadPetPhoto } from '../services/storage';
import { useAuth } from '../hooks/useAuth';
import { confirmAction, notify } from '../lib/notify';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { timeAgo } from '../lib/time';
import { InstalarAppCard } from '../components/InstalarAppCard';
import { AppText, Badge, Button, Card, Chip, Confetti, EmptyState, Input, Mascota, Screen, Title } from '../ui';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors, useTheme } from '../theme/ThemeProvider';
import {
  construirUrlRedSocial,
  iconoRedSocial,
  parseRedSocial,
  RedSocialTipo,
} from '../lib/redSocial';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Opciones del selector de red social. El orden es el que ve el usuario.
const REDES: { tipo: RedSocialTipo; label: string }[] = [
  { tipo: 'instagram', label: 'Instagram' },
  { tipo: 'facebook', label: 'Facebook' },
  { tipo: 'tiktok', label: 'TikTok' },
  { tipo: 'otro', label: 'Otro' },
];

function etiquetaRed(tipo: RedSocialTipo): string {
  return REDES.find((r) => r.tipo === tipo)?.label ?? 'red social';
}

export default function ProfileScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const colors = useColors();
  const { modo, setModo } = useTheme();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mis, setMis] = useState<Pet[]>([]);
  const [reunidas, setReunidas] = useState<Pet[]>([]);
  const [celebrating, setCelebrating] = useState(false);

  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [editingPerfil, setEditingPerfil] = useState(false);
  const [nombreDraft, setNombreDraft] = useState('');
  const [telefonoDraft, setTelefonoDraft] = useState('');
  const [redTipoDraft, setRedTipoDraft] = useState<RedSocialTipo>('instagram');
  const [redUsuarioDraft, setRedUsuarioDraft] = useState('');
  const [savingPerfil, setSavingPerfil] = useState(false);

  const cargar = useCallback(() => {
    if (!user) return;
    // `user.id` ya no dice de quien pedir el perfil (eso lo decide el
    // servidor con auth.uid() dentro de mi_perfil()): es solo el respaldo
    // para la ventana de despliegue en que la RPC todavia no existe.
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
          {/* El selector de apariencia también acá: un invitado puede querer
              modo oscuro sin tener cuenta. */}
          <AppText weight="bold" size={14} style={styles.apparienceLabel}>
            Apariencia
          </AppText>
          <View style={styles.apparienceRow}>
            <Chip label="Automático" active={modo === 'auto'} onPress={() => setModo('auto')} />
            <Chip label="Claro" active={modo === 'claro'} onPress={() => setModo('claro')} />
            <Chip label="Oscuro" active={modo === 'oscuro'} onPress={() => setModo('oscuro')} />
          </View>
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

  // Reactiva un reporte vencido/archivado: reinicia el reloj de 45 días y vuelve
  // a aparecer en las búsquedas al instante.
  const reactivar = async (id: string) => {
    try {
      await renovarReporte(id);
      notify('Reactivado', 'Tu reporte volvió a aparecer en las búsquedas.');
      cargar();
    } catch (e: any) {
      notify('Error', mensajeDeErrorDb(e));
    }
  };

  const borrar = async (id: string) => {
    const ok = await confirmAction('¿Borrar reporte?', 'Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await deletePet(id, user.id);
      notify('Borrado', 'El reporte se eliminó.');
      cargar();
    } catch (e: any) {
      notify('Error', mensajeDeErrorDb(e));
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
      notify('Error', mensajeDeErrorDb(e));
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
    // Se interpreta el valor guardado (una URL nueva o un handle viejo) para
    // sembrar el selector de plataforma y el usuario. Si es texto viejo suelto,
    // parseRedSocial lo marca como 'otro' y lo deja tal cual para editar.
    const red = parseRedSocial(profile?.red_social);
    setRedTipoDraft(red?.tipo ?? 'instagram');
    setRedUsuarioDraft(red?.usuario ?? '');
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
      // La columna red_social guarda la URL completa al perfil (Instagram,
      // Facebook, etc.); se arma desde plataforma + usuario. Si el usuario está
      // vacío queda '' y camposDeContactoParaGuardar decide si mandarlo.
      const redSocialUrl = construirUrlRedSocial(redTipoDraft, redUsuarioDraft);
      await updateMyProfile(user.id, {
        nombre,
        // Si el perfil vino degradado (mi_perfil() no disponible), esto no
        // manda telefono ni red_social: ver camposDeContactoParaGuardar.
        ...camposDeContactoParaGuardar(profile, telefonoDraft.trim(), redSocialUrl),
      });
      notify('Guardado', 'Tu perfil se actualizó.');
      setEditingPerfil(false);
      cargar();
    } catch (e: any) {
      notify('Error', mensajeDeErrorDb(e));
    } finally {
      setSavingPerfil(false);
    }
  };

  const tieneNombre = !!profile?.nombre?.trim();
  const nombreMostrado = tieneNombre ? (profile!.nombre as string) : user?.email ?? '';
  // La inicial del avatar sale del nombre (antes usaba el correo, que no es lo
  // que la persona reconoce como suyo).
  const inicial = nombreMostrado ? nombreMostrado.charAt(0).toUpperCase() : '🐾';
  const telefonoMostrado = profile?.telefono?.trim();
  const redSocial = parseRedSocial(profile?.red_social);

  const abrirRed = (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      return;
    }
    Linking.openURL(url).catch(() =>
      notify('No se pudo abrir', 'Revisá el enlace de tu red social.'),
    );
  };

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
              {redSocial ? (
                redSocial.url ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    activeOpacity={0.7}
                    onPress={() => abrirRed(redSocial.url!)}
                  >
                    <Ionicons
                      name={iconoRedSocial(redSocial.tipo) as any}
                      size={13}
                      color={colors.brand}
                    />
                    <AppText size={13} color={colors.brand} style={styles.contactRowText}>
                      {redSocial.usuario}
                    </AppText>
                  </TouchableOpacity>
                ) : (
                  // Valor viejo (texto suelto, no navegable): se muestra igual,
                  // pero sin link. Al reeditarlo queda como link.
                  <View style={styles.contactRow}>
                    <Ionicons name="share-social" size={13} color={colors.muted} />
                    <AppText muted size={13} style={styles.contactRowText}>
                      {redSocial.usuario}
                    </AppText>
                  </View>
                )
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
              {!profile || profile.contactoNoDisponible ? (
                // El perfil vino del escalon de respaldo (mi_perfil() no
                // disponible) o directamente no cargo (cargar() se comio un
                // error que no fue PGRST202: corte de red, un 500, un
                // 42501, un JWT vencido). En los dos casos no sabemos si el
                // usuario tiene telefono/red social guardados o no, asi que
                // no se muestran campos vacios que inviten a "completarlos"
                // (eso borraria el dato real al guardar). Se avisa y no se
                // deja tocar el contacto.
                <AppText muted size={12} style={styles.avisoContacto}>
                  No pudimos cargar tu teléfono ni tu red social en este momento. Por ahora se
                  mantienen como estaban guardados; vuelve a intentarlo más tarde para editarlos.
                </AppText>
              ) : (
                <>
                  <Input
                    label="Teléfono / WhatsApp"
                    value={telefonoDraft}
                    onChangeText={setTelefonoDraft}
                    placeholder="+56 9 1234 5678"
                    keyboardType="phone-pad"
                    icon="call"
                  />
                  <AppText weight="semi" muted size={13} style={styles.redesLabel}>
                    Red social
                  </AppText>
                  <View style={styles.redesRow}>
                    {REDES.map((r) => (
                      <Chip
                        key={r.tipo}
                        label={r.label}
                        active={redTipoDraft === r.tipo}
                        onPress={() => setRedTipoDraft(r.tipo)}
                      />
                    ))}
                  </View>
                  <Input
                    label={
                      redTipoDraft === 'otro'
                        ? 'Link a tu perfil'
                        : `Tu usuario de ${etiquetaRed(redTipoDraft)}`
                    }
                    value={redUsuarioDraft}
                    onChangeText={setRedUsuarioDraft}
                    placeholder={redTipoDraft === 'otro' ? 'https://…' : '@tu_usuario'}
                    icon={iconoRedSocial(redTipoDraft) as any}
                    autoCapitalize="none"
                  />
                  <AppText muted size={12} style={styles.avisoContacto}>
                    Tu teléfono solo lo ves tú (lo usamos para el afiche). Tu red social será un
                    enlace tocable a tu perfil.
                  </AppText>
                </>
              )}
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
            {mis.map((item) => {
              const estaVencido = vencido(item);
              return (
              <Card key={item.id} style={[styles.reportCard, estaVencido && styles.reportCardVencida]}>
                <Badge estado={item.estado} />
                <AppText weight="semi" size={14} style={styles.reportTitle}>
                  {especieLabel[item.especie]}
                </AppText>
                <AppText muted size={13} style={styles.reportDescription}>
                  {item.descripcion.slice(0, 60)}
                </AppText>
                {estaVencido ? (
                  // Realce del reporte vencido: pausado, no aparece en búsquedas,
                  // pero se reactiva con un toque.
                  <View style={styles.vencidaAviso}>
                    <Ionicons name="pause-circle" size={16} color={colors.muted} />
                    <AppText muted size={12} style={styles.vencidaTexto}>
                      En pausa: no aparece en las búsquedas. Reactivalo para que se vea de nuevo.
                    </AppText>
                  </View>
                ) : null}
                {estaVencido ? (
                  <Button
                    title="Reactivar"
                    icon="refresh"
                    onPress={() => reactivar(item.id)}
                    style={styles.reportButton}
                  />
                ) : null}
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
              );
            })}
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
          title="Mis mascotas"
          variant="ghost"
          icon="paw-outline"
          onPress={() => navigation.navigate('MyPets')}
          style={styles.legalButton}
        />
        <Button
          title="Guardados"
          variant="ghost"
          icon="heart-outline"
          onPress={() => navigation.navigate('Guardados')}
        />
        <Button
          title="Mi zona de alerta"
          variant="ghost"
          icon="notifications-outline"
          onPress={() => navigation.navigate('AlertZone')}
        />
        <Button
          title="Mis búsquedas"
          variant="ghost"
          icon="search-outline"
          onPress={() => navigation.navigate('MisBusquedas')}
        />
        <Button
          title="Avisos"
          variant="ghost"
          icon="mail-outline"
          onPress={() => navigation.navigate('NotificationPrefs')}
        />
        <Button
          title="Ayuda y recursos"
          variant="ghost"
          icon="help-buoy-outline"
          onPress={() => navigation.navigate('Ayuda')}
        />

        {/* Entrada fija (no descartable) para instalar la PWA: web-only,
            se oculta sola si ya está instalada. */}
        <InstalarAppCard variante="fila" />

        <AppText weight="bold" size={14} style={styles.apparienceLabel}>
          Apariencia
        </AppText>
        <View style={styles.apparienceRow}>
          <Chip label="Automático" active={modo === 'auto'} onPress={() => setModo('auto')} />
          <Chip label="Claro" active={modo === 'claro'} onPress={() => setModo('claro')} />
          <Chip label="Oscuro" active={modo === 'oscuro'} onPress={() => setModo('oscuro')} />
        </View>

        <Button
          title="Privacidad y términos"
          variant="ghost"
          icon="document-text"
          onPress={() => navigation.navigate('Legal')}
        />
        <Button
          title="Borrar mi cuenta"
          variant="ghost"
          icon="trash-outline"
          onPress={() => navigation.navigate('DeleteAccount')}
        />
        <Button title="Cerrar sesión" variant="danger" onPress={signOut} style={styles.signOutButton} />
      </ScrollView>

      <Confetti visible={celebrating} onDone={() => setCelebrating(false)} />
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
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
  avisoContacto: { marginTop: -spacing.xs, marginBottom: spacing.sm, lineHeight: 16 },
  redesLabel: {
    marginBottom: spacing.xs,
  },
  redesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  reportCardVencida: {
    borderWidth: 1,
    borderColor: colors.sun,
  },
  vencidaAviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  vencidaTexto: {
    flex: 1,
    lineHeight: 16,
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
  apparienceLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  apparienceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
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

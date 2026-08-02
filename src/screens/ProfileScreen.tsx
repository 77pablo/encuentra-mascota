import React, { useCallback, useMemo, useState } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { closePet, deletePet, listMyReports, Pet, renovarReporte } from '../services/pets';
import { markReunited } from '../services/reunions';
import { vencido } from '../lib/cicloVida';
import { isReunited } from '../lib/reunion';
import { insigniasDe } from '../lib/insignias';
import { camposDeContactoParaGuardar, getMyProfile, Profile, updateMyProfile } from '../services/profile';
import InsigniaInstitucion from '../components/InsigniaInstitucion';
import { getPerfilPublico } from '../services/perfilPublico';
import { uploadPetPhoto } from '../services/storage';
import { useAuth } from '../hooks/useAuth';
import { useAvisosSinLeer } from '../hooks/useAvisosSinLeer';
import { pluralizar } from '../lib/plural';
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
  // Cuántos avisos llegaron desde la última vez que se abrió la bandeja. El
  // hook NUNCA tira: con la migración 0051 sin aplicar devuelve 0 y el resto del
  // Perfil sigue igual.
  const { sinLeer: avisosSinLeer, recargar: recargarAvisos } = useAvisosSinLeer();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mis, setMis] = useState<Pet[]>([]);
  // Todos los reportes cerrados. Se parten en pantalla entre los que tienen
  // reencuentro registrado y los que se cerraron por otro motivo: la lista
  // cruda mezcla las dos cosas (`listMyReports` filtra solo por `activo`).
  const [cerrados, setCerrados] = useState<Pet[]>([]);
  const [celebrating, setCelebrating] = useState(false);
  // Estadísticas propias, solo para las insignias. Es la MISMA fuente que el
  // perfil público (la RPC `perfil_publico`), así que lo que ve el vecino y lo
  // que ves vos no pueden desincronizarse.
  const [stats, setStats] = useState<{ reencuentros: number; reportes: number; aportes: number } | null>(null);

  // "No pudimos leerlo" tiene que verse DISTINTO de "no tenés nada". Cada
  // lectura lleva su propio error: que se caiga la de los cerrados no debe
  // borrar de la pantalla los activos, que es el trabajo principal del perfil.
  const [errorMis, setErrorMis] = useState<string | null>(null);
  const [errorCerrados, setErrorCerrados] = useState<string | null>(null);

  // Reporte cuyo panel "¿volvió a casa?" está abierto (null = ninguno).
  const [cerrandoId, setCerrandoId] = useState<string | null>(null);
  const [guardandoCierre, setGuardandoCierre] = useState(false);

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
    // Al volver de la bandeja el contador tiene que bajar solo: si no, el badge
    // se queda encendido para siempre y deja de significar algo.
    recargarAvisos();
    // `user.id` ya no dice de quien pedir el perfil (eso lo decide el
    // servidor con auth.uid() dentro de mi_perfil()): es solo el respaldo
    // para la ventana de despliegue en que la RPC todavia no existe.
    getMyProfile(user.id)
      .then(setProfile)
      .catch((e) => {
        // `profile` queda en null. Eso NO pisa el contacto real al guardar:
        // `camposDeContactoParaGuardar` omite teléfono y red social cuando el
        // perfil es null o vino degradado —esa guarda existe justo por este
        // camino, que ya fue un Critical—. Pero el silencio era el problema:
        // la persona veía su perfil vacío sin ninguna explicación.
        console.error('No se pudo leer tu perfil:', e?.message ?? e);
      });
    // Cada lectura limpia SU error antes de reintentar y lo deja puesto si
    // falla. Antes las dos degradaban a un `console.warn` y la persona
    // terminaba viendo el mismo "no tienes nada" de cuando de verdad no hay
    // nada: es la cuarta vez que aparece este patrón en el proyecto (ver
    // AlertZoneScreen y ModeracionScreen, donde ya se resolvió así).
    setErrorMis(null);
    listMyReports(user.id, true)
      .then((lista) => {
        setMis(lista);
        setErrorMis(null);
      })
      .catch((e) => {
        console.warn('No se pudieron leer tus reportes activos:', e?.message ?? e);
        setErrorMis(mensajeDeErrorDb(e));
      });
    setErrorCerrados(null);
    listMyReports(user.id, false)
      .then((lista) => {
        setCerrados(lista);
        setErrorCerrados(null);
      })
      .catch((e) => {
        console.warn('No se pudieron leer tus reportes cerrados:', e?.message ?? e);
        setErrorCerrados(mensajeDeErrorDb(e));
      });
    // Insignias del perfil propio. Esta SÍ degrada en silencio-con-log a
    // propósito: sin insignias la pantalla se lee entera, y no hay ningún dato
    // que se pueda pisar por no haberlas leído.
    getPerfilPublico(user.id)
      .then((p) => {
        if (p) setStats({ reencuentros: p.reencuentros, reportes: p.reportes, aportes: p.aportes });
      })
      .catch((e) => {
        console.warn('No se pudieron leer tus estadísticas:', e?.message ?? e);
      });
  }, [user, recargarAvisos]);

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

  // CERRAR UN REPORTE DESDE EL PERFIL — dos finales muy distintos.
  //
  // Antes este botón llamaba a `closePet`, que solo pone `activo=false`. Un
  // reencuentro cerrado por acá no sumaba en "Ya van N vueltas a casa", no
  // entraba en `impacto_comunidad` ni en la galería "Volvieron a casa", y no
  // dejaba ni fecha ni rastro. Por eso ahora se pregunta antes: no es lo mismo
  // "volvió a casa" que "lo cierro por otro motivo", y la app no puede
  // adivinarlo. Las dos columnas (`reunida_en` y compañía) ya existen desde la
  // migración 0008: no hace falta nada nuevo, solo escribir en ellas.
  const marcarVolvioACasa = async (id: string) => {
    setGuardandoCierre(true);
    try {
      // El mismo camino que el detalle: escribe `reunida_en`. La nota y la foto
      // del final feliz se pueden agregar desde la ficha; acá no se piden para
      // que confirmar el reencuentro sea un solo toque.
      await markReunited(id);
      setCerrandoId(null);
      setCelebrating(true);
      notify('¡Qué alegría!', 'Sumamos este reencuentro a los de la comunidad.');
      cargar();
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setGuardandoCierre(false);
    }
  };

  const cerrarPorOtroMotivo = async (id: string) => {
    setGuardandoCierre(true);
    try {
      await closePet(id);
      setCerrandoId(null);
      notify('Reporte cerrado', 'Dejó de aparecer en las búsquedas.');
      cargar();
    } catch (e: any) {
      notify('No se pudo cerrar', mensajeDeErrorDb(e));
    } finally {
      setGuardandoCierre(false);
    }
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

  // Un cierre común NO es un reencuentro: `isReunited` pide `reunida_en`, el
  // mismo criterio que usan `countReunidas` y la galería "Volvieron a casa".
  const reunidas = cerrados.filter((p) => isReunited(p));
  const otrosCerrados = cerrados.filter((p) => !isReunited(p));
  const insignias = stats ? insigniasDe(stats) : [];

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

        {/* CUENTA INSTITUCIONAL (0057). No es decoración: como la verificación
            la otorga la moderación a mano, esta es la ÚNICA forma que tiene una
            veterinaria de saber que el trámite quedó hecho — si no, escribe de
            nuevo para preguntar. Y es lo que explica que Publicar le ofrezca
            cargar en lote. Se dibuja sola (null) para una cuenta común, con el
            perfil en null y con la 0057 sin aplicar. */}
        <InsigniaInstitucion institucion={profile?.institucion ?? null} />

        {/* Insignias propias: las mismas que ve un vecino en tu perfil público,
            que hasta ahora solo se renderizaban allá. Si el perfil es nuevo no
            hay ninguna y no se dibuja nada (no se inventan logros). */}
        {insignias.length > 0 ? (
          <View style={styles.insigniasWrap}>
            {insignias.map((i) => (
              <View key={i.clave} style={styles.insignia}>
                <Ionicons name={i.icono as any} size={16} color={colors.muted} />
                <View style={styles.insigniaText}>
                  <AppText weight="semi" size={13}>
                    {i.titulo}
                  </AppText>
                  <AppText muted size={12}>
                    {i.descripcion}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Title size={16} style={styles.sectionTitle}>
          Mis reportes activos
        </Title>
        {errorMis ? (
          // NO se muestra el vacío: "no tenés reportes" y "no pudimos leerlos"
          // son cosas distintas y confundirlas hace que la persona crea que
          // perdió sus publicaciones.
          <Card style={styles.errorCard}>
            <View style={styles.errorHeader}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.muted} />
              <AppText weight="bold" size={14} style={styles.errorTitulo}>
                No pudimos leer tus reportes
              </AppText>
            </View>
            <AppText muted size={13}>
              {errorMis}
            </AppText>
            <AppText muted size={13}>
              Siguen publicados: esto es solo un problema para mostrarlos acá.
            </AppText>
            <Button title="Reintentar" variant="secondary" onPress={cargar} style={styles.errorBoton} />
          </Card>
        ) : mis.length === 0 ? (
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
                  onPress={() => setCerrandoId((actual) => (actual === item.id ? null : item.id))}
                  style={styles.reportButton}
                />
                {cerrandoId === item.id ? (
                  <View style={styles.cierrePanel}>
                    <AppText weight="bold" size={14}>
                      ¿Volvió a casa?
                    </AppText>
                    <AppText muted size={13} style={styles.cierreTexto}>
                      Si volvió, lo sumamos a los reencuentros de la comunidad y queda en
                      «Volvieron a casa». Si lo cerrás por otro motivo, simplemente deja de
                      aparecer en las búsquedas.
                    </AppText>
                    <Button
                      title="Sí, volvió a casa"
                      icon="heart"
                      loading={guardandoCierre}
                      disabled={guardandoCierre}
                      onPress={() => marcarVolvioACasa(item.id)}
                      style={styles.cierreBoton}
                    />
                    <Button
                      title="La cierro por otro motivo"
                      variant="secondary"
                      icon="close-circle-outline"
                      disabled={guardandoCierre}
                      onPress={() => cerrarPorOtroMotivo(item.id)}
                      style={styles.cierreBoton}
                    />
                    <Button
                      title="Ahora no"
                      variant="ghost"
                      disabled={guardandoCierre}
                      onPress={() => setCerrandoId(null)}
                    />
                  </View>
                ) : null}
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
        {errorCerrados ? (
          <Card style={styles.errorCard}>
            <View style={styles.errorHeader}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.muted} />
              <AppText weight="bold" size={14} style={styles.errorTitulo}>
                No pudimos leer tus reencuentros
              </AppText>
            </View>
            <AppText muted size={13}>
              {errorCerrados}
            </AppText>
            <Button title="Reintentar" variant="secondary" onPress={cargar} style={styles.errorBoton} />
          </Card>
        ) : reunidas.length === 0 ? (
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
                    {timeAgo(item.reunida_en ?? item.creado_en)}
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

        {/* Cerrados sin reencuentro. Antes caían en la lista de arriba con la
            etiqueta "REUNIDA" puesta: una etiqueta falsa, porque
            `listMyReports(user.id, false)` filtra solo por `activo`. Si no hay
            ninguno, la sección entera no se dibuja. */}
        {!errorCerrados && otrosCerrados.length > 0 ? (
          <>
            <Title size={16} style={styles.sectionTitle}>
              Cerrados
            </Title>
            <View style={styles.list}>
              {otrosCerrados.map((item) => (
                <Card key={item.id} style={styles.reunidaCard}>
                  <View style={styles.reunidaHeaderRow}>
                    <Badge label="CERRADO" color={colors.muted} />
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
          </>
        ) : null}

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
        {/* Seguir una comuna no tenía vuelta atrás: el único botón vivía dentro
            del panel de filtros de Explorar, que arranca colapsado. Acá se ven
            y se sacan. */}
        <Button
          title="Mis comunas"
          variant="ghost"
          icon="map-outline"
          onPress={() => navigation.navigate('MisComunas')}
        />
        {/* El equivalente de "Mis reportes" para la otra mitad de la app:
            `listMyAdoptions` existía hace tandas sin un solo llamador, así que
            se podía publicar un animal en adopción y después no tener dónde
            verlo, ni saber si seguía visible. */}
        <Button
          title="Mis publicaciones en adopción"
          variant="ghost"
          icon="heart-outline"
          onPress={() => navigation.navigate('MisAdopciones')}
        />
        {/* LA BANDEJA de avisos (migración 0051). Hasta acá, un aviso solo
            existía si salía por correo o por push: si los dos fallaban —y el
            correo está fallando— se perdía sin que nadie se enterara. El número
            sale de comparar contra una marca local de "última visita". */}
        <Button
          title={
            avisosSinLeer > 0
              ? `Tus avisos · ${avisosSinLeer} ${pluralizar(avisosSinLeer, 'nuevo', 'nuevos')}`
              : 'Tus avisos'
          }
          variant="ghost"
          icon="notifications-outline"
          onPress={() => navigation.navigate('MisAvisos')}
        />
        {/* Distinto de la bandeja: acá se elige QUÉ llega y por qué canal. */}
        <Button
          title="Preferencias de avisos"
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
        {/* `Bloqueados` está registrada en ESTE mismo stack (ProfileStack), así
            que el nombre pelado es correcto: no hay que anidar `App`/pestaña. */}
        <Button
          title="Personas bloqueadas"
          variant="ghost"
          icon="ban-outline"
          onPress={() => navigation.navigate('Bloqueados')}
        />
        {profile?.es_admin ? (
          <Button
            title="Moderación"
            variant="ghost"
            icon="shield-checkmark-outline"
            onPress={() => navigation.navigate('Moderacion')}
          />
        ) : null}

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
  cierrePanel: {
    marginTop: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.sky,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cierreTexto: {
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  cierreBoton: {
    marginTop: spacing.xs,
  },
  errorCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorTitulo: {
    flexShrink: 1,
  },
  errorBoton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  insigniasWrap: {
    gap: spacing.sm,
  },
  insignia: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  insigniaText: {
    flex: 1,
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

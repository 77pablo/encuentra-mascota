import React, { useCallback, useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import MapView, { Marker } from '../components/PlatformMap';
import { getPet, Pet } from '../services/pets';
import { buscarCoincidencias, Coincidencia } from '../services/busqueda';
import { markReunited } from '../services/reunions';
import { denunciarPet } from '../services/moderation';
import { useAuth } from '../hooks/useAuth';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { shareReport } from '../lib/share';
import { listSightings, Sighting } from '../services/sightings';
import { addUpdate, listUpdates, PetUpdate } from '../services/petUpdates';
import { borrarTip, crearTip, listarTips } from '../services/tips';
import { firmaAutor, puedeBorrarTip, validarTip, Tip, TIP_MAX } from '../lib/tips';
import { sortByRecency, sightingDistanceKm, summaryLabel } from '../lib/sightings';
import { distanceLabel } from '../lib/geo';
import { isReunited, reunionLabel } from '../lib/reunion';
import { timeAgo } from '../lib/time';
import { buildTimeline, TimelineTipo } from '../lib/timeline';
import { confirmAction, notify } from '../lib/notify';
import { pickFromLibrary } from '../lib/pickImage';
import { uploadPetPhoto } from '../services/storage';
import PetCard from '../components/PetCard';
import AficheGenerator from '../components/AficheGenerator';
import { faltaWhatsapp } from '../lib/afiche';
import { getMyProfile, Profile } from '../services/profile';
import { AppText, Badge, Button, Card, Confetti, ErrorState, Input, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const MOTIVOS_DENUNCIA = [
  'Contenido falso o engañoso',
  'Contenido ofensivo',
  'Spam',
  'Otro',
] as const;

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Ícono y color del punto de cada hito de la "Historia" del reporte.
const timelineIcono: Record<TimelineTipo, keyof typeof Ionicons.glyphMap> = {
  publicado: 'paw',
  avistamiento: 'location',
  reunido: 'heart',
};
const timelineColor: Record<TimelineTipo, string> = {
  publicado: colors.brand,
  avistamiento: colors.sun,
  reunido: colors.found,
};

export default function PetDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { user } = useAuth();
  // Portero del modo invitado: primera línea de cada acción protegida.
  const requireAuth = useRequireAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mostrarMotivos, setMostrarMotivos] = useState(false);
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);
  const [matches, setMatches] = useState<Coincidencia[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  // Novedades del dueño (bitácora del reporte)
  const [novedades, setNovedades] = useState<PetUpdate[]>([]);
  const [nuevaNovedad, setNuevaNovedad] = useState('');
  const [publicandoNovedad, setPublicandoNovedad] = useState(false);
  // Pistas del barrio (la voz del vecindario sobre este reporte)
  const [pistas, setPistas] = useState<Tip[]>([]);
  const [nuevaPista, setNuevaPista] = useState('');
  const [dejandoPista, setDejandoPista] = useState(false);
  const [borrandoPista, setBorrandoPista] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Profile | null>(null);
  const [generandoAfiche, setGenerandoAfiche] = useState(false);
  // Flujo "¡Volvió a casa!" (final feliz)
  const [mostrarReunion, setMostrarReunion] = useState(false);
  const [notaFeliz, setNotaFeliz] = useState('');
  const [fotoFeliz, setFotoFeliz] = useState<string | null>(null);
  const [guardandoReunion, setGuardandoReunion] = useState(false);
  const [mostrarConfetti, setMostrarConfetti] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    getPet(id)
      .then(setPet)
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Cuando ya tenemos la mascota, buscamos posibles coincidencias entre los
  // reportes activos (perdida ↔ encontrada, especie compatible y cercanas).
  // Silencioso: si falla la carga, simplemente no mostramos sugerencias.
  useEffect(() => {
    if (!pet) {
      setMatches([]);
      return;
    }
    let vivo = true;
    // Las coincidencias las resuelve la base (migracion 0014): estado opuesto,
    // especie compatible y dentro del radio, ordenadas por cercania. Antes esto
    // se calculaba en el cliente recorriendo TODOS los reportes activos.
    buscarCoincidencias(pet.id)
      .then((encontradas) => {
        if (vivo) setMatches(encontradas);
      })
      .catch(() => {
        if (vivo) setMatches([]);
      });
    return () => {
      vivo = false;
    };
  }, [pet]);

  // Carga el rastro de avistamientos del reporte. Se vuelve a llamar cada vez
  // que la pantalla recupera el foco (p. ej. al volver de "Lo vi por acá").
  const cargarAvistamientos = useCallback(() => {
    listSightings(id)
      .then(setSightings)
      .catch(() => setSightings([]));
  }, [id]);

  useEffect(() => {
    cargarAvistamientos();
    const off = navigation.addListener('focus', cargarAvistamientos);
    return off;
  }, [navigation, cargarAvistamientos]);

  // Carga la bitácora de novedades del dueño. Se refresca al recuperar el foco,
  // igual que los avistamientos. Silencioso: si falla, dejamos la lista vacía.
  const cargarNovedades = useCallback(() => {
    listUpdates(id)
      .then(setNovedades)
      .catch(() => setNovedades([]));
  }, [id]);

  useEffect(() => {
    cargarNovedades();
    const off = navigation.addListener('focus', cargarNovedades);
    return off;
  }, [navigation, cargarNovedades]);

  const publicarNovedad = async () => {
    if (!requireAuth('novedad')) return;
    if (!user) return;
    const texto = nuevaNovedad.trim();
    if (!texto) return;
    setPublicandoNovedad(true);
    try {
      await addUpdate(id, user.id, texto);
      setNuevaNovedad('');
      cargarNovedades();
    } catch (e: any) {
      notify('No se pudo publicar', mensajeDeErrorDb(e));
    } finally {
      setPublicandoNovedad(false);
    }
  };

  // Carga las pistas del barrio. `listarTips` ya degrada a vacío si falta la
  // migración 0012, así que acá solo nos protegemos de un error inesperado.
  const cargarPistas = useCallback(() => {
    listarTips(id)
      .then(setPistas)
      .catch(() => setPistas([]));
  }, [id]);

  useEffect(() => {
    cargarPistas();
    const off = navigation.addListener('focus', cargarPistas);
    return off;
  }, [navigation, cargarPistas]);

  const dejarPista = async () => {
    const validacion = validarTip(nuevaPista);
    if (!validacion.ok) return;
    setDejandoPista(true);
    try {
      await crearTip(id, validacion.texto);
      setNuevaPista('');
      cargarPistas();
    } catch (e: any) {
      notify('No se pudo dejar la pista', mensajeDeErrorDb(e));
    } finally {
      setDejandoPista(false);
    }
  };

  const eliminarPista = async (tip: Tip) => {
    const ok = await confirmAction('¿Borrar esta pista?', 'Se va a eliminar del reporte para todos.');
    if (!ok) return;
    setBorrandoPista(tip.id);
    try {
      await borrarTip(tip.id);
      setPistas((actuales) => actuales.filter((t) => t.id !== tip.id));
    } catch (e: any) {
      notify('No se pudo borrar', mensajeDeErrorDb(e));
    } finally {
      setBorrandoPista(null);
    }
  };

  // Sin sesión, el portero avisa con el mensaje propio de esta acción y lleva al
  // registro guardando la intención, para que al volver el vecino caiga de nuevo
  // en este mismo reporte.
  const pedirCuentaParaPista = () => {
    requireAuth('dejar_pista');
  };

  const onAficheDone = useCallback(() => setGenerandoAfiche(false), []);
  const onAficheError = useCallback(
    (m: string) => {
      setGenerandoAfiche(false);
      notify('Error', m);
    },
    [],
  );

  const onCarouselLayout = (e: LayoutChangeEvent) => {
    setCarouselWidth(e.nativeEvent.layout.width);
  };

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
    setActiveIndex(index);
  };

  if (loading) {
    return <Loading />;
  }

  if (error || !pet) {
    return (
      <Screen padded>
        <ErrorState message={error ?? undefined} onRetry={cargar} />
      </Screen>
    );
  }

  const esMio = pet.user_id === user?.id;
  const origen = { lat: pet.lat, lng: pet.lng };
  const rastro = sortByRecency(sightings);
  const resumenAvistamientos = summaryLabel(origen, sightings);
  const historia = buildTimeline(pet, sightings);

  const reportarAvistamiento = () => {
    if (!requireAuth('avistamiento')) return;
    navigation.navigate('AddSighting', { petId: pet.id, petLat: pet.lat, petLng: pet.lng });
  };

  const contactar = () => {
    if (!requireAuth('contactar')) return;
    navigation.navigate('Chat', { petId: pet.id, otherUserId: pet.user_id });
  };

  const abrirMotivosDenuncia = () => {
    if (!requireAuth('denunciar')) return;
    setMostrarMotivos((v) => !v);
  };

  const reunida = isReunited(pet);
  const nombreMostrar = pet.nombre || especieLabel[pet.especie];

  const elegirFotoFeliz = async () => {
    try {
      const uris = await pickFromLibrary(1);
      if (uris[0]) setFotoFeliz(uris[0]);
    } catch (e: any) {
      notify('No se pudo abrir la galería', mensajeDeErrorDb(e));
    }
  };

  const confirmarReunion = async () => {
    if (!requireAuth('reencuentro')) return;
    if (!pet) return;
    setGuardandoReunion(true);
    try {
      let fotoUrl: string | null = null;
      if (fotoFeliz && user) {
        fotoUrl = await uploadPetPhoto(fotoFeliz, user.id);
      }
      const nota = notaFeliz.trim() || null;
      await markReunited(pet.id, { nota, foto: fotoUrl });
      // Reflejamos el cambio en pantalla sin volver a pedir a la base.
      setPet({ ...pet, activo: false, reunida_en: new Date().toISOString(), final_feliz: nota, final_foto: fotoUrl });
      setMostrarReunion(false);
      setMostrarConfetti(true);
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setGuardandoReunion(false);
    }
  };

  const crearAfiche = async () => {
    if (!user) return;
    try {
      const p = await getMyProfile(user.id);
      setPerfil(p);
      if (faltaWhatsapp(p)) {
        notify('Agregá tu WhatsApp', 'Cargá tu WhatsApp en tu perfil para que puedan contactarte desde el afiche.');
        navigation.navigate('Perfil');
        return;
      }
      setGenerandoAfiche(true);
    } catch (e: any) {
      notify('Error', mensajeDeErrorDb(e));
    }
  };

  const denunciar = async (motivo: string) => {
    if (!requireAuth('denunciar')) return;
    if (!user || !pet) return;
    setEnviandoDenuncia(true);
    try {
      await denunciarPet(pet.id, user.id, motivo);
      setMostrarMotivos(false);
      notify('Gracias', 'Recibimos tu denuncia y la revisaremos.');
    } catch (e: any) {
      if (e?.code === '23505') {
        setMostrarMotivos(false);
        notify('Ya habías denunciado este reporte.');
      } else {
        notify('Error', mensajeDeErrorDb(e));
      }
    } finally {
      setEnviandoDenuncia(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {pet.fotos.length > 0 ? (
          <View onLayout={onCarouselLayout}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onCarouselScroll}
              onMomentumScrollEnd={onCarouselScroll}
              scrollEventThrottle={16}
            >
              {pet.fotos.map((f) => (
                <Image
                  key={f}
                  source={{ uri: f }}
                  style={[styles.photo, carouselWidth ? { width: carouselWidth } : null]}
                />
              ))}
            </ScrollView>
            {pet.fotos.length > 1 ? (
              <View style={styles.dotsRow}>
                {pet.fotos.map((f, i) => (
                  <View key={f} style={[styles.dot, i === activeIndex && styles.dotActive]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <AppText size={48}>🐾</AppText>
          </View>
        )}

        <View style={styles.headerRow}>
          <Title size={22} numberOfLines={2} style={styles.title}>
            {pet.nombre || especieLabel[pet.especie]}
          </Title>
          <Badge estado={pet.estado} />
        </View>
        <AppText muted size={13} style={styles.meta}>
          {especieLabel[pet.especie]}
          {pet.raza ? ` · ${pet.raza}` : ''}
          {'  ·  '}
          {timeAgo(pet.creado_en)}
        </AppText>

        <Card style={styles.descriptionCard}>
          <AppText size={15} style={styles.descriptionText}>
            {pet.descripcion}
          </AppText>
        </Card>

        {pet.recompensa ? (
          <View style={styles.rewardPill}>
            <Ionicons name="sunny" size={16} color={colors.ink} style={styles.rewardIcon} />
            <AppText weight="bold" size={14} color={colors.ink}>
              Recompensa: {pet.recompensa}
            </AppText>
          </View>
        ) : null}

        <MapView
          style={styles.map}
          region={{ latitude: pet.lat, longitude: pet.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        >
          <Marker coordinate={{ latitude: pet.lat, longitude: pet.lng }} />
          {sightings.map((s) => (
            <Marker
              key={s.id}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              pinColor={colors.sun}
              title="Visto por acá"
              description={s.nota ?? undefined}
            />
          ))}
        </MapView>

        {reunida ? (
          <Card style={styles.finalCard}>
            <View style={styles.finalBadge}>
              <Ionicons name="heart" size={13} color={colors.white} />
              <AppText weight="bold" color={colors.white} size={11} style={styles.finalBadgeLabel}>
                FINAL FELIZ
              </AppText>
            </View>
            <Title size={18} style={styles.finalTitle}>
              ¡Qué alegría! {nombreMostrar} volvió a casa
            </Title>
            {reunionLabel(pet) ? (
              <AppText muted size={13} style={styles.finalSub}>
                {reunionLabel(pet)}
              </AppText>
            ) : null}
            {pet.final_feliz ? (
              <AppText size={15} style={styles.finalNota}>
                “{pet.final_feliz}”
              </AppText>
            ) : null}
            {pet.final_foto ? (
              <Image source={{ uri: pet.final_foto }} style={styles.finalFoto} />
            ) : null}
          </Card>
        ) : (
          <>
            {!esMio && (
              <Button
                title="Contactar"
                icon="chatbubble-ellipses"
                onPress={contactar}
                style={styles.contactButton}
              />
            )}

            {esMio && (
              <Button
                title="¡Volvió a casa!"
                icon="heart"
                onPress={() => setMostrarReunion((v) => !v)}
                style={styles.contactButton}
              />
            )}

            {esMio && mostrarReunion && (
              <Card style={styles.reunionPanel}>
                <View style={styles.reunionHeader}>
                  <Ionicons name="home" size={18} color={colors.brand} />
                  <Title size={16} style={styles.reunionHeaderTitle}>
                    ¿{nombreMostrar} ya está en casa?
                  </Title>
                </View>
                <AppText muted size={13} style={styles.reunionText}>
                  Qué buena noticia. Si querés, dejá un mensajito y una foto del reencuentro para cerrar con un final feliz.
                </AppText>
                <Input
                  label="Tu mensaje (opcional)"
                  value={notaFeliz}
                  onChangeText={setNotaFeliz}
                  placeholder="Apareció sana y salva a tres cuadras…"
                  multiline
                />
                {fotoFeliz ? (
                  <Image source={{ uri: fotoFeliz }} style={styles.reunionPreview} />
                ) : null}
                <Button
                  title={fotoFeliz ? 'Cambiar foto' : 'Agregar foto (opcional)'}
                  variant="secondary"
                  icon="camera"
                  onPress={elegirFotoFeliz}
                  style={styles.reunionAction}
                />
                <Button
                  title="Confirmar reencuentro"
                  icon="heart"
                  loading={guardandoReunion}
                  onPress={confirmarReunion}
                  style={styles.reunionAction}
                />
                <Button
                  title="Ahora no"
                  variant="ghost"
                  disabled={guardandoReunion}
                  onPress={() => setMostrarReunion(false)}
                />
              </Card>
            )}

          </>
        )}

        {/* Compartir y afiche están SIEMPRE disponibles, también en un final
            feliz: un reencuentro es justo lo que más ganas dan de compartir. */}
        <Button
          title="Compartir"
          variant="secondary"
          icon="logo-whatsapp"
          onPress={() => shareReport(pet)}
          style={styles.shareButton}
        />

        {esMio && (
          <Button
            title="Crear afiche"
            variant="secondary"
            icon="print"
            loading={generandoAfiche}
            onPress={crearAfiche}
            style={styles.shareButton}
          />
        )}

        <View style={styles.sightingsSection}>
          <View style={styles.matchesHeader}>
            <Ionicons name="paw" size={18} color={colors.brand} />
            <Title size={17} style={styles.matchesTitle}>
              Visto por acá
            </Title>
          </View>
          <AppText muted size={13} style={styles.matchesSubtitle}>
            {resumenAvistamientos ??
              (reunida
                ? 'No quedaron avistamientos registrados.'
                : 'Todavía nadie reportó haberlo visto. Si lo viste, marca el punto en el mapa.')}
          </AppText>

          {/* No se aceptan avistamientos nuevos en un reporte ya reunido; el
              rastro se mantiene como historia del reencuentro. */}
          {!reunida && (
            <Button
              title="Lo vi por acá"
              icon="location"
              onPress={reportarAvistamiento}
              style={styles.sightingButton}
            />
          )}

          {rastro.length > 0 ? (
            <View style={styles.sightingsList}>
              {rastro.map((s) => (
                <Card key={s.id} style={styles.sightingCard}>
                  <View style={styles.sightingRow}>
                    <Ionicons name="pin" size={16} color={colors.sun} style={styles.sightingIcon} />
                    <View style={styles.sightingBody}>
                      {s.nota ? (
                        <AppText size={14} style={styles.sightingNote}>
                          {s.nota}
                        </AppText>
                      ) : (
                        <AppText size={14} muted style={styles.sightingNote}>
                          Sin nota
                        </AppText>
                      )}
                      <AppText muted size={12} style={styles.sightingMeta}>
                        {distanceLabel(sightingDistanceKm(origen, s))} del reporte · {timeAgo(s.creado_en)}
                      </AppText>
                    </View>
                  </View>
                  {s.foto ? <Image source={{ uri: s.foto }} style={styles.sightingPhoto} /> : null}
                </Card>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.novedadesSection}>
          <View style={styles.matchesHeader}>
            <Ionicons name="megaphone" size={18} color={colors.brand} />
            <Title size={17} style={styles.matchesTitle}>
              Novedades
            </Title>
          </View>
          <AppText muted size={13} style={styles.matchesSubtitle}>
            {esMio
              ? 'Contá cómo va la búsqueda. Cada novedad avisa al barrio que el reporte sigue vivo.'
              : 'Lo que el dueño va contando sobre la búsqueda.'}
          </AppText>

          {esMio && (
            <>
              <Input
                value={nuevaNovedad}
                onChangeText={setNuevaNovedad}
                placeholder="Sigo buscando por el sector… gracias a todos."
                multiline
              />
              <Button
                title="Publicar novedad"
                icon="send"
                loading={publicandoNovedad}
                disabled={!nuevaNovedad.trim()}
                onPress={publicarNovedad}
                style={styles.novedadButton}
              />
            </>
          )}

          {novedades.length > 0 ? (
            <View style={styles.novedadesList}>
              {novedades.map((n) => (
                <Card key={n.id} style={styles.novedadCard}>
                  <AppText size={14} style={styles.novedadTexto}>
                    {n.texto}
                  </AppText>
                  <AppText muted size={12} style={styles.novedadMeta}>
                    {timeAgo(n.creado_en)}
                  </AppText>
                </Card>
              ))}
            </View>
          ) : (
            <AppText muted size={13} style={styles.novedadesVacio}>
              El dueño todavía no publicó novedades.
            </AppText>
          )}
        </View>

        {/* Pistas del barrio: la voz del vecindario. A diferencia de Novedades
            (tarjeta llena, voz del dueño), acá cada pista va liviana, con la
            firma de quien la dejó arriba y una guarda de color al costado. */}
        <View style={styles.pistasSection}>
          <View style={styles.matchesHeader}>
            <Ionicons name="chatbubbles-outline" size={18} color={colors.brand} />
            <Title size={17} style={styles.matchesTitle}>
              Pistas del barrio
            </Title>
          </View>
          <AppText muted size={13} style={styles.matchesSubtitle}>
            Lo que fue viendo el vecindario.
          </AppText>

          {user ? (
            <View style={styles.pistaComposer}>
              <Input
                value={nuevaPista}
                onChangeText={setNuevaPista}
                placeholder="Lo vi cruzando la plaza como a las 8 de la tarde…"
                multiline
              />
              {nuevaPista.length > TIP_MAX - 100 ? (
                <AppText
                  muted={nuevaPista.length <= TIP_MAX}
                  size={12}
                  color={nuevaPista.length > TIP_MAX ? colors.lost : undefined}
                  style={styles.pistaContador}
                >
                  {nuevaPista.length} / {TIP_MAX}
                </AppText>
              ) : null}
              <Button
                title="Dejar una pista"
                icon="add-circle-outline"
                variant="secondary"
                loading={dejandoPista}
                disabled={!validarTip(nuevaPista).ok}
                onPress={dejarPista}
                style={styles.pistaBoton}
              />
            </View>
          ) : (
            <Button
              title="Dejar una pista"
              icon="add-circle-outline"
              variant="secondary"
              onPress={pedirCuentaParaPista}
              style={styles.pistaBoton}
            />
          )}

          {pistas.length > 0 ? (
            <View style={styles.pistasList}>
              {pistas.map((t) => (
                <View key={t.id} style={styles.pistaItem}>
                  <View style={styles.pistaFirmaRow}>
                    <Ionicons
                      name="person-circle-outline"
                      size={16}
                      color={colors.muted}
                      style={styles.pistaFirmaIcono}
                    />
                    <AppText weight="semi" size={13} style={styles.pistaFirma}>
                      {firmaAutor(t.autorNombre ?? null, t.autorEliminadoEn ?? null)}
                    </AppText>
                    <AppText muted size={12}>
                      {' · '}
                      {timeAgo(t.creadoEn)}
                    </AppText>
                    <View style={styles.pistaSpacer} />
                    {puedeBorrarTip(t, user?.id ?? null, pet.user_id) ? (
                      <TouchableOpacity
                        onPress={() => eliminarPista(t)}
                        disabled={borrandoPista === t.id}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <AppText size={14} style={styles.pistaTexto}>
                    {t.texto}
                  </AppText>
                </View>
              ))}
            </View>
          ) : (
            <AppText muted size={13} style={styles.pistasVacio}>
              Todavía nadie dejó una pista. Si viste algo, contalo — cualquier dato suma.
            </AppText>
          )}
        </View>

        {/* Historia: la línea de tiempo del caso (publicado → avistamientos →
            reencuentro), derivada de datos que ya tenemos. */}
        <View style={styles.historiaSection}>
          <View style={styles.matchesHeader}>
            <Ionicons name="time-outline" size={18} color={colors.brand} />
            <Title size={17} style={styles.matchesTitle}>
              Historia
            </Title>
          </View>
          <View style={styles.timeline}>
            {historia.map((ev, i) => (
              <View key={`${ev.tipo}-${ev.fecha}-${i}`} style={styles.timelineRow}>
                <View style={styles.timelineGutter}>
                  <View style={[styles.timelineDot, { backgroundColor: timelineColor[ev.tipo] }]}>
                    <Ionicons name={timelineIcono[ev.tipo]} size={13} color={colors.white} />
                  </View>
                  {i < historia.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineBody}>
                  <AppText weight="semi" size={14}>
                    {ev.titulo}
                  </AppText>
                  <AppText muted size={12} style={styles.timelineMeta}>
                    {timeAgo(ev.fecha)}
                  </AppText>
                  {ev.detalle ? (
                    <AppText size={13} style={styles.timelineDetalle}>
                      {ev.detalle}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>

        {matches.length > 0 && (
          <View style={styles.matchesSection}>
            <View style={styles.matchesHeader}>
              <Ionicons name="sparkles" size={18} color={colors.brand} />
              <Title size={17} style={styles.matchesTitle}>
                Posibles coincidencias
              </Title>
            </View>
            <AppText muted size={13} style={styles.matchesSubtitle}>
              {pet.estado === 'perdida'
                ? 'Mascotas encontradas cerca que podrían ser la tuya.'
                : 'Personas que buscan una mascota parecida por la zona.'}
            </AppText>
            <View style={styles.matchesList}>
              {matches.map((m) => (
                <PetCard
                  key={m.id}
                  pet={m as unknown as Pet}
                  distanceKm={m.distancia_km}
                  onPress={() => navigation.push('PetDetail', { id: m.id })}
                />
              ))}
            </View>
          </View>
        )}

        {!esMio && (
          <View style={styles.reportSection}>
            <Button
              title="Denunciar"
              variant="ghost"
              icon="flag-outline"
              disabled={enviandoDenuncia}
              onPress={abrirMotivosDenuncia}
              style={styles.reportButton}
            />
            {mostrarMotivos ? (
              <View style={styles.reasonList}>
                <AppText muted size={13} style={styles.reasonTitle}>
                  ¿Por qué quieres denunciar este reporte?
                </AppText>
                {MOTIVOS_DENUNCIA.map((motivo) => (
                  <Button
                    key={motivo}
                    title={motivo}
                    variant="secondary"
                    loading={enviandoDenuncia}
                    disabled={enviandoDenuncia}
                    onPress={() => denunciar(motivo)}
                    style={styles.reasonButton}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}

        {generandoAfiche && perfil && (
          <AficheGenerator pet={pet} profile={perfil} onDone={onAficheDone} onError={onAficheError} />
        )}
      </ScrollView>
      <Confetti visible={mostrarConfetti} onDone={() => setMostrarConfetti(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  photo: {
    width: '100%',
    height: 260,
    borderRadius: radius.md,
  },
  photoPlaceholder: {
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  dotActive: {
    backgroundColor: colors.brand,
    width: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  title: {
    flexShrink: 1,
  },
  meta: {
    marginTop: 2,
  },
  descriptionCard: {
    marginTop: spacing.xs,
  },
  descriptionText: {
    lineHeight: 22,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.sun,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rewardIcon: {
    marginRight: spacing.xs,
  },
  map: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  contactButton: {
    marginTop: spacing.md,
  },
  shareButton: {
    marginTop: spacing.md,
  },
  sightingsSection: {
    marginTop: spacing.lg,
  },
  sightingButton: {
    marginTop: spacing.md,
  },
  sightingsList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sightingCard: {
    gap: spacing.sm,
  },
  sightingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sightingIcon: {
    marginTop: 2,
    marginRight: spacing.sm,
  },
  sightingBody: {
    flex: 1,
  },
  sightingNote: {
    lineHeight: 20,
  },
  sightingMeta: {
    marginTop: 2,
  },
  sightingPhoto: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
  },
  finalCard: {
    marginTop: spacing.md,
    backgroundColor: colors.sky,
    gap: spacing.xs,
  },
  finalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors.found,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  finalBadgeLabel: {
    letterSpacing: 0.5,
  },
  finalTitle: {
    marginTop: spacing.sm,
    lineHeight: 24,
  },
  finalSub: {
    marginTop: 2,
  },
  finalNota: {
    marginTop: spacing.sm,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  finalFoto: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  reunionPanel: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  reunionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reunionHeaderTitle: {
    flexShrink: 1,
  },
  reunionText: {
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  reunionPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
  },
  reunionAction: {
    marginTop: spacing.xs,
  },
  novedadesSection: {
    marginTop: spacing.lg,
  },
  novedadButton: {
    marginTop: spacing.sm,
  },
  novedadesList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  novedadCard: {
    gap: spacing.xs,
  },
  novedadTexto: {
    lineHeight: 20,
  },
  novedadMeta: {
    marginTop: 2,
  },
  novedadesVacio: {
    marginTop: spacing.sm,
  },
  pistasSection: {
    marginTop: spacing.lg,
  },
  pistaComposer: {
    marginTop: spacing.xs,
  },
  pistaContador: {
    textAlign: 'right',
    marginTop: 2,
  },
  pistaBoton: {
    marginTop: spacing.sm,
  },
  pistasList: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  // Sin tarjeta: una guarda de color al costado deja la pista más liviana que
  // una novedad del dueño, que sí va en Card.
  pistaItem: {
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
    paddingLeft: spacing.md,
  },
  pistaFirmaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pistaFirmaIcono: {
    marginRight: spacing.xs,
  },
  pistaFirma: {
    flexShrink: 1,
  },
  pistaSpacer: {
    flex: 1,
  },
  pistaTexto: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  pistasVacio: {
    marginTop: spacing.md,
    lineHeight: 19,
  },
  matchesSection: {
    marginTop: spacing.lg,
  },
  matchesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  matchesTitle: {
    flexShrink: 1,
  },
  matchesSubtitle: {
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  matchesList: {
    gap: spacing.md,
  },
  reportSection: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  reportButton: {
    minHeight: 0,
    paddingVertical: spacing.xs,
  },
  reasonList: {
    width: '100%',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  reasonTitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  reasonButton: {
    width: '100%',
  },
  historiaSection: {
    marginTop: spacing.lg,
  },
  timeline: {
    marginTop: spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineGutter: {
    alignItems: 'center',
    marginRight: spacing.md,
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: spacing.md,
    backgroundColor: colors.line,
    marginTop: 2,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: spacing.lg,
  },
  timelineMeta: {
    marginTop: 2,
  },
  timelineDetalle: {
    marginTop: spacing.xs,
    lineHeight: 19,
  },
});

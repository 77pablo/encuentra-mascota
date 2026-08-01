import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import MapView, { Marker } from '../components/PlatformMap';
import { archivarReporte, getPet, Pet, renovarReporte } from '../services/pets';
import { buscarCoincidencias, Coincidencia } from '../services/busqueda';
import { NudgeVigencia } from '../components/NudgeVigencia';
import { PlanBusqueda } from '../components/PlanBusqueda';
import { markReunited } from '../services/reunions';
import {
  denunciarAvistamiento,
  denunciarPista,
  denunciarReporte,
  MOTIVOS_DENUNCIA,
  TipoDenuncia,
} from '../services/moderation';
import { useAuth } from '../hooks/useAuth';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { shareReport } from '../lib/share';
import { deleteSighting, listSightings, Sighting } from '../services/sightings';
import { addUpdate, listUpdates, PetUpdate } from '../services/petUpdates';
import { borrarTip, crearTip, listarTips } from '../services/tips';
import { firmaAutor, puedeBorrarTip, validarTip, Tip, TIP_MAX } from '../lib/tips';
import {
  puedeBorrarAvistamiento,
  sortByRecency,
  sightingDistanceKm,
  summaryLabel,
} from '../lib/sightings';
import { distanceLabel } from '../lib/geo';
import { isReunited, reunionLabel } from '../lib/reunion';
import { timeAgo } from '../lib/time';
import { buildTimeline, TimelineTipo } from '../lib/timeline';
import { confirmAction, notify } from '../lib/notify';
import { pickFromLibrary } from '../lib/pickImage';
import { uploadPetPhoto } from '../services/storage';
import PetCard from '../components/PetCard';
import { GraciasVecinos } from '../components/GraciasVecinos';
import AficheGenerator from '../components/AficheGenerator';
import TarjetaGenerador from '../components/TarjetaGenerador';
import { datosDeReporte, datosDeFinalFeliz } from '../lib/tarjeta';
import { faltaWhatsapp } from '../lib/afiche';
import { getMyProfile, getNombrePublico, Profile } from '../services/profile';
import { AppText, AvisoEstafa, Badge, Button, Card, Confetti, ErrorState, Input, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

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
function timelineColorDe(colors: Colors): Record<TimelineTipo, string> {
  return {
    publicado: colors.brand,
    avistamiento: colors.sun,
    reunido: colors.found,
  };
}

export default function PetDetailScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const timelineColor = useMemo(() => timelineColorDe(colors), [colors]);
  const { id } = route.params;
  const { user } = useAuth();
  // Portero del modo invitado: primera línea de cada acción protegida.
  const requireAuth = useRequireAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // Denuncia unificada: apunta a lo que se está denunciando (el reporte, una
  // pista o un avistamiento). null = ningún selector de motivos abierto.
  const [denunciaTarget, setDenunciaTarget] = useState<{ tipo: TipoDenuncia; id: string } | null>(null);
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);
  const [matches, setMatches] = useState<Coincidencia[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [borrandoAvistamiento, setBorrandoAvistamiento] = useState<string | null>(null);
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
  const [duenoNombre, setDuenoNombre] = useState<string | null>(null);
  const [generandoAfiche, setGenerandoAfiche] = useState(false);
  // "Compartir tarjeta" (F1): monta TarjetaGenerador off-screen, que se
  // encarga de capturar y compartir (mismo patrón que el afiche, ver abajo).
  const [compartiendoTarjeta, setCompartiendoTarjeta] = useState(false);
  // "Compartir tarjeta" de FINAL FELIZ (F4): flujo aparte del de arriba (banda
  // y color distintos, "¡VOLVIÓ A CASA!" en vez de PERDIDA/ENCONTRADA). Se
  // ofrece una vez tras el confetti del reencuentro, y queda disponible
  // siempre que el reporte propio esté reunido.
  const [compartiendoTarjetaFinal, setCompartiendoTarjetaFinal] = useState(false);
  // Flujo "¡Volvió a casa!" (final feliz)
  const [mostrarReunion, setMostrarReunion] = useState(false);
  const [notaFeliz, setNotaFeliz] = useState('');
  const [fotoFeliz, setFotoFeliz] = useState<string | null>(null);
  const [guardandoReunion, setGuardandoReunion] = useState(false);
  const [mostrarConfetti, setMostrarConfetti] = useState(false);
  // Nudge de vigencia (ciclo de vida): "sigue perdida" / "archivar".
  const [guardandoVigencia, setGuardandoVigencia] = useState(false);

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

  // Nombre público del dueño, para la fila "Publicado por … →" que enlaza a su
  // perfil público. Silencioso: si no se puede leer, no se muestra la fila.
  useEffect(() => {
    if (!pet) {
      setDuenoNombre(null);
      return;
    }
    let vivo = true;
    getNombrePublico(pet.user_id)
      .then((n) => {
        if (vivo) setDuenoNombre(n);
      })
      .catch((e) => {
        // Igual que en AdopcionDetail: el reporte se lee entero sin el nombre.
        console.warn('No se pudo leer el nombre de quien publicó:', e?.message ?? e);
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

  // Borrar un avistamiento del rastro. Lo puede hacer quien lo dejó (se
  // equivocó de pin) y el dueño del reporte (le metieron una pista falsa en SU
  // reporte). Con confirmación: el rastro es parte de la historia del caso.
  const eliminarAvistamiento = async (s: Sighting) => {
    const ok = await confirmAction(
      '¿Borrar este avistamiento?',
      'Va a desaparecer del rastro y del mapa para todos. No se puede deshacer.',
    );
    if (!ok) return;
    setBorrandoAvistamiento(s.id);
    try {
      await deleteSighting(s.id);
      setSightings((actuales) => actuales.filter((x) => x.id !== s.id));
    } catch (e: any) {
      notify('No se pudo borrar', mensajeDeErrorDb(e));
    } finally {
      setBorrandoAvistamiento(null);
    }
  };

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

  // Abre (o cierra, si se vuelve a tocar lo mismo) el selector de motivos para
  // denunciar el reporte, una pista o un avistamiento.
  const abrirDenuncia = (tipo: TipoDenuncia, targetId: string) => {
    if (!requireAuth('denunciar')) return;
    setDenunciaTarget((actual) =>
      actual && actual.tipo === tipo && actual.id === targetId ? null : { tipo, id: targetId },
    );
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

  // Tras el confetti del reencuentro (F4), ofrecemos UNA vez la tarjeta de
  // final feliz. Silencioso ante "no": el botón permanente de la tarjeta del
  // reencuentro (más abajo, en la finalCard) queda disponible para siempre.
  const onConfettiDone = async () => {
    setMostrarConfetti(false);
    const quiere = await confirmAction(
      'Compartir tarjeta',
      '¿Quieres compartir una tarjeta de este reencuentro (para WhatsApp o redes)?',
    );
    if (quiere) setCompartiendoTarjetaFinal(true);
  };

  // "Sigue perdida": renueva el reporte (reinicia el reloj de 45 días) para que
  // siga apareciendo en las búsquedas. Reflejamos el cambio sin volver a la base.
  const renovarVigencia = async () => {
    if (!pet) return;
    setGuardandoVigencia(true);
    try {
      await renovarReporte(pet.id);
      setPet({ ...pet, renovado_en: new Date().toISOString() });
      notify('Gracias', 'Tu reporte sigue activo. Seguimos buscando.');
    } catch (e: any) {
      notify('No se pudo actualizar', mensajeDeErrorDb(e));
    } finally {
      setGuardandoVigencia(false);
    }
  };

  // "Archivar por ahora": lo vence ya (sale de las búsquedas), pero queda en
  // "Mis reportes" para reactivarlo con un toque. No se borra nada.
  const archivarVigencia = async () => {
    if (!pet) return;
    const ok = await confirmAction(
      '¿Archivar este reporte?',
      'Dejará de aparecer en las búsquedas y el mapa. Podés reactivarlo cuando quieras desde tu perfil.',
    );
    if (!ok) return;
    setGuardandoVigencia(true);
    try {
      await archivarReporte(pet.id);
      const hace46Dias = new Date(Date.now() - 46 * 24 * 60 * 60 * 1000).toISOString();
      setPet({ ...pet, renovado_en: hace46Dias });
      notify('Archivado', 'Tu reporte quedó guardado. Lo reactivás cuando quieras.');
    } catch (e: any) {
      notify('No se pudo archivar', mensajeDeErrorDb(e));
    } finally {
      setGuardandoVigencia(false);
    }
  };

  const crearAfiche = async () => {
    if (!user) return;
    try {
      // `user.id` es solo el respaldo de la ventana de despliegue (ver
      // src/services/profile.ts): el servidor decide de quien es la fila.
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
    if (!user || !pet || !denunciaTarget) return;
    const { tipo, id: targetId } = denunciaTarget;
    setEnviandoDenuncia(true);
    try {
      if (tipo === 'pista') {
        await denunciarPista(targetId, user.id, motivo);
      } else if (tipo === 'avistamiento') {
        await denunciarAvistamiento(targetId, user.id, motivo);
      } else {
        await denunciarReporte(pet.id, user.id, motivo);
      }
      setDenunciaTarget(null);
      notify('Gracias', 'Recibimos tu denuncia y la revisaremos dentro de las próximas 24 horas.');
    } catch (e: any) {
      setDenunciaTarget(null);
      // `denunciar…` ya traduce el duplicado (23505) a un ErrorAmigable claro.
      notify('Aviso', mensajeDeErrorDb(e));
    } finally {
      setEnviandoDenuncia(false);
    }
  };

  // Lista de botones de motivo para el selector abierto sobre `tipo`/`id`. Se
  // reutiliza en el reporte, en cada pista y en cada avistamiento.
  const renderMotivos = (tipo: TipoDenuncia, targetId: string) => {
    if (!denunciaTarget || denunciaTarget.tipo !== tipo || denunciaTarget.id !== targetId) return null;
    return (
      <View style={styles.reasonList}>
        <AppText muted size={13} style={styles.reasonTitle}>
          ¿Por qué querés denunciar?
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
    );
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

        {!esMio && duenoNombre ? (
          <TouchableOpacity
            style={styles.duenoRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('PublicProfile', { userId: pet.user_id })}
          >
            <Ionicons name="person-circle-outline" size={16} color={colors.brand} />
            <AppText size={13} color={colors.brand} style={styles.duenoTexto}>
              Publicado por {duenoNombre}
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </TouchableOpacity>
        ) : null}

        <Card style={styles.descriptionCard}>
          <AppText size={15} style={styles.descriptionText}>
            {pet.descripcion}
          </AppText>
        </Card>

        {/* Nudge de vigencia: solo en el reporte propio, no reunido, cuando ya
            pasaron 14+ días sin renovar. Se dibuja solo (null) si no toca. */}
        {esMio && !reunida ? (
          <NudgeVigencia
            pet={pet}
            onVolvio={() => setMostrarReunion(true)}
            onRenovar={renovarVigencia}
            onArchivar={archivarVigencia}
            guardando={guardandoVigencia}
          />
        ) : null}

        {/* Plan de búsqueda con reloj: sólo en el reporte PROPIO de una mascota
            perdida que todavía no volvió. En el reporte de otra persona no
            corresponde (no es quien busca), y en uno de mascota encontrada
            tampoco. El progreso vive local, sin migración. */}
        {esMio && !reunida && pet.estado === 'perdida' ? (
          <PlanBusqueda pet={pet} navigation={navigation} onAfiche={crearAfiche} />
        ) : null}

        {pet.recompensa ? (
          <>
            <View style={styles.rewardPill}>
              <Ionicons name="sunny" size={16} color={colors.ink} style={styles.rewardIcon} />
              <AppText weight="bold" size={14} color={colors.ink}>
                Recompensa: {pet.recompensa}
              </AppText>
            </View>
            <View style={styles.avisoEstafa}>
              <AvisoEstafa variante="recompensa" />
            </View>
          </>
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
            {/* Cerrar el círculo: quien dejó una pista o marcó un avistamiento
                ayudó, y hasta ahora la historia terminaba bien sin que nadie se
                lo dijera. Se dibuja solo si hubo alguien (ver GraciasVecinos). */}
            <GraciasVecinos pistas={pistas} avistamientos={sightings} duenoId={pet.user_id} />
            {esMio ? (
              <Button
                title="Compartir tarjeta del reencuentro"
                variant="secondary"
                icon="image"
                loading={compartiendoTarjetaFinal}
                onPress={() => setCompartiendoTarjetaFinal(true)}
                style={styles.reunionAction}
              />
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

        <Button
          title="Compartir tarjeta"
          variant="secondary"
          icon="image"
          loading={compartiendoTarjeta}
          onPress={() => setCompartiendoTarjeta(true)}
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
                    {s.user_id && s.user_id !== user?.id ? (
                      <TouchableOpacity
                        onPress={() => abrirDenuncia('avistamiento', s.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.sightingFlag}
                        accessibilityRole="button"
                        accessibilityLabel="Denunciar este avistamiento"
                      >
                        <Ionicons name="flag-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ) : null}
                    {puedeBorrarAvistamiento(s, user?.id ?? null, pet.user_id) ? (
                      <TouchableOpacity
                        onPress={() => eliminarAvistamiento(s)}
                        disabled={borrandoAvistamiento === s.id}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.sightingFlag}
                        accessibilityRole="button"
                        accessibilityLabel="Borrar este avistamiento"
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {s.foto ? <Image source={{ uri: s.foto }} style={styles.sightingPhoto} /> : null}
                  {renderMotivos('avistamiento', s.id)}
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
                    {!t.autorEliminadoEn && (t.autorNombre ?? '').trim() ? (
                      // Autor resoluble (no anonimizado): la firma enlaza a su
                      // perfil público. "Un vecino" (borrado o sin nombre) no.
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('PublicProfile', { userId: t.userId })}
                      >
                        <AppText weight="semi" size={13} color={colors.brand} style={styles.pistaFirma}>
                          {firmaAutor(t.autorNombre ?? null, t.autorEliminadoEn ?? null)}
                        </AppText>
                      </TouchableOpacity>
                    ) : (
                      <AppText weight="semi" size={13} style={styles.pistaFirma}>
                        {firmaAutor(t.autorNombre ?? null, t.autorEliminadoEn ?? null)}
                      </AppText>
                    )}
                    <AppText muted size={12}>
                      {' · '}
                      {timeAgo(t.creadoEn)}
                    </AppText>
                    <View style={styles.pistaSpacer} />
                    {t.userId && t.userId !== user?.id ? (
                      <TouchableOpacity
                        onPress={() => abrirDenuncia('pista', t.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.pistaAccionIcono}
                      >
                        <Ionicons name="flag-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ) : null}
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
                  {renderMotivos('pista', t.id)}
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
              onPress={() => abrirDenuncia('reporte', pet.id)}
              style={styles.reportButton}
            />
            {renderMotivos('reporte', pet.id)}
          </View>
        )}

        {generandoAfiche && perfil && (
          <AficheGenerator pet={pet} profile={perfil} onDone={onAficheDone} onError={onAficheError} />
        )}

        {compartiendoTarjeta && (
          <TarjetaGenerador datos={datosDeReporte(pet)} onFin={() => setCompartiendoTarjeta(false)} />
        )}

        {compartiendoTarjetaFinal && (
          <TarjetaGenerador
            datos={datosDeFinalFeliz(pet)}
            onFin={() => setCompartiendoTarjetaFinal(false)}
          />
        )}
      </ScrollView>
      <Confetti visible={mostrarConfetti} onDone={onConfettiDone} />
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
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
  duenoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  duenoTexto: {
    flexShrink: 1,
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
  avisoEstafa: {
    marginTop: spacing.sm,
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
  sightingFlag: {
    marginLeft: spacing.sm,
    marginTop: 2,
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
  pistaAccionIcono: {
    marginRight: spacing.md,
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

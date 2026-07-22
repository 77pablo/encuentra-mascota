import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { Adoption, deleteAdoption, getAdoption, marcarAdoptada } from '../services/adoptions';
import { denunciarAdopcion, denunciarPregunta, MOTIVOS_DENUNCIA } from '../services/moderation';
import {
  AdoptionQuestion,
  answerQuestion,
  askQuestion,
  deleteQuestion,
  listQuestions,
} from '../services/adoptionQuestions';
import { firmaAutor } from '../lib/tips';
import { getNombrePublico } from '../services/profile';
import { useAuth } from '../hooks/useAuth';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useAdoptionSaves } from '../context/AdoptionSavesProvider';
import { confirmAction, notify } from '../lib/notify';
import { timeAgo } from '../lib/time';
import { AppText, Button, Card, Confetti, ErrorState, Input, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Molde: PetDetailScreen (detalle de un reporte). Misma mecánica general
// (carrusel, "es mío", contactar, denunciar), pero más simple: no hay
// avistamientos, novedades, pistas ni coincidencias — solo los datos de la
// publicación y el final feliz ("¡Ya encontró familia!").

const especieLabel: Record<Adoption['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const edadLabel: Record<NonNullable<Adoption['edad']>, string> = {
  cachorro: 'Cachorro',
  adulto: 'Adulto',
  senior: 'Senior',
};

const tamanoLabel: Record<NonNullable<Adoption['tamano']>, string> = {
  chico: 'Chico',
  mediano: 'Mediano',
  grande: 'Grande',
};

const esterilizadoLabel: Record<NonNullable<Adoption['esterilizado']>, string> = {
  si: 'Sí',
  no: 'No',
  no_se: 'No se sabe',
};

const vacunasLabel: Record<NonNullable<Adoption['vacunas']>, string> = {
  al_dia: 'Al día',
  no: 'No',
  no_se: 'No se sabe',
};

const triLabel: Record<'si' | 'no' | 'no_se', string> = {
  si: 'Sí',
  no: 'No',
  no_se: 'No se sabe',
};

export default function AdopcionDetailScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { id } = route.params;
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const { estaGuardada, alternar } = useAdoptionSaves();
  const [adoption, setAdoption] = useState<Adoption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [denunciaAbierta, setDenunciaAbierta] = useState(false);
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);
  const [borrando, setBorrando] = useState(false);
  // Panel del final feliz ("¡Ya encontró familia!"), espeja el de reencuentro
  // de PetDetailScreen pero sin foto obligatoria (acá es más simple).
  const [mostrarCelebracion, setMostrarCelebracion] = useState(false);
  const [notaFeliz, setNotaFeliz] = useState('');
  const [guardandoCelebracion, setGuardandoCelebracion] = useState(false);
  const [mostrarConfetti, setMostrarConfetti] = useState(false);
  // Preguntas públicas (F3): la voz de quien quiere adoptar, respondida por
  // el dueño de la publicación. Mismo patrón que las pistas del barrio en
  // PetDetailScreen (composer + lista + firma + denunciar/borrar).
  const [duenoNombre, setDuenoNombre] = useState<string | null>(null);
  const [preguntas, setPreguntas] = useState<AdoptionQuestion[]>([]);
  const [nuevaPregunta, setNuevaPregunta] = useState('');
  const [enviandoPregunta, setEnviandoPregunta] = useState(false);
  const [respondiendoId, setRespondiendoId] = useState<string | null>(null);
  const [respuestaBorrador, setRespuestaBorrador] = useState<Record<string, string>>({});
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);
  const [borrandoPreguntaId, setBorrandoPreguntaId] = useState<string | null>(null);
  const [denunciaPreguntaId, setDenunciaPreguntaId] = useState<string | null>(null);
  const [enviandoDenunciaPregunta, setEnviandoDenunciaPregunta] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    getAdoption(id)
      .then(setAdoption)
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Nombre público de quien publicó, para la firma "Responde …" de las
  // preguntas contestadas. Silencioso: si no se puede leer, no se muestra.
  useEffect(() => {
    if (!adoption) {
      setDuenoNombre(null);
      return;
    }
    let vivo = true;
    getNombrePublico(adoption.user_id)
      .then((n) => {
        if (vivo) setDuenoNombre(n);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [adoption]);

  // Carga las preguntas públicas. Se refresca al recuperar el foco, igual que
  // las pistas del barrio en PetDetailScreen.
  const cargarPreguntas = useCallback(() => {
    listQuestions(id)
      .then(setPreguntas)
      .catch(() => setPreguntas([]));
  }, [id]);

  useEffect(() => {
    cargarPreguntas();
    const off = navigation.addListener('focus', cargarPreguntas);
    return off;
  }, [navigation, cargarPreguntas]);

  const preguntar = async () => {
    if (!requireAuth('preguntar_adopcion')) return;
    const texto = nuevaPregunta.trim();
    if (!texto) return;
    setEnviandoPregunta(true);
    try {
      await askQuestion(id, texto);
      setNuevaPregunta('');
      cargarPreguntas();
    } catch (e: any) {
      notify('No se pudo preguntar', mensajeDeErrorDb(e));
    } finally {
      setEnviandoPregunta(false);
    }
  };

  const pedirCuentaParaPreguntar = () => {
    requireAuth('preguntar_adopcion');
  };

  const abrirRespuesta = (preguntaId: string) => {
    setRespondiendoId((actual) => (actual === preguntaId ? null : preguntaId));
  };

  const responder = async (preguntaId: string) => {
    const texto = (respuestaBorrador[preguntaId] ?? '').trim();
    if (!texto) return;
    setEnviandoRespuesta(true);
    try {
      await answerQuestion(preguntaId, texto);
      setRespuestaBorrador((b) => ({ ...b, [preguntaId]: '' }));
      setRespondiendoId(null);
      cargarPreguntas();
    } catch (e: any) {
      notify('No se pudo responder', mensajeDeErrorDb(e));
    } finally {
      setEnviandoRespuesta(false);
    }
  };

  const eliminarPregunta = async (preguntaId: string) => {
    const ok = await confirmAction('¿Borrar esta pregunta?', 'Se va a eliminar para todos.');
    if (!ok) return;
    setBorrandoPreguntaId(preguntaId);
    try {
      await deleteQuestion(preguntaId);
      setPreguntas((actuales) => actuales.filter((p) => p.id !== preguntaId));
    } catch (e: any) {
      notify('No se pudo borrar', mensajeDeErrorDb(e));
    } finally {
      setBorrandoPreguntaId(null);
    }
  };

  const abrirDenunciaPregunta = (preguntaId: string) => {
    if (!requireAuth('denunciar')) return;
    setDenunciaPreguntaId((actual) => (actual === preguntaId ? null : preguntaId));
  };

  const denunciarPreguntaSeleccionada = async (motivo: string) => {
    if (!user || !denunciaPreguntaId) return;
    const pregunta = preguntas.find((p) => p.id === denunciaPreguntaId);
    if (!pregunta) return;
    setEnviandoDenunciaPregunta(true);
    try {
      await denunciarPregunta(pregunta.id, pregunta.userId, user.id, motivo);
      setDenunciaPreguntaId(null);
      notify('Gracias', 'Recibimos tu denuncia y la revisaremos dentro de las próximas 24 horas.');
    } catch (e: any) {
      setDenunciaPreguntaId(null);
      notify('Aviso', mensajeDeErrorDb(e));
    } finally {
      setEnviandoDenunciaPregunta(false);
    }
  };

  const renderMotivosPregunta = (preguntaId: string) => {
    if (denunciaPreguntaId !== preguntaId) return null;
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
            loading={enviandoDenunciaPregunta}
            disabled={enviandoDenunciaPregunta}
            onPress={() => denunciarPreguntaSeleccionada(motivo)}
            style={styles.reasonButton}
          />
        ))}
      </View>
    );
  };

  const onCarouselLayout = (e: LayoutChangeEvent) => {
    setCarouselWidth(e.nativeEvent.layout.width);
  };

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth) return;
    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / carouselWidth));
  };

  if (loading) {
    return <Loading />;
  }

  if (error || !adoption) {
    return (
      <Screen padded>
        <ErrorState message={error ?? undefined} onRetry={cargar} />
      </Screen>
    );
  }

  const esMio = adoption.user_id === user?.id;
  const adoptada = adoption.adoptada_en != null;
  const guardada = estaGuardada(adoption.id);
  const nombreMostrar = adoption.nombre || especieLabel[adoption.especie];

  const metaPartes = [especieLabel[adoption.especie]];
  if (adoption.edad) metaPartes.push(edadLabel[adoption.edad]);
  if (adoption.tamano) metaPartes.push(tamanoLabel[adoption.tamano]);
  if (adoption.comuna) metaPartes.push(adoption.comuna);
  metaPartes.push(timeAgo(adoption.creado_en));

  const salud: { label: string; valor: string }[] = [];
  if (adoption.esterilizado) salud.push({ label: 'Esterilizado', valor: esterilizadoLabel[adoption.esterilizado] });
  if (adoption.vacunas) salud.push({ label: 'Vacunas', valor: vacunasLabel[adoption.vacunas] });

  const convivencia: { label: string; valor: string }[] = [];
  if (adoption.convive_ninos) convivencia.push({ label: 'Con niños', valor: triLabel[adoption.convive_ninos] });
  if (adoption.convive_perros) convivencia.push({ label: 'Con perros', valor: triLabel[adoption.convive_perros] });
  if (adoption.convive_gatos) convivencia.push({ label: 'Con gatos', valor: triLabel[adoption.convive_gatos] });

  const contactar = () => {
    if (!requireAuth('contactar')) return;
    // AdopcionDetail vive en el stack RAÍZ (para el link público `adopcion/:id`),
    // y ahí NO existe la pantalla `Chat`. Un `navigate('Chat')` a secas burbujea
    // hacia arriba y queda sin manejar (CTA muerto). Hay que direccionar de forma
    // anidada y absoluta hasta el `Chat` que vive dentro de la pestaña Adopción,
    // igual que `PublicPetScreen` salta a la pestaña Mapa para abrir su chat.
    navigation.navigate('App', {
      screen: 'Adopcion',
      params: {
        screen: 'Chat',
        params: { adoptionId: adoption.id, otherUserId: adoption.user_id },
      },
    });
  };

  const alternarGuardado = () => {
    if (!requireAuth('guardar')) return;
    alternar(adoption.id);
  };

  const abrirDenuncia = () => {
    if (!requireAuth('denunciar')) return;
    setDenunciaAbierta((v) => !v);
  };

  const denunciar = async (motivo: string) => {
    if (!requireAuth('denunciar')) return;
    if (!user) return;
    setEnviandoDenuncia(true);
    try {
      await denunciarAdopcion(adoption.id, user.id, motivo);
      setDenunciaAbierta(false);
      notify('Gracias', 'Recibimos tu denuncia y la revisaremos dentro de las próximas 24 horas.');
    } catch (e: any) {
      setDenunciaAbierta(false);
      notify('Aviso', mensajeDeErrorDb(e));
    } finally {
      setEnviandoDenuncia(false);
    }
  };

  const editar = () => {
    // AdopcionDetail vive en el stack RAÍZ (link público `adopcion/:id`);
    // EditAdoption vive dentro del stack de la pestaña Adopción. Navegación
    // anidada absoluta, mismo patrón que `contactar` arriba.
    navigation.navigate('App', {
      screen: 'Adopcion',
      params: { screen: 'EditAdoption', params: { adoption } },
    });
  };

  const borrar = async () => {
    if (!user) return;
    const ok = await confirmAction(
      '¿Borrar esta publicación?',
      'Se va a eliminar del feed de adopción para siempre. No se puede deshacer.',
    );
    if (!ok) return;
    setBorrando(true);
    try {
      await deleteAdoption(adoption.id, user.id);
      notify('Borrada', 'Tu publicación fue eliminada.');
      navigation.goBack();
    } catch (e: any) {
      notify('No se pudo borrar', mensajeDeErrorDb(e));
    } finally {
      setBorrando(false);
    }
  };

  const confirmarCelebracion = async () => {
    if (!requireAuth('reencuentro')) return;
    setGuardandoCelebracion(true);
    try {
      await marcarAdoptada(adoption.id);
      setAdoption({ ...adoption, adoptada_en: new Date().toISOString() });
      setMostrarCelebracion(false);
      setNotaFeliz('');
      setMostrarConfetti(true);
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setGuardandoCelebracion(false);
    }
  };

  const renderMotivos = () => {
    if (!denunciaAbierta) return null;
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
        {adoption.fotos.length > 0 ? (
          <View onLayout={onCarouselLayout}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onCarouselScroll}
              onMomentumScrollEnd={onCarouselScroll}
              scrollEventThrottle={16}
            >
              {adoption.fotos.map((f) => (
                <Image
                  key={f}
                  source={{ uri: f }}
                  style={[styles.photo, carouselWidth ? { width: carouselWidth } : null]}
                />
              ))}
            </ScrollView>
            {adoption.fotos.length > 1 ? (
              <View style={styles.dotsRow}>
                {adoption.fotos.map((f, i) => (
                  <View key={f} style={[styles.dot, i === activeIndex && styles.dotActive]} />
                ))}
              </View>
            ) : null}
            <TouchableOpacity activeOpacity={0.7} style={styles.heartButton} onPress={alternarGuardado}>
              <Ionicons
                name={guardada ? 'heart' : 'heart-outline'}
                size={24}
                color={guardada ? colors.lost : colors.white}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <AppText size={48}>🐾</AppText>
          </View>
        )}

        <View style={styles.headerRow}>
          <Title size={22} numberOfLines={2} style={styles.title}>
            {nombreMostrar}
          </Title>
          {esMio ? (
            <View style={styles.ownBadge}>
              <AppText weight="bold" color={colors.white} size={11}>
                Tu publicación
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText muted size={13} style={styles.meta}>
          {metaPartes.join('  ·  ')}
        </AppText>

        <Card style={styles.descriptionCard}>
          <AppText size={15} style={styles.descriptionText}>
            {adoption.descripcion}
          </AppText>
        </Card>

        {salud.length > 0 ? (
          <View style={styles.infoSection}>
            <Title size={16} style={styles.infoTitle}>
              Salud
            </Title>
            {salud.map((s) => (
              <View key={s.label} style={styles.infoRow}>
                <AppText muted size={14}>
                  {s.label}
                </AppText>
                <AppText weight="semi" size={14}>
                  {s.valor}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {convivencia.length > 0 ? (
          <View style={styles.infoSection}>
            <Title size={16} style={styles.infoTitle}>
              Convivencia
            </Title>
            {convivencia.map((c) => (
              <View key={c.label} style={styles.infoRow}>
                <AppText muted size={14}>
                  {c.label}
                </AppText>
                <AppText weight="semi" size={14}>
                  {c.valor}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {adoption.requisitos ? (
          <View style={styles.infoSection}>
            <Title size={16} style={styles.infoTitle}>
              Requisitos para adoptarla
            </Title>
            <AppText size={14} style={styles.requisitosText}>
              {adoption.requisitos}
            </AppText>
          </View>
        ) : null}

        {adoptada ? (
          <Card style={styles.finalCard}>
            <View style={styles.finalBadge}>
              <Ionicons name="heart" size={13} color={colors.white} />
              <AppText weight="bold" color={colors.white} size={11} style={styles.finalBadgeLabel}>
                FINAL FELIZ
              </AppText>
            </View>
            <Title size={18} style={styles.finalTitle}>
              ¡Qué alegría! {nombreMostrar} ya encontró familia
            </Title>
          </Card>
        ) : (
          <>
            {!esMio && (
              <Button
                title="Quiero conocerlo"
                icon="chatbubble-ellipses"
                onPress={contactar}
                style={styles.actionButton}
              />
            )}

            {esMio && (
              <Button
                title="¡Ya encontró familia!"
                icon="heart"
                onPress={() => setMostrarCelebracion((v) => !v)}
                style={styles.actionButton}
              />
            )}

            {esMio && mostrarCelebracion && (
              <Card style={styles.celebracionPanel}>
                <View style={styles.celebracionHeader}>
                  <Ionicons name="home" size={18} color={colors.brand} />
                  <Title size={16} style={styles.celebracionHeaderTitle}>
                    ¿{nombreMostrar} ya tiene un hogar?
                  </Title>
                </View>
                <AppText muted size={13} style={styles.celebracionText}>
                  Qué buena noticia. La publicación va a salir del feed, pero los mensajes y guardados quedan.
                </AppText>
                <Input
                  label="Un mensajito para cerrar (opcional)"
                  value={notaFeliz}
                  onChangeText={setNotaFeliz}
                  placeholder="Se fue con una familia hermosa…"
                  multiline
                />
                <Button
                  title="Confirmar"
                  icon="heart"
                  loading={guardandoCelebracion}
                  onPress={confirmarCelebracion}
                  style={styles.celebracionAction}
                />
                <Button
                  title="Ahora no"
                  variant="ghost"
                  disabled={guardandoCelebracion}
                  onPress={() => setMostrarCelebracion(false)}
                />
              </Card>
            )}
          </>
        )}

        {esMio && (
          <Button
            title="Editar publicación"
            variant="secondary"
            icon="create-outline"
            onPress={editar}
            style={styles.actionButton}
          />
        )}

        {esMio && (
          <Button
            title="Borrar publicación"
            variant="danger"
            icon="trash"
            loading={borrando}
            disabled={borrando}
            onPress={borrar}
            style={styles.actionButton}
          />
        )}

        {/* Preguntas públicas: dudas de quien quiere adoptar, visibles para
            todos (como los comentarios de una red social), respondidas
            inline por el dueño. Molde: la sección de pistas del barrio de
            PetDetailScreen. */}
        <View style={styles.preguntasSection}>
          <View style={styles.preguntasHeader}>
            <Ionicons name="help-circle-outline" size={18} color={colors.brand} />
            <Title size={17} style={styles.preguntasTitle}>
              Preguntas
            </Title>
          </View>
          <AppText muted size={13} style={styles.preguntasSubtitle}>
            Dudas de quien quiere adoptarla, respondidas por quien la publicó.
          </AppText>

          {user ? (
            <View style={styles.preguntaComposer}>
              <Input
                value={nuevaPregunta}
                onChangeText={setNuevaPregunta}
                placeholder="¿Se lleva bien con gatos? ¿Necesita patio?…"
                multiline
              />
              <Button
                title="Preguntar"
                icon="help-circle-outline"
                variant="secondary"
                loading={enviandoPregunta}
                disabled={enviandoPregunta || !nuevaPregunta.trim()}
                onPress={preguntar}
                style={styles.preguntaBoton}
              />
            </View>
          ) : (
            <Button
              title="Preguntar"
              icon="help-circle-outline"
              variant="secondary"
              onPress={pedirCuentaParaPreguntar}
              style={styles.preguntaBoton}
            />
          )}

          {preguntas.length > 0 ? (
            <View style={styles.preguntasList}>
              {preguntas.map((p) => (
                <View key={p.id} style={styles.preguntaItem}>
                  <View style={styles.preguntaFirmaRow}>
                    <Ionicons
                      name="person-circle-outline"
                      size={16}
                      color={colors.muted}
                      style={styles.preguntaFirmaIcono}
                    />
                    {!p.autorEliminadoEn && (p.autorNombre ?? '').trim() ? (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('PublicProfile', { userId: p.userId })}
                      >
                        <AppText weight="semi" size={13} color={colors.brand} style={styles.preguntaFirma}>
                          {firmaAutor(p.autorNombre ?? null, p.autorEliminadoEn ?? null)}
                        </AppText>
                      </TouchableOpacity>
                    ) : (
                      <AppText weight="semi" size={13} style={styles.preguntaFirma}>
                        {firmaAutor(p.autorNombre ?? null, p.autorEliminadoEn ?? null)}
                      </AppText>
                    )}
                    <AppText muted size={12}>
                      {' · '}
                      {timeAgo(p.creadoEn)}
                    </AppText>
                    <View style={styles.preguntaSpacer} />
                    {user && p.userId !== user.id ? (
                      <TouchableOpacity
                        onPress={() => abrirDenunciaPregunta(p.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.preguntaAccionIcono}
                      >
                        <Ionicons name="flag-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ) : null}
                    {user && (user.id === p.userId || user.id === adoption.user_id) ? (
                      <TouchableOpacity
                        onPress={() => eliminarPregunta(p.id)}
                        disabled={borrandoPreguntaId === p.id}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <AppText size={14} style={styles.preguntaTexto}>
                    {p.pregunta}
                  </AppText>
                  {renderMotivosPregunta(p.id)}

                  {p.respuesta ? (
                    <View style={styles.respuestaBox}>
                      <AppText weight="semi" size={12} color={colors.brand}>
                        Responde {duenoNombre || 'quien la publicó'}
                      </AppText>
                      <AppText size={14} style={styles.respuestaTexto}>
                        {p.respuesta}
                      </AppText>
                    </View>
                  ) : esMio ? (
                    <View style={styles.respuestaComposer}>
                      {respondiendoId === p.id ? (
                        <>
                          <Input
                            value={respuestaBorrador[p.id] ?? ''}
                            onChangeText={(t) => setRespuestaBorrador((b) => ({ ...b, [p.id]: t }))}
                            placeholder="Escribí tu respuesta…"
                            multiline
                          />
                          <Button
                            title="Responder"
                            variant="secondary"
                            loading={enviandoRespuesta}
                            disabled={enviandoRespuesta || !(respuestaBorrador[p.id] ?? '').trim()}
                            onPress={() => responder(p.id)}
                            style={styles.respuestaBoton}
                          />
                        </>
                      ) : (
                        <Button
                          title="Responder"
                          variant="ghost"
                          onPress={() => abrirRespuesta(p.id)}
                          style={styles.respuestaBoton}
                        />
                      )}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <AppText muted size={13} style={styles.preguntasVacio}>
              Todavía nadie preguntó nada. Si tenés dudas, sé el primero.
            </AppText>
          )}
        </View>

        {!esMio && (
          <View style={styles.reportSection}>
            <Button
              title="Denunciar"
              variant="ghost"
              icon="flag-outline"
              disabled={enviandoDenuncia}
              onPress={abrirDenuncia}
              style={styles.reportButton}
            />
            {renderMotivos()}
          </View>
        )}
      </ScrollView>
      <Confetti visible={mostrarConfetti} onDone={() => setMostrarConfetti(false)} />
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
    height: 320,
    borderRadius: radius.md,
  },
  photoPlaceholder: {
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  dotsRow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    // sobre la foto: blanco fijo (card seria invisible en oscuro)
    backgroundColor: colors.white,
    width: 16,
  },
  heartButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(35,35,29,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
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
  ownBadge: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
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
  infoSection: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  infoTitle: {
    marginBottom: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  requisitosText: {
    lineHeight: 20,
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
  actionButton: {
    marginTop: spacing.md,
  },
  celebracionPanel: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  celebracionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  celebracionHeaderTitle: {
    flexShrink: 1,
  },
  celebracionText: {
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  celebracionAction: {
    marginTop: spacing.xs,
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
  preguntasSection: {
    marginTop: spacing.xl,
  },
  preguntasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  preguntasTitle: {
    marginLeft: 2,
  },
  preguntasSubtitle: {
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  preguntaComposer: {
    gap: spacing.xs,
  },
  preguntaBoton: {
    alignSelf: 'flex-start',
  },
  preguntasList: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  preguntaItem: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  preguntaFirmaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preguntaFirmaIcono: {
    marginRight: 2,
  },
  preguntaFirma: {},
  preguntaSpacer: {
    flex: 1,
  },
  preguntaAccionIcono: {
    marginRight: spacing.sm,
  },
  preguntaTexto: {
    marginTop: 4,
    lineHeight: 20,
  },
  preguntasVacio: {
    marginTop: spacing.sm,
  },
  respuestaBox: {
    marginTop: spacing.sm,
    marginLeft: spacing.md,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.brand,
    gap: 2,
  },
  respuestaTexto: {
    lineHeight: 19,
  },
  respuestaComposer: {
    marginTop: spacing.sm,
    marginLeft: spacing.md,
    gap: spacing.xs,
  },
  respuestaBoton: {
    alignSelf: 'flex-start',
  },
});

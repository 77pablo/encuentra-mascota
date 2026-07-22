import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { Adoption, deleteAdoption, getAdoption, marcarAdoptada } from '../services/adoptions';
import { denunciarAdopcion, MOTIVOS_DENUNCIA } from '../services/moderation';
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
            title="Borrar publicación"
            variant="danger"
            icon="trash"
            loading={borrando}
            disabled={borrando}
            onPress={borrar}
            style={styles.actionButton}
          />
        )}

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
});

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  getPerfilPublico,
  listReencuentrosPublicos,
  listReportesPublicos,
  PerfilPublico,
} from '../services/perfilPublico';
import { Pet } from '../services/pets';
import { insigniasDe } from '../lib/insignias';
import { iconoRedSocial, parseRedSocial } from '../lib/redSocial';
import { mesAnoDe } from '../lib/time';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { useAuth } from '../hooks/useAuth';
import { bloqueEmitido, bloquear, desbloquear } from '../services/bloqueos';
import { denunciarUsuario, MOTIVOS_DENUNCIA } from '../services/moderation';
import { mensajeDe } from '../lib/requireAuth';
import { AppText, Badge, Button, Card, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

export default function PublicProfileScreen({ route, navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const userId: string | undefined = route.params?.userId;
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [reportes, setReportes] = useState<Pet[]>([]);
  const [reencuentros, setReencuentros] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);
  // Bloqueo/denuncia sobre esta persona.
  const [bloqueado, setBloqueado] = useState(false);
  const [procesandoBloqueo, setProcesandoBloqueo] = useState(false);
  const [mostrarMotivos, setMostrarMotivos] = useState(false);
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false);

  const esMio = !!userId && userId === user?.id;

  const scrollRef = useRef<ScrollView>(null);
  const reportesY = useRef(0);
  const reencuentrosY = useRef(0);

  const cargar = useCallback(() => {
    if (!userId) {
      setNoDisponible(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNoDisponible(false);
    setMostrarMotivos(false);
    getPerfilPublico(userId)
      .then((p) => {
        setPerfil(p);
        if (!p) setNoDisponible(true);
      })
      .catch(() => setNoDisponible(true))
      .finally(() => setLoading(false));
    // Las listas degradan a vacío si fallan: no deben tumbar la pantalla. Pero
    // "no publicó nada" y "no pudimos leer lo que publicó" se ven IGUAL en
    // pantalla, así que la diferencia tiene que quedar al menos en el log.
    listReportesPublicos(userId)
      .then(setReportes)
      .catch((e) => console.warn('No se pudieron leer sus reportes:', e?.message ?? e));
    listReencuentrosPublicos(userId)
      .then(setReencuentros)
      .catch((e) => console.warn('No se pudieron leer sus reencuentros:', e?.message ?? e));
    // ¿Ya lo tengo bloqueado? Solo si hay sesión y no es mi propio perfil.
    // Degrada a "no bloqueado": el botón queda en "Bloquear".
    if (user && userId !== user.id) {
      bloqueEmitido(userId)
        .then(setBloqueado)
        .catch((e) => console.warn('No se pudo saber si ya lo bloqueaste:', e?.message ?? e));
    } else {
      setBloqueado(false);
    }
  }, [userId, user]);

  useFocusEffect(cargar);

  // Portero del modo invitado, en línea (mismo gesto que `useRequireAuth`:
  // avisar y empujar el registro). Se mantiene la forma con el mensaje como
  // parámetro porque acá hacen falta DOS textos: 'bloquear' ya vive en el mapa
  // de `requireAuth`, pero la denuncia de una PERSONA no —el 'denunciar' del
  // mapa habla de un reporte, y decirle "denunciar este reporte" a alguien que
  // está mirando un perfil sería peor que dejar esa línea suelta—.
  const pedirCuenta = (mensaje: string): boolean => {
    if (user) return true;
    notify(mensaje);
    navigation.navigate('Register');
    return false;
  };

  const alternarBloqueo = async () => {
    if (!userId) return;
    if (!pedirCuenta(mensajeDe('bloquear'))) return;
    if (!bloqueado) {
      const ok = await confirmAction(
        '¿Bloquear a esta persona?',
        'No podrá escribirte y dejarás de ver lo que publique. Puedes deshacerlo cuando quieras.',
      );
      if (!ok) return;
    }
    setProcesandoBloqueo(true);
    try {
      if (bloqueado) {
        await desbloquear(userId);
        setBloqueado(false);
        notify('Desbloqueada', 'Esta persona vuelve a poder escribirte.');
      } else {
        await bloquear(userId);
        setBloqueado(true);
        notify('Persona bloqueada', 'No podrá escribirte y no verás lo que publique.');
      }
    } catch (e: any) {
      notify('No se pudo completar', mensajeDeErrorDb(e));
    } finally {
      setProcesandoBloqueo(false);
    }
  };

  const abrirMotivosDenuncia = () => {
    if (!pedirCuenta('Creá tu cuenta para denunciar a esta persona')) return;
    setMostrarMotivos((v) => !v);
  };

  const denunciar = async (motivo: string) => {
    if (!userId || !user) return;
    setEnviandoDenuncia(true);
    try {
      await denunciarUsuario(userId, user.id, motivo);
      setMostrarMotivos(false);
      // Denunciar y bloquear son el mismo impulso: se ofrece bloquear acá mismo.
      if (!bloqueado) {
        const ok = await confirmAction(
          'Denuncia recibida',
          'La revisaremos dentro de las próximas 24 horas. ¿Querés también bloquear a esta persona?',
        );
        if (ok) {
          await bloquear(userId);
          setBloqueado(true);
        }
      } else {
        notify('Denuncia recibida', 'La revisaremos dentro de las próximas 24 horas.');
      }
    } catch (e: any) {
      setMostrarMotivos(false);
      notify('No se pudo denunciar', mensajeDeErrorDb(e));
    } finally {
      setEnviandoDenuncia(false);
    }
  };

  if (loading) return <Loading />;

  if (noDisponible || !perfil) {
    return (
      <Screen padded>
        <View style={styles.noDisponible}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.muted} />
          <Title size={18} align="center" style={styles.noDisponibleTitulo}>
            Perfil no disponible
          </Title>
          <AppText muted align="center" size={14} style={styles.noDisponibleTexto}>
            Esta persona no tiene un perfil público o su cuenta ya no está.
          </AppText>
        </View>
      </Screen>
    );
  }

  const red = parseRedSocial(perfil.red_social);
  const insignias = insigniasDe({
    reencuentros: perfil.reencuentros,
    reportes: perfil.reportes,
    aportes: perfil.aportes,
  });
  const inicial = perfil.nombre?.trim() ? perfil.nombre.trim().charAt(0).toUpperCase() : '🐾';

  const abrirRed = (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      return;
    }
    Linking.openURL(url).catch(() => notify('No se pudo abrir', 'Revisá el enlace de la red social.'));
  };
  const scrollTo = (y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });

  const stats: { clave: string; valor: number; label: string; icon: string; onPress: () => void }[] = [
    {
      clave: 'reencuentros',
      valor: perfil.reencuentros,
      label: 'Reencuentros',
      icon: 'home',
      onPress: () => scrollTo(reencuentrosY.current),
    },
    {
      clave: 'reportes',
      valor: perfil.reportes,
      label: 'Reportes',
      icon: 'megaphone',
      onPress: () => scrollTo(reportesY.current),
    },
    {
      clave: 'aportes',
      valor: perfil.aportes,
      label: 'Aportes',
      icon: 'people',
      onPress: () =>
        notify('Aportes al barrio', 'Pistas y avistamientos que dejó en reportes de otros vecinos.'),
    },
  ];

  return (
    <Screen>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Portada */}
        <View style={styles.cover}>
          <View style={styles.avatar}>
            {perfil.foto_perfil ? (
              <Image source={{ uri: perfil.foto_perfil }} style={styles.avatarImg} />
            ) : (
              <AppText weight="bold" size={30} color={colors.white}>
                {inicial}
              </AppText>
            )}
          </View>
          <Title size={22} align="center" style={styles.nombre}>
            {perfil.nombre}
          </Title>
          <AppText muted size={13} align="center">
            Miembro desde {mesAnoDe(perfil.creado_en)}
          </AppText>
          {red?.url ? (
            <TouchableOpacity style={styles.redLink} activeOpacity={0.7} onPress={() => abrirRed(red.url!)}>
              <Ionicons name={iconoRedSocial(red.tipo) as any} size={15} color={colors.brand} />
              <AppText size={13} color={colors.brand} style={styles.redLinkText}>
                {red.usuario}
              </AppText>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Acciones sobre esta persona: denunciar / bloquear. No se muestran en
            el perfil propio. */}
        {!esMio ? (
          <View style={styles.acciones}>
            <View style={styles.accionesRow}>
              <Button
                title="Denunciar"
                variant="ghost"
                icon="flag-outline"
                disabled={enviandoDenuncia}
                onPress={abrirMotivosDenuncia}
                style={styles.accionBoton}
              />
              <Button
                title={bloqueado ? 'Desbloquear' : 'Bloquear'}
                variant="secondary"
                icon="ban-outline"
                loading={procesandoBloqueo}
                onPress={alternarBloqueo}
                style={styles.accionBoton}
              />
            </View>
            {mostrarMotivos ? (
              <View style={styles.reasonList}>
                <AppText muted size={13} style={styles.reasonTitle}>
                  ¿Por qué quieres denunciar a esta persona?
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
        ) : null}

        {/* Estadísticas tocables */}
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <TouchableOpacity key={s.clave} style={styles.statTile} activeOpacity={0.75} onPress={s.onPress}>
              <Ionicons name={s.icon as any} size={18} color={colors.brand} />
              <AppText weight="bold" size={20} style={styles.statValor}>
                {s.valor}
              </AppText>
              <AppText muted size={12} align="center">
                {s.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Insignias (señales de confianza) */}
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

        {/* Reportes activos */}
        <View onLayout={(e) => (reportesY.current = e.nativeEvent.layout.y)}>
          <Title size={16} style={styles.sectionTitle}>
            Reportes activos
          </Title>
          {reportes.length === 0 ? (
            <AppText muted size={13} style={styles.mutedLine}>
              No tiene reportes activos.
            </AppText>
          ) : (
            <View style={styles.list}>
              {reportes.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('PetDetail', { id: item.id })}
                >
                  <Card style={styles.reportCard}>
                    <Badge estado={item.estado} />
                    <AppText weight="semi" size={14} style={styles.reportTitle}>
                      {especieLabel[item.especie]}
                    </AppText>
                    <AppText muted size={13}>
                      {item.descripcion.slice(0, 60)}
                    </AppText>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Reencuentros */}
        <View onLayout={(e) => (reencuentrosY.current = e.nativeEvent.layout.y)}>
          <Title size={16} style={styles.sectionTitle}>
            Reencuentros 🎉
          </Title>
          {reencuentros.length === 0 ? (
            <AppText muted size={13} style={styles.mutedLine}>
              Todavía no tiene reencuentros.
            </AppText>
          ) : (
            <View style={styles.list}>
              {reencuentros.map((item) => (
                <Card key={item.id} style={styles.reunidaCard}>
                  <Badge label="REUNIDA" color={colors.found} />
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
        </View>
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  cover: {
    alignItems: 'center',
    backgroundColor: colors.sky,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  nombre: {
    marginTop: spacing.xs,
  },
  redLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  redLinkText: {
    marginLeft: spacing.xs,
  },
  acciones: {
    gap: spacing.sm,
  },
  accionesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  accionBoton: {
    flex: 1,
  },
  reasonList: {
    gap: spacing.sm,
  },
  reasonTitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  reasonButton: {
    width: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    gap: 2,
  },
  statValor: {
    marginTop: spacing.xs,
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
  sectionTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  mutedLine: {
    marginBottom: spacing.sm,
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
  reunidaCard: {
    gap: spacing.xs,
  },
  noDisponible: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xxxl,
  },
  noDisponibleTitulo: {
    marginTop: spacing.md,
  },
  noDisponibleTexto: {
    marginTop: spacing.sm,
    maxWidth: 280,
    lineHeight: 20,
  },
});

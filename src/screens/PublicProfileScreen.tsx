import React, { useCallback, useRef, useState } from 'react';
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
import { notify } from '../lib/notify';
import { AppText, Badge, Card, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

export default function PublicProfileScreen({ route, navigation }: any) {
  const userId: string | undefined = route.params?.userId;
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [reportes, setReportes] = useState<Pet[]>([]);
  const [reencuentros, setReencuentros] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);

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
    getPerfilPublico(userId)
      .then((p) => {
        setPerfil(p);
        if (!p) setNoDisponible(true);
      })
      .catch(() => setNoDisponible(true))
      .finally(() => setLoading(false));
    // Las listas degradan a vacío si fallan: no deben tumbar la pantalla.
    listReportesPublicos(userId).then(setReportes).catch(() => {});
    listReencuentrosPublicos(userId).then(setReencuentros).catch(() => {});
  }, [userId]);

  useFocusEffect(cargar);

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

const styles = StyleSheet.create({
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

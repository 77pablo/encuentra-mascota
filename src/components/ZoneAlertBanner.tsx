import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pet } from '../services/pets';
import { useZoneAlert } from '../hooks/useZoneAlert';
import { zoneAlertMessage } from '../lib/alerts';
import { AppText } from '../ui';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

interface ZoneAlertBannerProps {
  pets: Pet[];
  onPress: () => void;
}

// Aviso in-app amable y descartable: si el usuario tiene una zona de alerta
// activa y hay reportes nuevos dentro de ella, muestra una tarjeta con campana.
// Si no hay nada que avisar, no renderiza nada (degrada sin ocupar espacio).
export function ZoneAlertBanner({ pets, onPress }: ZoneAlertBannerProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { count, dismiss } = useZoneAlert(pets);
  const message = zoneAlertMessage(count);
  if (!message) return null;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.main}>
        <View style={styles.iconWrap}>
          <Ionicons name="notifications-outline" size={20} color={colors.brand} />
        </View>
        <View style={styles.textWrap}>
          <AppText weight="bold" size={14}>
            {message}
          </AppText>
          <AppText muted size={12}>
            Toca para verlos en la lista.
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.brand} />
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={dismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.close}
        accessibilityLabel="Descartar aviso"
      >
        <Ionicons name="close" size={16} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sky,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    gap: spacing.sm,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  close: {
    padding: spacing.xs,
  },
});

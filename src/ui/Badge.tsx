import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

type Estado = 'perdida' | 'encontrada';

export interface EstadoBadgeProps {
  estado: Estado;
}

export interface GenericBadgeProps {
  label: string;
  color: string;
}

export type BadgeProps = EstadoBadgeProps | GenericBadgeProps;

function isEstadoBadge(props: BadgeProps): props is EstadoBadgeProps {
  return (props as EstadoBadgeProps).estado !== undefined;
}

const estadoConfig: Record<Estado, { bg: string; label: string; emoji: string }> = {
  perdida: { bg: colors.lost, label: 'PERDIDA', emoji: '🔴' },
  encontrada: { bg: colors.found, label: 'ENCONTRADA', emoji: '🟢' },
};

export function Badge(props: BadgeProps) {
  const { bg, label, emoji } = isEstadoBadge(props)
    ? { ...estadoConfig[props.estado], emoji: estadoConfig[props.estado].emoji }
    : { bg: props.color, label: props.label, emoji: '' };

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText weight="bold" color={colors.white} size={11} style={styles.label}>
        {emoji ? `${emoji} ${label}` : label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: {
    letterSpacing: 0.5,
  },
});

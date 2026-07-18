import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { colors, font, radius, shadow, spacing } from '../theme';
import { AppText } from './AppText';

export interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, active = false, onPress, style }: ChipProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.base, active ? styles.active : styles.inactive, style]}
    >
      <AppText
        size={13}
        style={{ fontFamily: font.bodySemi, color: active ? colors.white : colors.muted }}
      >
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  active: {
    backgroundColor: colors.ink,
  },
  inactive: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
});

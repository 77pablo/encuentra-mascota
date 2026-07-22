import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

const getVariantStyles = (
  colors: Colors,
): Record<Variant, { bg: string; text: string; border?: string }> => ({
  primary: { bg: colors.brand, text: colors.white },
  secondary: { bg: colors.sky, text: colors.brand },
  danger: { bg: colors.lost, text: colors.white },
  ghost: { bg: 'transparent', text: colors.brand },
});

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const variantStyles = getVariantStyles(colors);
  const v = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        { backgroundColor: v.bg },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Ionicons name={icon} size={20} color={v.text} style={styles.icon} />
          ) : null}
          <Text style={[styles.label, { color: v.text }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    base: {
      minHeight: 52,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    disabled: {
      opacity: 0.5,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    icon: {
      marginRight: spacing.sm,
    },
    label: {
      fontFamily: font.bodyBold,
      fontSize: 16,
    },
  });

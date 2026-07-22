import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

export interface ScreenProps {
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Screen({ padded = false, style, children }: ScreenProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <SafeAreaView
      style={[styles.base, padded && styles.padded, style]}
      edges={['top', 'left', 'right']}
    >
      {children}
    </SafeAreaView>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    base: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    padded: {
      paddingHorizontal: spacing.xl,
    },
  });

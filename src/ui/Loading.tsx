import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export interface LoadingProps {
  label?: string;
}

export function Loading({ label = 'Cargando…' }: LoadingProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brand} />
      {label ? (
        <AppText muted style={styles.label}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.xxl,
    },
    label: {
      marginTop: spacing.md,
    },
  });

import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

export interface ScreenProps {
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Screen({ padded = false, style, children }: ScreenProps) {
  return (
    <SafeAreaView
      style={[styles.base, padded && styles.padded, style]}
      edges={['top', 'left', 'right']}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  padded: {
    paddingHorizontal: spacing.xl,
  },
});

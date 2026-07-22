import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { AppText, Title } from './AppText';
import { Mascota } from './Mascota';

export interface EmptyStateProps {
  emoji?: string;
  title: string;
  subtitle?: string;
  illustration?: boolean;
}

export function EmptyState({ emoji, title, subtitle, illustration }: EmptyStateProps) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      {illustration ? (
        <View style={styles.emoji}>
          <Mascota size={72} color={colors.muted} />
        </View>
      ) : emoji ? (
        <AppText size={56} style={styles.emoji}>
          {emoji}
        </AppText>
      ) : null}
      <Title size={20} align="center" style={styles.title}>
        {title}
      </Title>
      {subtitle ? (
        <AppText muted align="center" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emoji: {
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
});

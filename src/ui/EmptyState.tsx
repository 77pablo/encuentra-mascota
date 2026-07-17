import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import { AppText, Title } from './AppText';

export interface EmptyStateProps {
  emoji: string;
  title: string;
  subtitle?: string;
}

export function EmptyState({ emoji, title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <AppText size={56} style={styles.emoji}>
        {emoji}
      </AppText>
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

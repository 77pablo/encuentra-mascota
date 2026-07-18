import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { AppText, Title } from './AppText';
import { Button } from './Button';

export interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <AppText size={56} style={styles.emoji}>
        😿
      </AppText>
      <Title size={20} align="center" style={styles.title}>
        Algo salió mal
      </Title>
      <AppText muted align="center" style={styles.subtitle}>
        {message ?? 'No pudimos cargar. Revisa tu conexión e inténtalo de nuevo.'}
      </AppText>
      <Button title="Reintentar" onPress={onRetry} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
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
  button: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
});

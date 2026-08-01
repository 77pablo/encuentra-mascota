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
  /**
   * Acción(es) al pie del vacío. De los ~14 estados vacíos de la app, el único
   * que ofrecía una salida era el de `EncontreScreen`, y solo porque pegaba un
   * `<Button>` al lado a mano. Un vacío que no ofrece nada es un callejón: la
   * persona entiende que no hay datos, pero no qué hacer al respecto.
   *
   * Es un hueco, no una lista de props de botón, para que quepan las acciones
   * que ya son componentes con estado propio (`SeguirComunaButton`). Lo que va
   * adentro tiene que ser un `Button` del sistema de diseño: acá solo se
   * resuelve el espacio y el ancho.
   */
  action?: React.ReactNode;
}

export function EmptyState({ emoji, title, subtitle, illustration, action }: EmptyStateProps) {
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
      {action ? <View style={styles.action}>{action}</View> : null}
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
  action: {
    marginTop: spacing.lg,
    // Ancho completo pero con tope: los botones del sistema son pastillas de
    // alto fijo y estirados a lo ancho de una tablet quedan absurdos.
    width: '100%',
    maxWidth: 320,
    gap: spacing.sm,
  },
});

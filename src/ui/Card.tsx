import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import { radius, shadow, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

export interface CardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
}

export function Card({ style, children, ...rest }: CardProps) {
  const colors = useColors();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          padding: spacing.lg,
          ...shadow.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

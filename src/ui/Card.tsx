import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

export interface CardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
}

export function Card({ style, children, ...rest }: CardProps) {
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

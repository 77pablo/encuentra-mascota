import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { font } from '../theme';
import { useColors } from '../theme/ThemeProvider';

type Weight = 'regular' | 'semi' | 'bold';

const weightToFont: Record<Weight, string> = {
  regular: font.body,
  semi: font.bodySemi,
  bold: font.bodyBold,
};

export interface AppTextProps extends TextProps {
  weight?: Weight;
  muted?: boolean;
  size?: number;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function AppText({
  weight = 'regular',
  muted = false,
  size = 15,
  color,
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const colors = useColors();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: weightToFont[weight],
          fontSize: size,
          color: color ?? (muted ? colors.muted : colors.ink),
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export interface TitleProps extends TextProps {
  size?: number;
  color?: string;
  align?: TextStyle['textAlign'];
  bold?: boolean;
}

export function Title({ size = 24, color, align, bold, style, children, ...rest }: TitleProps) {
  const colors = useColors();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: bold ? font.displayBold : font.display,
          fontSize: size,
          color: color ?? colors.ink,
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

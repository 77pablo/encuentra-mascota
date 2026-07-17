import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

export interface SquiggleProps {
  width?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Una rayita ondulada, dibujada a mano, para acompañar títulos —
 * el detalle chueco que hace que algo se sienta hecho por alguien.
 */
export function Squiggle({ width = 120, color = colors.sun, style }: SquiggleProps) {
  const height = Math.round(width * 0.12);
  return (
    <Svg width={width} height={height} viewBox="0 0 200 24" fill="none" style={style}>
      <Path
        d="M3,14 C15,4 27,22 40,13 C53,4 65,22 78,13 C91,4 103,21 116,13 C129,5 141,20 154,12 C165,6 175,16 185,12 C190,10 195,11 197,12"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

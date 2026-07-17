import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme';

export interface MascotaProps {
  size?: number;
  color?: string;
}

/**
 * Un perrito dibujado a mano, sencillo y con un poco de imperfección —
 * como el garabato que haría alguien del barrio, no un ícono de stock.
 */
export function Mascota({ size = 96, color = colors.ink }: MascotaProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {/* oreja izquierda, caída */}
      <Path
        d="M33,39 C19,34 8,43 10,57 C12,69 23,74 34,66 C30,58 31,46 33,39 Z"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={color}
        fillOpacity={0.05}
      />
      {/* oreja derecha, un poco distinta a la otra */}
      <Path
        d="M67,37 C81,30 92,38 91,52 C90,64 80,71 68,64 C71,55 69,44 67,37 Z"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={color}
        fillOpacity={0.05}
      />
      {/* cabeza, un poco asimétrica a propósito */}
      <Path
        d="M29,52 C27,32 41,16 52,17 C65,18 75,31 73,49 C72,61 63,73 49,74 C36,75 30,65 29,52 Z"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={color}
        fillOpacity={0.035}
      />
      {/* ojos, no perfectamente parejos */}
      <Circle cx={41} cy={44} r={2.6} fill={color} />
      <Circle cx={60} cy={42} r={2.4} fill={color} />
      {/* hocico */}
      <Path
        d="M42,58 C42,52 47,49 52,49 C58,49 62,53 61,59 C60,65 54,68 50,67 C45,66 42,63 42,58 Z"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* nariz */}
      <Path
        d="M48,54 C48,52 50,51 52,51 C54,51 55,52 55,54 C55,56 53,57 51,57 C49,57 48,56 48,54 Z"
        fill={color}
      />
      {/* boquita, trazo suelto */}
      <Path d="M51,61 C51,64 49,66 46,65" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

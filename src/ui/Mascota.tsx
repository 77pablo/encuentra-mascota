import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

export interface MascotaProps {
  size?: number;
  color?: string;
}

/**
 * Perrito plano y moderno, estilo ícono de app — amigable pero adulto,
 * no un garabato ni un dibujo infantil.
 */
export function Mascota({ size = 96 }: MascotaProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* orejas */}
      <Path d="M26 52 C20 40 22 26 30 22 C40 24 44 34 44 44 Z" fill="#F4E9CE" />
      <Path d="M94 52 C100 40 98 26 90 22 C80 24 76 34 76 44 Z" fill="#F4E9CE" />
      {/* cabeza */}
      <Ellipse cx={60} cy={66} rx={34} ry={32} fill="#FBF3E0" />
      {/* ojos */}
      <Circle cx={49} cy={60} r={4.2} fill="#23231D" />
      <Circle cx={71} cy={60} r={4.2} fill="#23231D" />
      {/* hocico */}
      <Ellipse cx={60} cy={76} rx={7} ry={5.5} fill="#23231D" />
      {/* boca */}
      <Path d="M52 84 Q60 92 68 84" stroke="#23231D" strokeWidth={3.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

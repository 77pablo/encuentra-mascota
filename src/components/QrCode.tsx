import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { qrMatrix } from '../lib/qr';

// Dibuja el QR de `value` como SVG (cuadrado de `size` px). Sin red ni API keys.
export default function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const matrix = qrMatrix(value);
  const count = matrix.length;
  const cell = size / count;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        rects.push(
          <Rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#000000" />,
        );
      }
    }
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
      {rects}
    </Svg>
  );
}

import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { qrMatrix } from '../lib/qr';

// Dibuja el QR de `value` como SVG (cuadrado de `size` px). Sin red ni API keys.
export default function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const matrix = qrMatrix(value);
  const count = matrix.length;
  const quiet = 4; // módulos de "quiet zone" (margen blanco) para que el QR sea escaneable impreso
  const cell = size / (count + quiet * 2);
  const offset = quiet * cell;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        rects.push(
          <Rect
            key={`${r}-${c}`}
            x={offset + c * cell}
            y={offset + r * cell}
            width={cell}
            height={cell}
            fill="#000000"
          />,
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

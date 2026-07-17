import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export interface ConfettiProps {
  visible: boolean;
  onDone?: () => void;
}

const PIECE_COUNT = 24;
const DURATION = 1800;
const PIECE_COLORS = [colors.brand, colors.sun, colors.lost, colors.found, colors.brandDark];

// Los pares "es cuadrado / rota" alternan según el índice para que la
// mezcla se vea variada sin depender de Math.random en el módulo.
interface Piece {
  key: number;
  left: number;
  size: number;
  color: string;
  delay: number;
  drift: number;
  rotateEnd: string;
  square: boolean;
}

function buildPieces(width: number): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < PIECE_COUNT; i++) {
    const spread = width > 0 ? width : 360;
    // Distribución determinista por índice (no aleatoria) a lo ancho de la
    // pantalla, con un pequeño desfase para que no queden en fila perfecta.
    const left = (i * 137.5) % spread;
    const delay = (i % 8) * 90;
    const drift = ((i % 5) - 2) * 24;
    const size = 8 + (i % 4) * 3;
    const color = PIECE_COLORS[i % PIECE_COLORS.length];
    const rotateEnd = i % 2 === 0 ? '380deg' : '-380deg';
    const square = i % 3 !== 0;
    pieces.push({ key: i, left, size, color, delay, drift, rotateEnd, square });
  }
  return pieces;
}

function ConfettiPiece({
  piece,
  progress,
  fallDistance,
}: {
  piece: Piece;
  progress: Animated.Value;
  fallDistance: number;
}) {
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, fallDistance],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, piece.drift],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', piece.rotateEnd],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: piece.left,
          width: piece.size,
          height: piece.size,
          backgroundColor: piece.color,
          borderRadius: piece.square ? 2 : piece.size / 2,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    />
  );
}

// Confeti liviano hecho solo con `Animated` de react-native para que
// funcione igual en web (react-native-web) y en nativo, sin librerías
// externas. Se muestra como overlay a pantalla completa que nunca bloquea
// toques (`pointerEvents="none"`).
export function Confetti({ visible, onDone }: ConfettiProps) {
  const { height, width } = Dimensions.get('window');
  const fallDistance = height > 0 ? height + 40 : 720;
  const pieces = useMemo(() => buildPieces(width), [width]);
  const progressRefs = useRef(pieces.map(() => new Animated.Value(0)));

  useEffect(() => {
    if (!visible) return;
    progressRefs.current.forEach((v) => v.setValue(0));
    const animations = pieces.map((piece, i) =>
      Animated.timing(progressRefs.current[i], {
        toValue: 1,
        duration: DURATION,
        delay: piece.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    const group = Animated.parallel(animations);
    group.start(({ finished }) => {
      if (finished) onDone?.();
    });
    return () => group.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {pieces.map((piece, i) => (
        <ConfettiPiece
          key={piece.key}
          piece={piece}
          progress={progressRefs.current[i]}
          fallDistance={fallDistance}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  piece: {
    position: 'absolute',
    top: 0,
  },
});

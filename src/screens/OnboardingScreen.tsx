import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Mascota, Screen, Title } from '../ui';
import { colors, spacing } from '../theme';
import { setOnboardingVisto } from '../lib/onboarding';

// Bienvenida que se muestra SOLO en el primer arranque (el gate está en
// RootNavigator). `onListo` lo desmonta y sigue a la app. Saltar y Empezar
// marcan el flag para que no vuelva a aparecer.

type Slide = {
  icono?: keyof typeof Ionicons.glyphMap;
  mascota?: boolean;
  titulo: string;
  texto: string;
};

const SLIDES: Slide[] = [
  {
    mascota: true,
    titulo: 'Encuentra tu Mascota',
    texto: 'El barrio ayuda a que vuelva a casa. Acá nos organizamos para reunir mascotas con su familia.',
  },
  {
    icono: 'search',
    titulo: 'Publicá y explorá',
    texto: 'Reportá una mascota perdida o encontrada, y mirá en el mapa y la lista lo que pasa cerca tuyo.',
  },
  {
    icono: 'paw',
    titulo: 'En adopción',
    texto: 'Mascotas del barrio buscando un hogar, en un feed simple. Guardá las que te lleguen al corazón.',
  },
  {
    icono: 'notifications',
    titulo: 'Te avisamos',
    texto: 'Cuando aparece una mascota que podría ser la tuya cerca, te llega un aviso. No hace falta estar mirando.',
  },
];

export default function OnboardingScreen({ onListo }: { onListo: () => void }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const esUltima = index === SLIDES.length - 1;

  const terminar = () => {
    // No esperamos el guardado: cerrar ya. Si el storage falla, en el peor caso
    // el onboarding reaparece (setOnboardingVisto never-throws).
    setOnboardingVisto();
    onListo();
  };

  const siguiente = () => {
    if (esUltima) {
      terminar();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <Screen>
      <View style={styles.top}>
        <TouchableOpacity onPress={terminar} accessibilityRole="button">
          <AppText weight="semi" size={14} color={colors.muted}>
            Saltar
          </AppText>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((s) => (
          <View key={s.titulo} style={[styles.slide, { width }]}>
            <View style={styles.ilustracion}>
              {s.mascota ? (
                <Mascota size={120} />
              ) : (
                <View style={styles.iconCircle}>
                  <Ionicons name={s.icono!} size={56} color={colors.brand} />
                </View>
              )}
            </View>
            <Title size={26} align="center" style={styles.slideTitle}>
              {s.titulo}
            </Title>
            <AppText muted size={15} style={styles.slideText}>
              {s.texto}
            </AppText>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dotsRow}>
        {SLIDES.map((s, i) => (
          <View key={s.titulo} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <Button title={esUltima ? 'Empezar' : 'Siguiente'} onPress={siguiente} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  ilustracion: {
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideTitle: {
    marginBottom: spacing.xs,
  },
  slideText: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.line,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.brand,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
});

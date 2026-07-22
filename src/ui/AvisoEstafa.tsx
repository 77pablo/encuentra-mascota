import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { AppText } from './AppText';

// El timo "tengo a tu mascota, transfiere la recompensa" esta documentado y
// activo en Chile. Advertirlo donde ocurre (el chat y el monto) es la
// mitigacion mas barata que tenemos, y es tambien lo que nos separa de una
// imputacion por negligencia: la estafa la comete el usuario, pero no avisar
// seria culpa nuestra.
export const TEXTO_AVISO_ESTAFA = {
  chat:
    'Cuidado con las estafas: nunca transfieras dinero antes de ver a tu mascota en persona. ' +
    'Nadie honesto te va a pedir un pago por adelantado.',
  recompensa:
    'Nunca transfieras la recompensa por adelantado: entrégala solo cuando tengas a tu mascota contigo. ' +
    'No participamos en el pago ni lo garantizamos, es un acuerdo entre ustedes.',
} as const;

export function AvisoEstafa({ variante }: { variante: keyof typeof TEXTO_AVISO_ESTAFA }) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <View style={styles.caja}>
      <Ionicons name="shield-outline" size={15} color={colors.muted} style={styles.icono} />
      <AppText muted size={12} style={styles.texto}>
        {TEXTO_AVISO_ESTAFA[variante]}
      </AppText>
    </View>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    caja: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    icono: { marginTop: 1 },
    texto: { flex: 1, lineHeight: 17 },
  });

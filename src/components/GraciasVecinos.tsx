import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fraseGracias, resumenAyudantes } from '../lib/agradecimientos';
import type { Tip } from '../lib/tips';
import type { Sighting } from '../services/sightings';
import { AppText } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

interface GraciasVecinosProps {
  pistas: Tip[];
  avistamientos: Sighting[];
  /** Dueño del reporte: no se agradece a sí mismo. */
  duenoId: string | null | undefined;
}

// El agradecimiento del final feliz. Vive en la tarjeta del reencuentro y lo ve
// CUALQUIERA que entre a la ficha —no solo el dueño—, que es justamente el
// punto: quien dejó una pista o marcó un avistamiento vuelve al reporte y se
// entera de que la historia terminó bien y de que su parte contó.
//
// Se dibuja solo (null) si no ayudó nadie: un "gracias" al aire suena peor que
// no decir nada. Todo sale de datos que la ficha ya tiene cargados; no hay
// columna, tabla ni consulta nueva detrás de esto.
export function GraciasVecinos({ pistas, avistamientos, duenoId }: GraciasVecinosProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const frase = fraseGracias(resumenAyudantes(pistas, avistamientos, duenoId));
  if (!frase) return null;
  return (
    <View style={styles.contenedor}>
      <Ionicons name="hand-left-outline" size={16} color={colors.found} />
      <AppText size={14} style={styles.texto}>
        {frase}
      </AppText>
    </View>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    contenedor: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.card,
    },
    texto: {
      flex: 1,
      lineHeight: 20,
    },
  });

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AMBITOS, Ambito, radioLabel, radioSugerido } from '../lib/radioSugerido';
import { AppText, Chip } from '../ui';
import { spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

export interface SelectorAmbitoProps {
  /** `null` = todavía no contestó (es una respuesta válida). */
  valor: Ambito | null;
  onChange: (valor: Ambito | null) => void;
}

// LA PREGUNTA QUE CAMBIA EL RADIO.
//
// Solo se muestra en gatos perdidos (lo decide `preguntarAmbito`), porque es el
// único caso donde la respuesta cambia algo de verdad: 50 m contra 315 m de
// mediana según el estudio de Queensland. En perros el radio sale igual, así
// que preguntar sería un campo más en un formulario que la persona está
// llenando con las manos temblando.
//
// Se puede OMITIR y se puede desmarcar: quien no contesta se queda con el radio
// ancho. Por eso no hay una tercera opción "no sé" — sería un botón para elegir
// lo que ya pasa si no tocás nada.
export function SelectorAmbito({ valor, onChange }: SelectorAmbitoProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  // Con `valor` en null esto devuelve el caso ancho (gato con exterior): el
  // consejo que se lee antes de contestar es el conservador, nunca el chico.
  const sugerido = radioSugerido({ especie: 'gato', ambito: valor, dias: 0 });

  return (
    <View style={styles.wrap}>
      <AppText size={14} weight="bold">
        ¿Tu gato salía a la calle?
      </AppText>
      <AppText muted size={12}>
        Con esto ajustamos hasta dónde conviene buscar. Si no sabés, saltealo.
      </AppText>
      <View style={styles.chipsRow} accessibilityRole="radiogroup">
        {AMBITOS.map((a) => (
          <Chip
            key={a.key}
            rol="opcion"
            label={a.label}
            active={valor === a.key}
            // Volver a tocar el mismo chip lo suelta: si te equivocaste, no
            // quedás encerrado en una respuesta.
            onPress={() => onChange(valor === a.key ? null : a.key)}
          />
        ))}
      </View>
      <AppText muted size={12} style={styles.consejo}>
        Sugerencia de búsqueda: {radioLabel(sugerido.km)} a la redonda. {sugerido.motivo}
      </AppText>
    </View>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    consejo: {
      marginTop: spacing.xs,
      lineHeight: 17,
      color: colors.muted,
    },
  });

import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { font, radius, shadow, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { AppText } from './AppText';

// QUÉ ES UN CHIP PARA QUIEN NO LO VE.
//
// Lo único que separaba un chip marcado de uno sin marcar era el color de
// fondo, y el color no viaja. Comprobado contra la versión instalada de
// react-native-web: su `TouchableOpacity` solo propaga `focusable` y NO inyecta
// ningún rol por su cuenta, así que estos controles salían al DOM como
// `<div tabindex="0">Negro</div>`. Quien usa lector de pantalla escuchaba siete
// palabras sueltas —"Negro Blanco Gris Café…"— sin saber que eran controles ni
// cuál acababa de activar. Mientras fueron filtros efímeros molestaba; desde la
// tanda 12 `SelectorSenas` publica con ellos las señas que quedan EN LA BASE.
//
// EL ROL NO ES DECORACIÓN: ES LO QUE EL CONTROL PROMETE.
//
//   'opcion'  → role="radio". "Elegí UNO de estos". Va dentro de un contenedor
//               con role="radiogroup" y nombre, si no el lector dice "Chico,
//               opción" sin decir de qué pregunta.
//   'casilla' → role="checkbox". Prendido/apagado INDEPENDIENTE del resto: el
//               grupo de Color (van hasta tres a la vez) y los filtros sueltos
//               tipo "Con recompensa".
//   'boton'   → role="button". No tiene estado marcado: hace algo (abrir el
//               selector de comuna, soltar un filtro, desplegar el panel).
//
// Confundirlos no es un detalle de estilo: "casilla" en el grupo de Tamaño le
// promete a alguien que puede marcar chico Y grande a la vez, y "opción" en
// Color le esconde que puede marcar tres.
//
// Por defecto se elige por la forma en que lo llaman: si viene `active`, el
// chip tiene dos estados y lo más honesto sin más información es "casilla"; si
// no viene, no hay nada que anunciar y es un botón. Los grupos de "elegí uno"
// tienen que pedir `rol="opcion"` a mano, porque eso el componente no lo puede
// adivinar mirándose a sí mismo.

export type RolChip = 'boton' | 'opcion' | 'casilla';

const ROL_NATIVO: Record<RolChip, 'button' | 'radio' | 'checkbox'> = {
  boton: 'button',
  opcion: 'radio',
  casilla: 'checkbox',
};

export interface ChipProps {
  label: string;
  /** Marcado o no. Sin esto el chip es una acción y no anuncia ningún estado. */
  active?: boolean;
  onPress?: () => void;
  /** Qué promete el control. Ver el comentario de arriba. */
  rol?: RolChip;
  /** Lo que se escucha, cuando el texto visible no alcanza (emojis, "✕ Quitar"). */
  accessibilityLabel?: string;
  /** Solo para el chip que despliega un panel: sale como `aria-expanded`. */
  expandido?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  active,
  onPress,
  rol,
  accessibilityLabel,
  expandido,
  style,
}: ChipProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);

  const cascara = [styles.base, active ? styles.active : styles.inactive, style];
  const cuerpo = (
    <AppText
      size={13}
      style={{ fontFamily: font.bodySemi, color: active ? colors.white : colors.muted }}
    >
      {label}
    </AppText>
  );

  // Un chip sin `onPress` NO es un control: en PetDetailScreen son las señas ya
  // publicadas de un reporte, o sea texto. Como `TouchableOpacity` la web los
  // dejaba en el orden de tabulación —`focusable` lo pone siempre, sin mirar si
  // hay `onPress`— y al llegar ahí con Tab no pasaba nada.
  if (!onPress) {
    return <View style={cascara}>{cuerpo}</View>;
  }

  const rolFinal: RolChip = rol ?? (active === undefined ? 'boton' : 'casilla');
  // `undefined` y no `false` cuando el rol no lleva estado: `aria-checked` sobre
  // un botón no es ARIA válido, y un lector que lo lee igual dice algo que no
  // corresponde.
  const marcado = rolFinal === 'boton' ? undefined : active === true;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={cascara}
      accessibilityRole={ROL_NATIVO[rolFinal]}
      accessibilityLabel={accessibilityLabel ?? label}
      // Las DOS APIs, y ninguna sobra: `accessibilityState` es la que leen
      // VoiceOver y TalkBack en la app nativa, y react-native-web 0.21 dejó de
      // traducirla EN SILENCIO —sin error, sin warning, y `tsc` la acepta
      // porque el tipo de React Native sigue existiendo—, así que la web
      // necesita además el `aria-*`. Mismo patrón que RegisterScreen (28-jul);
      // lo ata __tests__/lib/controlesConEstadoAccesible.test.ts.
      accessibilityState={{ checked: marcado, expanded: expandido }}
      aria-checked={marcado}
      aria-expanded={expandido}
    >
      {cuerpo}
    </TouchableOpacity>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    base: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    active: {
      backgroundColor: colors.ink,
    },
    inactive: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      ...shadow.card,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 1,
    },
  });

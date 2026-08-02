import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  etiquetaInstitucion,
  etiquetaVerificada,
  iconoInstitucion,
  type Institucion,
} from '../lib/institucion';
import { AppText } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

export interface InsigniaInstitucionProps {
  /** La institución a mostrar. `null` (una persona, o la 0057 sin aplicar) no dibuja nada. */
  institucion: Institucion | null;
  /**
   * Compacta: solo el sello ("Veterinaria verificada"), sin el nombre ni los
   * datos. Es la forma que va al lado de "Publicado por Vet Ñuñoa", donde el
   * nombre ya está escrito una línea antes.
   */
  compacta?: boolean;
}

/**
 * SELLO DE CUENTA INSTITUCIONAL — sobrio a propósito.
 *
 * Es la única diferencia visible entre "alguien publicó esto" y "lo publicó el
 * refugio de la comuna". Tiene que verse serio: ícono de línea, sin emojis, sin
 * color de alarma. Un sello que grita deja de parecer un sello, y lo que una
 * institución evalúa cuando mira la app es justamente si se ve seria.
 *
 * No decide NADA sobre quién está verificado: eso lo resuelve `institucionDe`
 * (src/lib/institucion.ts), que exige `institucion_verificada_en` — un dato que
 * el usuario no puede escribir (revoke update por columna, migración 0057).
 */
export default function InsigniaInstitucion({ institucion, compacta }: InsigniaInstitucionProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  if (!institucion) return null;

  const sello = (
    <View style={styles.sello}>
      <Ionicons name="shield-checkmark-outline" size={13} color={colors.brand} />
      <AppText weight="semi" size={12} color={colors.brand} style={styles.selloTexto}>
        {etiquetaVerificada(institucion.tipo)}
      </AppText>
    </View>
  );

  if (compacta) return sello;

  return (
    <View style={styles.bloque}>
      {sello}
      <View style={styles.fila}>
        <Ionicons name={iconoInstitucion(institucion.tipo) as any} size={16} color={colors.muted} />
        <AppText weight="semi" size={14} style={styles.filaTexto}>
          {institucion.nombre}
        </AppText>
      </View>
      {institucion.comuna ? (
        <View style={styles.fila}>
          <Ionicons name="location-outline" size={16} color={colors.muted} />
          <AppText muted size={13} style={styles.filaTexto}>
            {etiquetaInstitucion(institucion.tipo)} en {institucion.comuna}
          </AppText>
        </View>
      ) : null}
      {institucion.contacto ? (
        <View style={styles.fila}>
          <Ionicons name="call-outline" size={16} color={colors.muted} />
          <AppText muted size={13} style={styles.filaTexto}>
            {institucion.contacto}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    bloque: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      gap: spacing.xs,
    },
    sello: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
    },
    selloTexto: {
      letterSpacing: 0.2,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: 2,
    },
    filaTexto: {
      flex: 1,
    },
  });

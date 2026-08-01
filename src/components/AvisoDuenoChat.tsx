import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '../ui';
import { listaDeSenas, type SenasPrivadas } from '../lib/senaPrivada';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// EL AVISO QUE VE EL DUEÑO EN SU PROPIO CHAT.
//
// El momento correcto para hablar de estafas no es un documento legal que nadie
// lee: es el segundo exacto en que alguien escribe "la tengo". Ahí, y solo ahí,
// aparece esto.
//
// TONO. Se lo lee alguien angustiado, y la enorme mayoría de la gente que escribe
// es honesta y está tratando de ayudar. No queremos que desconfíe del barrio:
// queremos que tenga UNA herramienta concreta para verificar. Por eso el texto es
// corto, no dice "cuidado con esta persona", y lo primero que ofrece es una
// acción (pedir la seña), no un miedo.

export const TEXTO_AVISO_DUENO = {
  // Cuando el dueño guardó una seña.
  conSena: 'Antes de coordinar, pedile que te describa la seña que guardaste. Solo la ve quien la tiene de verdad.',
  // Y en los dos casos, lo que nunca hay que hacer.
  dinero: 'Nunca mandes dinero por adelantado, ni para un flete ni para una veterinaria.',
  // Cuando en el chat apareció un pedido de plata por adelantado. Redactado para
  // que sirva a CUALQUIERA de los dos lados (a quien busca y a quien encontró), y
  // sin acusar: "no es prueba de nada" está ahí a propósito.
  alerta:
    'Mencionaron un pago por adelantado. No es prueba de nada, pero no transfieras: la plata se entrega en persona, recién cuando la mascota está con su familia.',
  ver: 'Ver mi seña',
  ocultar: 'Ocultar',
} as const;

export interface AvisoDuenoChatProps {
  senas: SenasPrivadas | null;
  // ¿La otra persona pidió plata por adelantado? Ver lib/pedidoDeDinero.ts.
  alertaPago?: boolean;
}

export function AvisoDuenoChat({ senas, alertaPago = false }: AvisoDuenoChatProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [abierto, setAbierto] = useState(false);
  const lista = listaDeSenas(senas);

  // Sin seña guardada y sin nada raro en el chat, no hay nada útil que decir: el
  // aviso genérico antiestafa ya está más abajo. Un cartel de más en una pantalla
  // donde la persona está esperando noticias de su perro es ruido.
  if (lista.length === 0 && !alertaPago) return null;

  return (
    <View style={[styles.caja, alertaPago && styles.cajaAlerta]}>
      <Ionicons
        name={alertaPago ? 'alert-circle-outline' : 'shield-checkmark-outline'}
        size={16}
        color={alertaPago ? colors.lost : colors.brand}
        style={styles.icono}
      />
      <View style={styles.cuerpo}>
        {alertaPago ? (
          <AppText size={12} style={styles.texto}>
            {TEXTO_AVISO_DUENO.alerta}
          </AppText>
        ) : null}
        {lista.length > 0 ? (
          <AppText size={12} style={styles.texto}>
            {TEXTO_AVISO_DUENO.conSena}
          </AppText>
        ) : null}
        {!alertaPago ? (
          <AppText muted size={12} style={styles.texto}>
            {TEXTO_AVISO_DUENO.dinero}
          </AppText>
        ) : null}

        {lista.length > 0 ? (
          <>
            {/* La seña arranca TAPADA. Es un dato que existe justamente para no
                estar a la vista, y esta pantalla se usa en la calle, en el
                colectivo, con gente al lado. */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setAbierto((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={abierto ? TEXTO_AVISO_DUENO.ocultar : TEXTO_AVISO_DUENO.ver}
              style={styles.verBoton}
            >
              <Ionicons
                name={abierto ? 'eye-off-outline' : 'eye-outline'}
                size={14}
                color={colors.brand}
              />
              <AppText weight="bold" size={12} color={colors.brand}>
                {abierto ? TEXTO_AVISO_DUENO.ocultar : TEXTO_AVISO_DUENO.ver}
              </AppText>
            </TouchableOpacity>
            {abierto
              ? lista.map((s) => (
                  <AppText key={s} size={12} weight="bold" style={styles.sena}>
                    · {s}
                  </AppText>
                ))
              : null}
          </>
        ) : null}
      </View>
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
    cajaAlerta: {
      borderWidth: 1,
      borderColor: colors.lost,
    },
    icono: { marginTop: 1 },
    cuerpo: { flex: 1, gap: spacing.xs },
    texto: { lineHeight: 17 },
    verBoton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
    sena: { lineHeight: 17 },
  });

export default AvisoDuenoChat;

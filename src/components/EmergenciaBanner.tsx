import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { eventosActivos, type Evento } from '../services/eventos';

// Banner de emergencia en Inicio (Tanda 19). Si hay un evento activo (una
// catástrofe sembrada por el admin), muestra una tarjeta que lleva al feed de
// esa zona. Si no hay evento, o si la lectura falla, NO renderiza nada: degrada
// en silencio como los demás banners de Inicio (nunca rompe la portada).
export function EmergenciaBanner() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const navigation = useNavigation<any>();
  const [evento, setEvento] = useState<Evento | null>(null);

  useEffect(() => {
    let vivo = true;
    eventosActivos()
      .then((lista) => {
        if (vivo) setEvento(lista[0] ?? null);
      })
      .catch(() => {
        // Sin conexión / RLS: el banner simplemente no aparece. No es dato
        // crítico de esta pantalla y no debe romper Inicio.
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!evento) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.wrap}
      onPress={() => navigation.navigate('Evento', { id: evento.id })}
      accessibilityRole="button"
      accessibilityLabel={`Emergencia: ${evento.nombre}. Ver mascotas de la zona`}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="warning-outline" size={20} color={colors.white} />
      </View>
      <View style={styles.textWrap}>
        <AppText weight="bold" size={14} color={colors.white}>
          {evento.nombre}
        </AppText>
        <AppText size={12} color={colors.white}>
          ¿Perdiste tu mascota en la zona? Mirá los reportes acá.
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.white} />
    </TouchableOpacity>
  );
}

function crearEstilos(colors: Colors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.lost,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    iconWrap: { justifyContent: 'center' },
    textWrap: { flex: 1, gap: 2 },
  });
}

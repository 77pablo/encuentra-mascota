import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { listMyReports, Pet } from '../services/pets';
import { avisoDeVigencia } from '../lib/avisoVigencia';
import { AppText } from '../ui';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

interface BannerVigenciaProps {
  // A dónde lleva tocarlo: "Mis reportes activos" del perfil, que es donde
  // están los botones de reactivar.
  onPress?: () => void;
  // Si el llamador ya tiene los reportes, se los pasa para no repetir el pedido.
  reportes?: Pet[];
}

// AVISO IN-APP DE VIGENCIA (sin push, sin correo, sin migración).
//
// Hasta ahora el único aviso de que un reporte se estaba por vencer era el
// nudge DENTRO de la ficha: había que abrir el propio reporte para enterarse.
// El que lleva 40 días buscando ya no entra todos los días a su ficha, y a los
// 45 el reporte sale de las búsquedas y del motor de coincidencias sin que
// nadie le diga nada. Este banner vive en Inicio, así que se ve solo.
//
// Si no hay sesión, o no hay nada por vencer, no renderiza nada. Si `pets`
// falla, degrada en silencio: Inicio no puede depender de esto.
export function BannerVigencia({ onPress, reportes: reportesProp }: BannerVigenciaProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { user } = useAuth();
  const [propios, setPropios] = useState<Pet[] | null>(null);

  const cargar = useCallback(() => {
    if (reportesProp !== undefined) return; // el llamador ya los trae
    if (!user) {
      setPropios([]);
      return;
    }
    listMyReports(user.id, true)
      .then(setPropios)
      .catch(() => setPropios([]));
  }, [user, reportesProp]);

  useFocusEffect(cargar);

  if (!user) return null;
  const reportes = reportesProp ?? propios;
  if (!reportes) return null;

  const aviso = avisoDeVigencia(reportes);
  if (!aviso) return null;

  const vencido = aviso.tipo === 'vencido';
  const contenido = (
    <>
      <View style={styles.iconWrap}>
        <Ionicons
          name={vencido ? 'pause-circle' : 'time-outline'}
          size={20}
          color={vencido ? colors.lost : colors.brand}
        />
      </View>
      <View style={styles.textWrap}>
        <AppText weight="bold" size={14}>
          {aviso.titulo}
        </AppText>
        <AppText muted size={12}>
          {aviso.detalle}
        </AppText>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.brand} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.wrap}>{contenido}</View>;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`${aviso.titulo}. ${aviso.detalle}`}
    >
      {contenido}
    </TouchableOpacity>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sky,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
});

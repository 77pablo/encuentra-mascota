import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { listMyPets, MyPet } from '../services/myPets';
import { resumenRecordatoriosVarios } from '../lib/recordatorios';
import { AppText } from '../ui';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

interface RecordatoriosBannerProps {
  // Opcional: en MyPetsScreen (donde ya se están viendo las fichas) no hace
  // falta navegar a ningún lado al tocarlo, así que se omite y el banner se
  // muestra sin flecha ni TouchableOpacity.
  onPress?: () => void;
  // Si el llamador YA tiene las fichas cargadas (MyPetsScreen), se las pasa
  // acá para no repetir el pedido. Si no viene (Inicio), el banner se las trae
  // solo y degrada en silencio si `my_pets` falla.
  fichas?: MyPet[];
}

function carnetDe(f: MyPet) {
  return {
    vacunaProxima: f.vacuna_proxima,
    antiparasitarioInternoProximo: f.antiparasitario_interno_proximo,
    antiparasitarioExternoProximo: f.antiparasitario_externo_proximo,
  };
}

// Aviso in-app (Función 6, "solo in-app": sin push ni correo) de que alguna
// mascota tiene una dosis por vencer o vencida. Si no hay sesión, o no hay
// nada pendiente, no renderiza nada.
export function RecordatoriosBanner({ onPress, fichas: fichasProp }: RecordatoriosBannerProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { user } = useAuth();
  const [fichasPropias, setFichasPropias] = useState<MyPet[] | null>(null);

  const cargar = useCallback(() => {
    if (fichasProp !== undefined) return; // el llamador ya trae las fichas
    if (!user) {
      setFichasPropias([]);
      return;
    }
    listMyPets(user.id)
      .then(setFichasPropias)
      // Home no puede depender de esto: si my_pets falla, el banner
      // simplemente no aparece.
      .catch(() => setFichasPropias([]));
  }, [user, fichasProp]);

  useFocusEffect(cargar);

  if (!user) return null;
  const fichas = fichasProp ?? fichasPropias;
  if (!fichas) return null;

  const resumen = resumenRecordatoriosVarios(
    fichas.map((f) => ({ nombre: f.nombre, carnet: carnetDe(f) })),
    new Date(),
  );
  if (!resumen) return null;

  const contenido = (
    <>
      <View style={styles.iconWrap}>
        <Ionicons name="medkit-outline" size={20} color={colors.brand} />
      </View>
      <View style={styles.textWrap}>
        <AppText weight="bold" size={14}>
          {resumen}
        </AppText>
        <AppText muted size={12}>
          {onPress ? 'Toca para ver el carnet en Mis mascotas.' : 'Revisá el carnet más abajo.'}
        </AppText>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.brand} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.wrap}>{contenido}</View>;
  }

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.wrap}>
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

import React, { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { guardarBusqueda } from '../services/busquedasGuardadas';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { notify } from '../lib/notify';
import { Button } from '../ui';
import { spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Botón "Avisarme de esta búsqueda" (Función 2). Aparece en `ExplorarScreen`
// cuando los filtros activos tienen una comuna Y un estado concreto (perdida
// o encontrada): `tipo` es obligatorio en `busquedas_guardadas` (0031), así
// que con el filtro "Todas" no hay nada válido que guardar.
export default function GuardarBusquedaButton({
  tipo,
  especie,
  comuna,
}: {
  tipo: 'perdida' | 'encontrada';
  especie: 'perro' | 'gato' | 'otro' | null;
  comuna: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const requireAuth = useRequireAuth();
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!requireAuth('guardar_busqueda')) return;
    setGuardando(true);
    try {
      await guardarBusqueda({ tipo, especie, comuna });
      notify('¡Listo!', `Te avisaremos cuando aparezca algo así en ${comuna}.`);
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Button
      title="🔔 Avisarme de esta búsqueda"
      variant="secondary"
      icon="notifications-outline"
      onPress={guardar}
      loading={guardando}
      disabled={guardando}
      style={styles.button}
    />
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    button: {
      marginTop: spacing.sm,
    },
  });

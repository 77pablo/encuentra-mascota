import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pet } from '../services/pets';
import { debeNudgear, diasDesdeRenovacion } from '../lib/cicloVida';
import { AppText, Button, Card, Title } from '../ui';
import { colors, spacing } from '../theme';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'tu perro',
  gato: 'tu gato',
  otro: 'tu mascota',
};

export interface NudgeVigenciaProps {
  pet: Pet;
  // "Sí, volvió" → flujo de reencuentro (final feliz) existente.
  onVolvio: () => void;
  // "Sigue perdida" → renovar (reinicia el reloj de 45 días).
  onRenovar: () => void;
  // "Archivar por ahora" → sale de las búsquedas, reactivable con un toque.
  onArchivar: () => void;
  guardando?: boolean;
  now?: number;
}

// Nudge in-app amable para el dueño de un reporte que lleva 14+ días sin
// renovar (y sigue vigente): le preguntamos si su mascota ya volvió a casa.
// No usa push ni la cola de avisos: aparece cuando el dueño abre su reporte.
// Se dibuja solo (devuelve null) si todavía no toca nudgear.
export function NudgeVigencia({
  pet,
  onVolvio,
  onRenovar,
  onArchivar,
  guardando = false,
  now,
}: NudgeVigenciaProps) {
  if (!debeNudgear(pet, now)) return null;

  const dias = diasDesdeRenovacion(pet, now);
  const nombre = pet.nombre?.trim() || especieLabel[pet.especie];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="heart-outline" size={18} color={colors.brand} />
        <Title size={16} style={styles.headerTitle}>
          Pasaron {dias} días. ¿{nombre} ya volvió a casa?
        </Title>
      </View>
      <AppText muted size={13} style={styles.texto}>
        Contanos cómo va, así mantenemos el mapa al día. Nada se pierde: si lo archivás,
        lo traés de vuelta cuando quieras.
      </AppText>
      <Button
        title="Sí, volvió a casa"
        icon="heart"
        onPress={onVolvio}
        disabled={guardando}
        style={styles.accion}
      />
      <Button
        title="Sigue perdida"
        variant="secondary"
        icon="refresh"
        loading={guardando}
        onPress={onRenovar}
        style={styles.accion}
      />
      <Button
        title="Archivar por ahora"
        variant="ghost"
        icon="archive-outline"
        disabled={guardando}
        onPress={onArchivar}
        style={styles.accion}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.sky,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    flexShrink: 1,
    lineHeight: 22,
  },
  texto: {
    lineHeight: 19,
    marginBottom: spacing.xs,
  },
  accion: {
    marginTop: spacing.xs,
  },
});

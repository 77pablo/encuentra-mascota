import React, { useEffect, useState, useMemo } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pet } from '../services/pets';
import { listFinalesFelices } from '../services/reunions';
import { reunionLabel } from '../lib/reunion';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { AppText, Card, EmptyState, ErrorState, Loading, Screen, Title } from '../ui';
import { Colors, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Galería completa de reencuentros ("final feliz"). La tira de Inicio muestra
// unos pocos; acá se ven todos, con la historia que dejó el dueño. Esperanza +
// prueba social para la comunidad.

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const LIMITE = 50;

export default function VolvieronACasaScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [finales, setFinales] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    setLoading(true);
    setError(null);
    listFinalesFelices(LIMITE)
      .then(setFinales)
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  };

  useEffect(cargar, []);

  if (loading) {
    return <Loading />;
  }
  if (error) {
    return (
      <Screen padded>
        <ErrorState message={error} onRetry={cargar} />
      </Screen>
    );
  }

  return (
    <Screen padded>
      <FlatList
        data={finales}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <AppText muted size={13} style={styles.intro}>
            Cada una de estas volvió a casa gracias al barrio. Ojalá pronto sume la tuya.
          </AppText>
        }
        ListEmptyComponent={
          <EmptyState
            illustration
            title="Todavía no hay reencuentros por acá"
            subtitle="Cuando una mascota vuelva a casa, su historia va a aparecer aquí."
          />
        }
        renderItem={({ item }) => {
          const foto = item.final_foto || item.fotos[0];
          return (
            <Card style={styles.card}>
              {foto ? (
                <Image source={{ uri: foto }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="heart" size={32} color={colors.found} />
                </View>
              )}
              <View style={styles.body}>
                <View style={styles.nameRow}>
                  <Ionicons name="heart" size={15} color={colors.found} />
                  <AppText weight="bold" size={16} numberOfLines={1} style={styles.name}>
                    {item.nombre || especieLabel[item.especie]}
                  </AppText>
                </View>
                <AppText muted size={12}>
                  {reunionLabel(item) || 'Volvió a casa'}
                </AppText>
                {item.final_feliz ? (
                  <AppText size={14} style={styles.historia}>
                    {item.final_feliz}
                  </AppText>
                ) : null}
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  intro: {
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  separator: {
    height: spacing.lg,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 220,
    backgroundColor: colors.sky,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: spacing.lg,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    flexShrink: 1,
  },
  historia: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});

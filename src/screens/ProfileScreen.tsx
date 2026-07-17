import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { closePet, deletePet, Pet } from '../services/pets';
import { useAuth } from '../hooks/useAuth';
import { confirmAction, notify } from '../lib/notify';
import { AppText, Badge, Button, Card, Confetti, EmptyState, Screen } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

export default function ProfileScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const [mis, setMis] = useState<Pet[]>([]);
  const [celebrating, setCelebrating] = useState(false);

  const cargar = useCallback(() => {
    supabase.from('pets').select('*').eq('user_id', user!.id).eq('activo', true)
      .then(({ data }) => setMis((data ?? []) as Pet[]));
  }, [user]);

  useFocusEffect(cargar);

  const marcar = async (id: string) => {
    await closePet(id);
    setCelebrating(true);
    notify('¡Genial!', 'Reporte cerrado.');
    cargar();
  };

  const editar = (item: Pet) => {
    navigation.navigate('EditPet', { pet: item });
  };

  const borrar = async (id: string) => {
    const ok = await confirmAction('¿Borrar reporte?', 'Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await deletePet(id);
      notify('Borrado', 'El reporte se eliminó.');
      cargar();
    } catch (e: any) {
      notify('Error', e?.message ?? 'No se pudo borrar.');
    }
  };

  const inicial = user?.email ? user.email.charAt(0).toUpperCase() : '🐾';

  return (
    <Screen padded>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <AppText weight="bold" size={22} color={colors.brand}>
            {inicial}
          </AppText>
        </View>
        <View style={styles.headerText}>
          <AppText weight="bold" size={16}>
            {user?.email}
          </AppText>
          <AppText muted size={13}>
            Mis reportes activos
          </AppText>
        </View>
      </View>

      <FlatList
        data={mis}
        keyExtractor={(p) => p.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            emoji="🐾"
            title="No tienes reportes activos"
            subtitle="Cuando publiques una mascota, aparece aquí."
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.reportCard}>
            <Badge estado={item.estado} />
            <AppText weight="semi" size={14} style={styles.reportTitle}>
              {especieLabel[item.especie]}
            </AppText>
            <AppText muted size={13} style={styles.reportDescription}>
              {item.descripcion.slice(0, 60)}
            </AppText>
            <Button
              title="Ya apareció"
              variant="secondary"
              icon="checkmark-circle"
              onPress={() => marcar(item.id)}
              style={styles.reportButton}
            />
            <View style={styles.reportActionsRow}>
              <Button
                title="Editar"
                variant="ghost"
                icon="create"
                onPress={() => editar(item)}
                style={styles.reportActionButton}
              />
              <Button
                title="Borrar"
                variant="ghost"
                icon="trash"
                onPress={() => borrar(item.id)}
                style={styles.reportActionButton}
              />
            </View>
          </Card>
        )}
      />

      <Button title="Cerrar sesión" variant="danger" onPress={signOut} style={styles.signOutButton} />

      <Confetti visible={celebrating} onDone={() => setCelebrating(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
  },
  separator: {
    height: spacing.md,
  },
  reportCard: {
    gap: spacing.xs,
  },
  reportTitle: {
    marginTop: spacing.xs,
  },
  reportDescription: {
    marginBottom: spacing.xs,
  },
  reportButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  reportActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reportActionButton: {
    paddingHorizontal: spacing.md,
  },
  signOutButton: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});

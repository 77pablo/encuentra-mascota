import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { countReunidas, listActivePets, Pet } from '../services/pets';
import { useMyLocation } from '../hooks/useMyLocation';
import { distanceKm as getDistanceKm, distanceLabel } from '../lib/geo';
import { timeAgo } from '../lib/time';
import { AppText, Button, Card, ErrorState, Loading, Mascota, Screen, Squiggle, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

const RECIENTES_LIMIT = 4;

export default function HomeScreen({ navigation }: any) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [reunidas, setReunidas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useMyLocation(true);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listActivePets(), countReunidas()])
      .then(([activePets, count]) => {
        setPets(activePets);
        setReunidas(count);
      })
      .catch((e: any) => setError(e?.message ?? 'No pudimos cargar la información.'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(cargar);

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

  // Ya vienen ordenadas de más nueva a más vieja; solo tomamos las primeras
  // y, si tenemos ubicación, les calculamos la distancia (sin reordenar).
  const topPets = pets.slice(0, RECIENTES_LIMIT);
  const recientes: { pet: Pet; distanceKm?: number }[] = location.coords
    ? topPets.map((p) => ({
        pet: p,
        distanceKm: getDistanceKm(location.coords!, { lat: p.lat, lng: p.lng }),
      }))
    : topPets.map((p) => ({ pet: p }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.hero}>
          <Mascota size={64} color={colors.brandDark} />
          <Title size={26} align="center" style={styles.heroTitle}>
            Encuentra tu Mascota
          </Title>
          <Squiggle width={110} style={styles.heroSquiggle} />
          <AppText muted align="center" style={styles.heroSubtitle}>
            Aquí el barrio se organiza para que ninguna mascota se quede sin volver a casa.
          </AppText>
        </Card>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.actionWrap}
            onPress={() => navigation.navigate('Publicar', { estado: 'perdida' })}
          >
            <Card style={[styles.actionCard, styles.actionCardLost]}>
              <Title size={16} align="center">
                Se me perdió
              </Title>
              <AppText muted align="center" size={12} style={styles.actionSubtitle}>
                Pide ayuda para buscarla
              </AppText>
            </Card>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.actionWrap}
            onPress={() => navigation.navigate('Publicar', { estado: 'encontrada' })}
          >
            <Card style={[styles.actionCard, styles.actionCardFound]}>
              <Title size={16} align="center">
                Me encontré una
              </Title>
              <AppText muted align="center" size={12} style={styles.actionSubtitle}>
                Veamos de quién es
              </AppText>
            </Card>
          </TouchableOpacity>
        </View>

        <Button
          title="Ver quiénes andan perdidos cerca"
          icon="search"
          onPress={() => navigation.navigate('Lista')}
          style={styles.searchButton}
        />

        <Card style={[styles.statCard, reunidas > 0 && styles.statCardCelebrate]}>
          <AppText weight="bold" align="center" size={16}>
            {reunidas > 0
              ? `Ya van ${reunidas} vuelta${reunidas === 1 ? '' : 's'} a casa`
              : 'Todavía no hay reencuentros. Puedes empezar tú.'}
          </AppText>
        </Card>

        <Title size={18} style={styles.sectionTitle}>
          Perdidos y encontrados cerca
        </Title>

        {recientes.length === 0 ? (
          <AppText muted style={styles.emptyRecientes}>
            Aún no hay reportes por acá. Publica el primero.
          </AppText>
        ) : (
          <View style={styles.recientesList}>
            {recientes.map(({ pet, distanceKm: dKm }) => (
              <TouchableOpacity
                key={pet.id}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PetDetail', { id: pet.id })}
              >
                <Card style={styles.recienteRow}>
                  {pet.fotos[0] ? (
                    <Image source={{ uri: pet.fotos[0] }} style={styles.recientePhoto} />
                  ) : (
                    <View style={[styles.recientePhoto, styles.recientePhotoPlaceholder]}>
                      <Mascota size={30} color={colors.muted} />
                    </View>
                  )}
                  <View style={styles.recienteInfo}>
                    <AppText weight="bold" size={14} numberOfLines={1}>
                      {especieLabel[pet.especie]}
                      {pet.nombre ? ` · ${pet.nombre}` : ''}
                    </AppText>
                    <AppText muted size={12} numberOfLines={1}>
                      🕓 {timeAgo(pet.creado_en)}
                      {dKm !== undefined ? `  ·  📍 ${distanceLabel(dKm)}` : ''}
                    </AppText>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  hero: {
    backgroundColor: colors.sky,
    alignItems: 'center',
  },
  heroTitle: {
    marginTop: spacing.sm,
  },
  heroSquiggle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionWrap: {
    flex: 1,
  },
  actionCard: {
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 2,
  },
  actionCardLost: {
    borderColor: colors.lost,
  },
  actionCardFound: {
    borderColor: colors.found,
  },
  actionSubtitle: {
    marginTop: 2,
  },
  searchButton: {
    alignSelf: 'stretch',
  },
  statCard: {
    alignItems: 'center',
  },
  statCardCelebrate: {
    backgroundColor: colors.sun,
  },
  sectionTitle: {
    marginTop: spacing.sm,
  },
  emptyRecientes: {
    paddingVertical: spacing.md,
  },
  recientesList: {
    gap: spacing.sm,
  },
  recienteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
  },
  recientePhoto: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
  },
  recientePhotoPlaceholder: {
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recienteInfo: {
    flex: 1,
    gap: 2,
  },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import PetCard from '../components/PetCard';
import ComunaPickerModal from '../components/ComunaPickerModal';
import { useMyLocation } from '../hooks/useMyLocation';
import { useBusquedaReportes } from '../hooks/useBusquedaReportes';
import { useAuth } from '../hooks/useAuth';
import { FiltrosBusqueda, contarReportesEnComuna } from '../services/busqueda';
import { comunaDeCoords } from '../lib/comunas';
import { getComunasSeguidas, seguirComuna, dejarDeSeguirComuna } from '../services/comunasSeguidas';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { notify } from '../lib/notify';
import { AppText, Button, Card, EmptyState, ErrorState, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

export default function ComunidadScreen({ navigation }: any) {
  const location = useMyLocation(true);
  const { user } = useAuth();
  const [comuna, setComuna] = useState<string | null>(null);
  const [comunaManual, setComunaManual] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [sigue, setSigue] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Comuna por defecto: la de tu ubicación, salvo que la fijes a mano.
  useEffect(() => {
    if (comunaManual || !location.coords) return;
    const c = comunaDeCoords(location.coords.lat, location.coords.lng);
    if (c && c.nombre !== comuna) setComuna(c.nombre);
  }, [location.coords, comunaManual, comuna]);

  const filtros: FiltrosBusqueda = useMemo(
    () => ({ comuna: comuna ?? null, orden: 'recientes' }),
    [comuna],
  );
  const { reportes, cargando, cargandoMas, error, hayMas, recargar, cargarMas } =
    useBusquedaReportes(filtros);

  // Conteo total de la comuna (el feed está paginado, así que no alcanza con
  // reportes.length). Se refresca al cambiar de comuna y al volver a la pantalla.
  const cargarTotal = useCallback(() => {
    if (!comuna) {
      setTotal(null);
      return;
    }
    contarReportesEnComuna(comuna)
      .then(setTotal)
      .catch(() => setTotal(null));
  }, [comuna]);
  useFocusEffect(cargarTotal);

  // ¿El usuario ya sigue esta comuna?
  useEffect(() => {
    if (!user || !comuna) {
      setSigue(false);
      return;
    }
    let vivo = true;
    getComunasSeguidas(user.id)
      .then((cs) => {
        if (vivo) setSigue(cs.includes(comuna));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [user, comuna]);

  const elegirComuna = (nombre: string) => {
    setComuna(nombre);
    setComunaManual(true);
  };

  const toggleSeguir = async () => {
    if (!user) {
      notify('Creá una cuenta', 'Necesitás una cuenta para seguir comunas y recibir avisos.');
      navigation.navigate('Register');
      return;
    }
    if (!comuna) return;
    setGuardando(true);
    try {
      if (sigue) {
        await dejarDeSeguirComuna(user.id, comuna);
        setSigue(false);
        notify('Listo', `Dejaste de seguir ${comuna}.`);
      } else {
        await seguirComuna(user.id, comuna);
        setSigue(true);
        notify('¡Listo!', `Te avisaremos de reportes nuevos en ${comuna}.`);
      }
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Screen padded>
      <Title size={22} style={styles.screenTitle}>
        Comunidad
      </Title>

      <TouchableOpacity activeOpacity={0.8} onPress={() => setPickerOpen(true)}>
        <Card style={styles.comunaCard}>
          <Ionicons name="business" size={20} color={colors.brand} />
          <View style={styles.comunaTextWrap}>
            <AppText weight="bold" size={16}>
              {comuna ?? 'Elegí una comuna'}
            </AppText>
            <AppText muted size={12}>
              {comuna
                ? total === null
                  ? 'Reportes de tu comuna'
                  : `${total} ${total === 1 ? 'reporte activo' : 'reportes activos'}`
                : 'Tocá para elegir'}
            </AppText>
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        </Card>
      </TouchableOpacity>

      {comuna ? (
        <Button
          title={sigue ? `Siguiendo ${comuna}` : `Avisarme de ${comuna}`}
          icon={sigue ? 'notifications' : 'notifications-outline'}
          variant={sigue ? 'secondary' : 'primary'}
          onPress={toggleSeguir}
          loading={guardando}
          disabled={guardando}
          style={styles.seguirButton}
        />
      ) : null}

      {cargando ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={recargar} />
      ) : (
        <FlatList
          data={reportes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={hayMas ? cargarMas : undefined}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            cargandoMas ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              illustration
              title={comuna ? `Nada en ${comuna} por ahora` : 'Elegí una comuna'}
              subtitle={
                comuna
                  ? 'Ojalá siga así. Si viste algo, contale al barrio.'
                  : 'Elegí una comuna para ver los reportes de tu zona.'
              }
            />
          }
          renderItem={({ item }) => (
            <PetCard
              pet={item}
              distanceKm={item.distancia_km ?? undefined}
              onPress={() => navigation.navigate('PetDetail', { id: item.id })}
            />
          )}
        />
      )}

      <ComunaPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={elegirComuna}
        titulo="Elegí tu comuna"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  comunaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  comunaTextWrap: {
    flex: 1,
    gap: 2,
  },
  seguirButton: {
    marginTop: spacing.md,
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
});

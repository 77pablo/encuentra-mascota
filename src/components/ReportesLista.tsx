import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import PetCard from './PetCard';
import { EmptyState, ErrorState, Loading, Screen } from '../ui';
import { spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { useBusquedaReportes } from '../hooks/useBusquedaReportes';
import { FiltrosBusqueda } from '../services/busqueda';

// Cuerpo de LISTA de reportes: el FlatList de tarjetas + estados de
// carga/error/vacío + scroll infinito. Extraído de la vieja `ListScreen` para
// que `ExplorarScreen` pueda montarlo junto al mapa compartiendo `filtros`. Los
// chips/el input NO viven acá: los dueña `ExplorarScreen` y bajan como `filtros`.

// ¿Hay algún filtro activo? Se deriva del propio objeto `filtros` (no del estado
// de la pantalla, que vive arriba) para elegir el texto del empty state.
function hayFiltros(f: FiltrosBusqueda): boolean {
  return (
    (f.texto?.trim() ?? '') !== '' ||
    f.conRecompensa === true ||
    (f.desde ?? null) !== null ||
    (f.estado ?? null) !== null ||
    (f.especie ?? null) !== null ||
    (f.comuna ?? null) !== null ||
    (f.lat != null && f.lng != null)
  );
}

export default function ReportesLista({
  filtros,
  navigation,
}: {
  filtros: FiltrosBusqueda;
  navigation: any;
}) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { reportes, cargando, cargandoMas, error, hayMas, recargar, cargarMas } =
    useBusquedaReportes(filtros);

  if (cargando) {
    return <Loading />;
  }

  if (error) {
    return (
      <Screen padded>
        <ErrorState message={error} onRetry={recargar} />
      </Screen>
    );
  }

  return (
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
        hayFiltros(filtros) ? (
          <EmptyState
            illustration
            title="No encontramos nada así"
            subtitle="Prueba con otra palabra, amplía el rango o suelta algún filtro."
          />
        ) : (
          <EmptyState
            illustration
            title="Por ahora, nada por acá"
            subtitle="Ojalá siga así. Si viste algo, cuéntale al barrio."
          />
        )
      }
      renderItem={({ item }) => (
        <PetCard
          pet={item}
          distanceKm={item.distancia_km ?? undefined}
          onPress={() => navigation.navigate('PetDetail', { id: item.id })}
        />
      )}
    />
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
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

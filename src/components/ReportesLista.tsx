import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import PetCard from './PetCard';
import SeguirComunaButton from './SeguirComunaButton';
import { Button, EmptyState, ErrorState, Loading, Screen } from '../ui';
import { spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { useBusquedaReportes } from '../hooks/useBusquedaReportes';
import { FiltrosBusqueda } from '../services/busqueda';

// Cuerpo de LISTA de reportes: el FlatList de tarjetas + estados de
// carga/error/vacío + scroll infinito. Extraído de la vieja `ListScreen` para
// que `ExplorarScreen` pueda montarlo junto al mapa compartiendo `filtros`. Los
// chips/el input NO viven acá: los dueña `ExplorarScreen` y bajan como `filtros`.

// ¿La persona acotó QUÉ está buscando? Es distinto de acotar DÓNDE, y
// confundirlos le echaba la culpa al usuario nuevo: `hayFiltros()` contaba la
// comuna y las coordenadas como filtro, así que a quien abre la app en un barrio
// donde todavía no publica nadie le salía "No encontramos nada así · soltá
// algún filtro". No soltó ningún filtro de más: su barrio está vacío, y eso no
// se arregla tocando controles sino siguiendo la comuna o publicando.
//
// Se deriva del propio objeto `filtros` (no del estado de la pantalla, que vive
// arriba) para elegir el vacío que corresponde.
function hayFiltrosDeContenido(f: FiltrosBusqueda): boolean {
  return (
    (f.texto?.trim() ?? '') !== '' ||
    f.conRecompensa === true ||
    (f.desde ?? null) !== null ||
    (f.estado ?? null) !== null ||
    (f.especie ?? null) !== null
  );
}

export default function ReportesLista({
  filtros,
  navigation,
  onAmpliarBusqueda,
  ofrecerSeguirComuna = true,
}: {
  filtros: FiltrosBusqueda;
  navigation: any;
  /**
   * Suelta los filtros de LUGAR (comuna / "cerca de mí"). Lo dueña la pantalla
   * de arriba, que es la que tiene ese estado. Opcional: si no viene, el vacío
   * no ofrece un botón "Ver todo Chile" que no haría nada.
   */
  onAmpliarBusqueda?: () => void;
  /**
   * `false` cuando la pantalla de arriba YA muestra el botón de seguir la
   * comuna (Explorar lo pone en el panel de filtros). Sin esto, con el panel
   * abierto salía "Avisarme de Arica" dos veces, uno encima del otro.
   */
  ofrecerSeguirComuna?: boolean;
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

  const comuna = filtros.comuna?.trim() || null;
  const hayPunto = filtros.lat != null && filtros.lng != null;
  const verTodoChile = onAmpliarBusqueda ? (
    <Button title="Ver todo Chile" variant="ghost" onPress={onAmpliarBusqueda} />
  ) : null;
  const publicar = (
    <Button
      title="Publicar un reporte"
      variant="secondary"
      icon="add"
      onPress={() => navigation.navigate('Publicar')}
    />
  );

  // Tres vacíos distintos, porque son tres situaciones distintas.
  let vacio: React.ReactNode;
  if (hayFiltrosDeContenido(filtros)) {
    // Acá sí: la persona acotó la búsqueda y no hay coincidencias.
    vacio = (
      <EmptyState
        illustration
        title="No encontramos nada así"
        subtitle="Prueba con otra palabra, amplía el rango o suelta algún filtro."
        action={verTodoChile}
      />
    );
  } else if (comuna) {
    vacio = (
      <EmptyState
        illustration
        title={`Todavía no hay reportes en ${comuna}`}
        subtitle={`Sé la primera persona en seguir ${comuna} y te avisamos apenas aparezca alguno.`}
        action={
          <>
            {ofrecerSeguirComuna ? <SeguirComunaButton comuna={comuna} /> : null}
            {publicar}
            {verTodoChile}
          </>
        }
      />
    );
  } else if (hayPunto) {
    vacio = (
      <EmptyState
        illustration
        title="Por tu zona todavía no hay nada"
        subtitle="Ojalá siga así. Si querés, mirá más lejos o contale al barrio lo que viste."
        action={
          <>
            {publicar}
            {verTodoChile}
          </>
        }
      />
    );
  } else {
    vacio = (
      <EmptyState
        illustration
        title="Por ahora, nada por acá"
        subtitle="Ojalá siga así. Si viste algo, cuéntale al barrio."
        action={publicar}
      />
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
      ListEmptyComponent={vacio}
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

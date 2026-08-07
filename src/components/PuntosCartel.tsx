import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { Pet } from '../services/pets';
import { buscarPuntosCartel } from '../services/puntosCartel';
import type { PuntoCartel } from '../lib/puntosCartel';
import { abrirBusquedaMapa } from '../lib/mapas';
import { distanceLabel } from '../lib/geo';

// Radio de búsqueda de semáforos: ~800 m del punto del reporte. El punto ya
// viene difuminado ~250 m (privacidad), así que se busca alrededor del punto
// PÚBLICO — no expone nada nuevo.
const RADIO_M = 800;

type Estado =
  | { fase: 'inicial' }
  | { fase: 'cargando' }
  | { fase: 'listo'; puntos: PuntoCartel[] }
  | { fase: 'error' };

// "¿Dónde pego los carteles?" (Tanda 18). Sugiere semáforos cercanos —esquinas
// donde el auto para y lee el cartel— consultando OpenStreetMap EN VIVO, bajo
// demanda (Overpass es lento; nunca se dispara en la carga de la ficha). Si
// falla, degrada al consejo genérico de siempre. Mismo gate que el plan: lo
// monta PetDetailScreen solo para el dueño de una perdida no reunida.
export default function PuntosCartel({ pet }: { pet: Pet }) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [estado, setEstado] = useState<Estado>({ fase: 'inicial' });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Al desmontar, abortar cualquier búsqueda en curso (Overpass puede tardar).
    return () => abortRef.current?.abort();
  }, []);

  const buscar = async () => {
    setEstado({ fase: 'cargando' });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const puntos = await buscarPuntosCartel(pet.lat, pet.lng, RADIO_M, ctrl.signal);
      setEstado({ fase: 'listo', puntos });
    } catch {
      // Overpass caído/lento (504, timeout, red): no rompemos nada, mostramos
      // el consejo genérico. El error no se traga en silencio para el usuario:
      // la fase 'error' dibuja un mensaje que explica qué pasó.
      setEstado({ fase: 'error' });
    }
  };

  const consejoGenerico = (
    <AppText muted size={13} style={styles.consejo}>
      Pegá carteles grandes en las esquinas de más tráfico: semáforos, paraderos y la entrada del
      almacén. Que sean grandes y en papel fluorescente — una hoja blanca no se lee desde un auto.
    </AppText>
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="location-outline" size={18} color={colors.brand} />
        <Title size={17} style={styles.headerTitle}>
          ¿Dónde pego los carteles?
        </Title>
      </View>

      {estado.fase === 'inicial' ? (
        <>
          <AppText muted size={13} style={styles.intro}>
            Te buscamos las esquinas con semáforo cerca de la zona, que es donde más autos alcanzan a
            ver un cartel.
          </AppText>
          <Button
            title="Buscar esquinas cerca"
            variant="secondary"
            icon="search"
            onPress={buscar}
            style={styles.boton}
          />
        </>
      ) : null}

      {estado.fase === 'cargando' ? (
        <Button title="Buscando…" variant="secondary" loading disabled onPress={() => {}} />
      ) : null}

      {estado.fase === 'error' ? (
        <>
          <AppText muted size={13} style={styles.intro}>
            No pudimos traer las esquinas ahora (el mapa comunitario a veces se satura). Probá de
            nuevo en un rato — mientras, este consejo sirve igual:
          </AppText>
          {consejoGenerico}
          <Button
            title="Reintentar"
            variant="secondary"
            icon="refresh"
            onPress={buscar}
            style={styles.boton}
          />
        </>
      ) : null}

      {estado.fase === 'listo' && estado.puntos.length > 0 ? (
        <>
          <AppText muted size={13} style={styles.intro}>
            Semáforos cerca, del más próximo al más lejano. Tocá uno para verlo en el mapa y pegá ahí
            un cartel grande.
          </AppText>
          {estado.puntos.map((p, i) => (
            <TouchableOpacity
              key={`${p.lat},${p.lng}`}
              style={styles.fila}
              onPress={() => abrirBusquedaMapa(`${p.lat},${p.lng}`)}
              accessibilityRole="link"
              accessibilityLabel={`Semáforo a ${distanceLabel(p.distanciaM / 1000)}, ver en el mapa`}
            >
              <Ionicons name="pin" size={16} color={colors.brand} />
              <AppText size={14} style={styles.filaTexto}>
                Semáforo {i + 1}
              </AppText>
              <AppText muted size={13}>
                {distanceLabel(p.distanciaM / 1000)}
              </AppText>
              <Ionicons name="open-outline" size={16} color={colors.muted} />
            </TouchableOpacity>
          ))}
          <AppText muted size={11} style={styles.atribucion}>
            Esquinas según © colaboradores de OpenStreetMap
          </AppText>
        </>
      ) : null}

      {estado.fase === 'listo' && estado.puntos.length === 0 ? (
        <>
          <AppText muted size={13} style={styles.intro}>
            No encontramos semáforos cerca de la zona. Igual sirve el consejo de siempre:
          </AppText>
          {consejoGenerico}
        </>
      ) : null}
    </Card>
  );
}

function crearEstilos(colors: Colors) {
  return StyleSheet.create({
    card: { marginTop: spacing.md, gap: spacing.sm },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    headerTitle: { color: colors.ink },
    intro: { marginBottom: spacing.xs },
    consejo: { lineHeight: 19 },
    boton: { marginTop: spacing.xs, alignSelf: 'flex-start' },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    filaTexto: { flex: 1, color: colors.ink },
    atribucion: { marginTop: spacing.xs },
  });
}

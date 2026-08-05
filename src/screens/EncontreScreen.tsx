import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import PetCard from '../components/PetCard';
import { listLostBySpecies, Pet } from '../services/pets';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { notify } from '../lib/notify';
import { pickFromLibrary, takePhoto } from '../lib/pickImage';
import { AppText, Button, Card, Chip, EmptyState, Mascota, Screen, Title } from '../ui';
import { radius, spacing } from '../theme';

const especieOptions: { key: 'perro' | 'gato' | 'otro'; label: string }[] = [
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

export default function EncontreScreen({ navigation }: any) {
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'otro' | null>(null);
  const [resultados, setResultados] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  // Contador de intentos: además de `especie`, dispara la búsqueda. Sin esto,
  // volver a tocar la MISMA especie no re-dispara nada (el efecto solo mira
  // `especie`, que no cambió) y el que encontró al animal se queda mirando una
  // pantalla vacía sin ninguna forma de volver a intentar.
  const [intento, setIntento] = useState(0);

  const elegirEspecie = (key: 'perro' | 'gato' | 'otro') => {
    setEspecie(key);
    setIntento((n) => n + 1);
  };

  const reintentar = () => setIntento((n) => n + 1);

  // Nota: la foto es solo de referencia visual para el usuario, no se
  // analiza ni compara automáticamente; el "match" es a simple vista.
  useEffect(() => {
    if (!especie) return;
    let cancelled = false;
    setLoading(true);
    setBuscado(false);
    setErrorBusqueda(null);
    listLostBySpecies(especie)
      .then((pets) => {
        if (cancelled) return;
        setResultados(pets);
        setBuscado(true);
      })
      .catch((e: any) => {
        if (cancelled) return;
        const mensaje = mensajeDeErrorDb(e);
        notify('No se pudo buscar', mensaje);
        setResultados([]);
        // La búsqueda TERMINÓ (mal, pero terminó): sin esto los dos bloques de
        // salida —resultados y vacío— dependen de `buscado` y no se dibuja
        // nada, ni siquiera un reintento.
        setBuscado(true);
        setErrorBusqueda(mensaje);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [especie, intento]);

  const onTakePhoto = async () => {
    const uri = await takePhoto();
    if (uri) setFotoUri(uri);
  };

  const onPickFromLibrary = async () => {
    const uris = await pickFromLibrary(1);
    if (uris.length > 0) setFotoUri(uris[0]);
  };

  const goPublicarComoEncontrada = () => {
    navigation.navigate('Publicar', { estado: 'encontrada', fotoUri: fotoUri ?? undefined });
  };

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Mascota size={64} />
          <Title size={24} align="center" style={styles.pageTitle}>
            ¿Encontraste una mascota?
          </Title>
          <AppText muted size={14} align="center" style={styles.pageSubtitle}>
            Compara con los reportes de mascotas perdidas para ayudarla a volver a casa.
          </AppText>
        </View>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Foto de referencia (opcional)
          </Title>
          <AppText muted size={13} style={styles.helper}>
            Solo para que la compares tú mismo con los reportes, no la analizamos.
          </AppText>
          <View style={styles.photoButtonsRow}>
            <Button
              title="Tomar foto"
              variant="secondary"
              icon="camera"
              onPress={onTakePhoto}
              style={styles.photoButton}
            />
            <Button
              title="Galería"
              variant="secondary"
              icon="image"
              onPress={onPickFromLibrary}
              style={styles.photoButton}
            />
          </View>
          {fotoUri ? <Image source={{ uri: fotoUri }} style={styles.preview} /> : null}
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            ¿Qué especie es?
          </Title>
          <View style={styles.chipsRow} accessibilityRole="radiogroup">
            {especieOptions.map((o) => (
              <Chip
                key={o.key}
                rol="opcion"
                label={o.label}
                active={especie === o.key}
                onPress={() => elegirEspecie(o.key)}
              />
            ))}
          </View>
        </Card>

        {loading ? (
          <AppText muted style={styles.centerText}>
            Buscando reportes…
          </AppText>
        ) : null}

        {/* La búsqueda falló: se dice qué pasó y se ofrece volver a intentar.
            Antes acá no se dibujaba NADA y el flujo quedaba sin salida. */}
        {!loading && errorBusqueda ? (
          <View style={styles.section}>
            <EmptyState
              emoji="😿"
              title="No pudimos traer los reportes"
              subtitle={errorBusqueda}
            />
            <Button
              title="Reintentar"
              icon="refresh"
              onPress={reintentar}
              style={styles.actionButton}
            />
          </View>
        ) : null}

        {!loading && !errorBusqueda && buscado && resultados.length > 0 ? (
          <View style={styles.section}>
            <Title size={17}>¿Es alguna de estas?</Title>
            <AppText muted size={13} style={styles.resultsSubtitle}>
              Encontramos {resultados.length} perdida{resultados.length === 1 ? '' : 's'} de este tipo.
            </AppText>
            {resultados.map((pet) => (
              <PetCard
                key={pet.id}
                pet={pet}
                onPress={() => navigation.navigate('PetDetail', { id: pet.id })}
              />
            ))}
          </View>
        ) : null}

        {!loading && !errorBusqueda && buscado && resultados.length === 0 ? (
          <View style={styles.section}>
            <EmptyState
              emoji="🐾"
              title="No hay perdidas de este tipo reportadas"
              subtitle="Puedes publicarla como encontrada para que su familia la encuentre."
            />
            <Button
              title="Publicar como encontrada"
              icon="paw"
              onPress={goPublicarComoEncontrada}
              style={styles.actionButton}
            />
          </View>
        ) : null}

        <Button
          title="Publicarla como encontrada"
          variant="ghost"
          onPress={goPublicarComoEncontrada}
          style={styles.actionButton}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  intro: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  pageTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  pageSubtitle: {
    marginBottom: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  helper: {
    marginBottom: spacing.xs,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photoButton: {
    flex: 1,
  },
  preview: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  resultsSubtitle: {
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  centerText: {
    textAlign: 'center',
    marginTop: spacing.md,
  },
  actionButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});

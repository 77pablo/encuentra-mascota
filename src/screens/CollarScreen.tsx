import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { mascotaPorCollar, avisarEscaneoCollar, MascotaCollar } from '../services/myPets';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { notify } from '../lib/notify';
import { AppText, Button, Card, EmptyState, Input, Loading, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const especieLabel: Record<MascotaCollar['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Página pública del collar (accesible sin sesión, ruta /collar/:token).
// - Si la mascota está reportada perdida: tarjeta prominente + link al reporte
//   (que ya tiene el flujo de contacto).
// - Si no: página SOBRIA ("esta mascota tiene familia") + avisar que la vi.
//   NUNCA muestra contacto ni identidad del dueño.
export default function CollarScreen({ route, navigation }: any) {
  const token: string | undefined = route?.params?.token;
  const [mascota, setMascota] = useState<MascotaCollar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nota, setNota] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avisado, setAvisado] = useState(false);

  const cargar = useCallback(() => {
    if (!token) {
      setLoading(false);
      setMascota(null);
      return;
    }
    setLoading(true);
    setError(null);
    mascotaPorCollar(token)
      .then(setMascota)
      .catch((e: any) => setError(mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const usarUbicacion = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      notify('Sin permiso', 'No pasa nada: podés avisar igual, sin la ubicación.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    notify('Listo', 'Sumamos tu ubicación al aviso.');
  };

  const avisar = async () => {
    if (!token) return;
    setEnviando(true);
    try {
      await avisarEscaneoCollar(token, nota.trim() || null, coords?.lat ?? null, coords?.lng ?? null);
      setAvisado(true);
    } catch (e: any) {
      notify('No se pudo avisar', mensajeDeErrorDb(e));
    } finally {
      setEnviando(false);
    }
  };

  if (loading) return <Loading />;

  // Token inválido / inexistente: estado vacío amable, sin filtrar nada.
  if (error || !mascota) {
    return (
      <Screen padded>
        <EmptyState
          emoji="🔎"
          title="No encontramos esta placa"
          subtitle="Puede que el código esté gastado o ya no exista. Probá escanearlo de nuevo."
        />
      </Screen>
    );
  }

  const nombre = mascota.nombre;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {mascota.foto ? (
          <Image source={{ uri: mascota.foto }} style={styles.foto} />
        ) : (
          <View style={[styles.foto, styles.fotoPlaceholder]}>
            <AppText size={72}>🐾</AppText>
          </View>
        )}

        {mascota.reporte_perdida_id ? (
          // Está perdida: tarjeta prominente + link al reporte (contacto/afiche).
          <>
            <Card style={styles.lostCard}>
              <View style={styles.lostHeader}>
                <Ionicons name="alert-circle" size={26} color={colors.lost} />
                <Title size={22} style={styles.lostTitle}>
                  ¡{nombre} está perdida!
                </Title>
              </View>
              <AppText size={15} style={styles.lostText}>
                Su familia la está buscando. Si la viste o la tenés con vos, entrá al reporte para
                avisarles: ahí está cómo contactarlos.
              </AppText>
            </Card>
            <Button
              title="Ver el reporte y contactar"
              icon="arrow-forward"
              onPress={() => navigation.navigate('MascotaPublica', { id: mascota.reporte_perdida_id })}
              style={styles.cta}
            />
          </>
        ) : (
          // Sobria: tiene familia. Sin contacto, sin identidad del dueño.
          <>
            <Title size={24} align="center" style={styles.sobreTitle}>
              {nombre} tiene familia
            </Title>
            <AppText muted size={15} align="center" style={styles.sobreText}>
              {especieLabel[mascota.especie]} · No está reportada como perdida ahora mismo.
              Si la encontraste, avisale a su familia con un toque.
            </AppText>

            {avisado ? (
              <Card style={styles.okCard}>
                <View style={styles.okRow}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.found} />
                  <AppText weight="semi" size={16} style={styles.okText}>
                    Listo, avisamos a la familia.
                  </AppText>
                </View>
                <AppText muted size={13}>
                  Gracias por parar y ayudar. Eso hace toda la diferencia.
                </AppText>
              </Card>
            ) : (
              <Card style={styles.avisoCard}>
                <Input
                  label="Nota (opcional)"
                  placeholder="Ej: la vi en la plaza, está bien"
                  value={nota}
                  onChangeText={setNota}
                  multiline
                />
                <Button
                  title={coords ? 'Ubicación agregada' : 'Usar mi ubicación'}
                  icon={coords ? 'checkmark' : 'location'}
                  variant="secondary"
                  onPress={usarUbicacion}
                  style={styles.locButton}
                />
                <Button
                  title="Avisar que la vi"
                  icon="paw"
                  onPress={avisar}
                  loading={enviando}
                  disabled={enviando}
                  style={styles.cta}
                />
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md },
  foto: { width: '100%', height: 260, borderRadius: radius.md, backgroundColor: colors.sky },
  fotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  lostCard: { backgroundColor: '#FDECE6', gap: spacing.sm },
  lostHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lostTitle: { flexShrink: 1, color: colors.lost },
  lostText: { lineHeight: 22 },
  sobreTitle: { marginTop: spacing.sm },
  sobreText: { marginTop: spacing.xs, lineHeight: 22 },
  avisoCard: { gap: spacing.sm, marginTop: spacing.sm },
  locButton: { alignSelf: 'stretch' },
  cta: { alignSelf: 'stretch', marginTop: spacing.sm },
  okCard: { backgroundColor: colors.sky, gap: spacing.xs, marginTop: spacing.sm },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  okText: { flexShrink: 1 },
});

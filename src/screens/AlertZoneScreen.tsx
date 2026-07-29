import React, { useCallback, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { useAuth } from '../hooks/useAuth';
import { useMyLocation } from '../hooks/useMyLocation';
import { AlertZone, getMyZone, upsertMyZone } from '../services/alertZones';
import { notify } from '../lib/notify';
import { AppText, Button, Card, Chip, Loading, Screen, Title } from '../ui';
import { Colors, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Radios disponibles para la zona de alerta.
const RADIOS = [2, 5, 10] as const;
type Radio = (typeof RADIOS)[number];

export default function AlertZoneScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { user } = useAuth();
  const location = useMyLocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activo, setActivo] = useState(true);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radioKm, setRadioKm] = useState<Radio>(5);
  const [savedZone, setSavedZone] = useState<AlertZone | null>(null);
  // "No pudimos leer tu zona" NO es lo mismo que "todavía no tenés zona", y
  // confundirlas cuesta datos: si la lectura falla en silencio, la pantalla
  // queda con los valores por defecto (5 km, activa) haciéndose pasar por tu
  // configuración, y el primer "Guardar" los escribe ENCIMA de la zona real.
  // Es la misma forma del bug que ya tuvimos en el perfil, donde un perfil
  // degradado indistinguible de uno vacío guardaba '' sobre el teléfono.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setErrorCarga(null);
    getMyZone(user.id)
      .then((z) => {
        setSavedZone(z);
        if (z) {
          setActivo(z.activo);
          setRadioKm((RADIOS.includes(z.radio_km as Radio) ? z.radio_km : 5) as Radio);
          if (z.lat !== null && z.lng !== null) setCenter({ lat: z.lat, lng: z.lng });
        }
      })
      .catch((e: any) => {
        console.error('No se pudo leer la zona de alerta:', e?.message ?? e);
        setErrorCarga(mensajeDeErrorDb(e));
      })
      .finally(() => setLoading(false));
  }, [user]);

  // Cargamos la zona guardada UNA sola vez (al montar / cuando hay sesión), no
  // en cada focus: si no, al volver a la pantalla se pisaría un centro recién
  // elegido con "Usar mi ubicación" que todavía no se guardó.
  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const usarMiUbicacion = async () => {
    await location.request();
  };

  // Cuando llega la ubicación, la fijamos como centro de la zona.
  React.useEffect(() => {
    if (location.coords) setCenter(location.coords);
  }, [location.coords]);

  const guardar = async () => {
    if (!user) return;
    if (!center) {
      notify('Falta el centro', 'Primero fija el centro con tu ubicación actual.');
      return;
    }
    setSaving(true);
    try {
      const zona = await upsertMyZone(user.id, {
        lat: center.lat,
        lng: center.lng,
        radio_km: radioKm,
        activo,
      });
      setSavedZone(zona);
      // TODO(push): cuando EAS esté configurado, aquí se puede registrar la zona
      // en el backend para enviar notificaciones push reales. Por ahora el aviso
      // es solo in-app (ver ZoneAlertBanner).
      notify('Listo', 'Tu zona de alerta quedó guardada.');
    } catch (e: any) {
      notify('Error', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  // Si no se pudo leer, se dice y se ofrece reintentar. NO se muestra el
  // formulario: con los valores por defecto puestos parecería que esa es tu
  // configuración, y guardar la pisaría.
  if (errorCarga) {
    return (
      <Screen padded>
        <View style={styles.errorCarga}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Title size={18}>No pudimos leer tu zona</Title>
          <AppText muted size={14} style={styles.errorCargaTexto}>
            {errorCarga}
          </AppText>
          <AppText muted size={13} style={styles.errorCargaTexto}>
            No la tocamos: sigue guardada tal como la dejaste.
          </AppText>
          <Button title="Reintentar" onPress={cargar} />
        </View>
      </Screen>
    );
  }

  const tieneCentro = !!center;
  const centroGuardado =
    savedZone && savedZone.lat !== null && savedZone.lng !== null
      ? { lat: savedZone.lat, lng: savedZone.lng }
      : null;

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <AppText muted size={14}>
            Elige un punto y un radio, y te avisamos dentro de la app cuando aparezcan
            reportes nuevos por esa zona.
          </AppText>
        </View>

        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <AppText weight="bold" size={15}>
                Alertas activas
              </AppText>
              <AppText muted size={12}>
                {activo ? 'Recibirás avisos de tu zona.' : 'Las alertas están en pausa.'}
              </AppText>
            </View>
            <Switch
              value={activo}
              onValueChange={setActivo}
              trackColor={{ false: colors.line, true: colors.brand }}
              thumbColor={colors.white}
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <AppText weight="bold" size={15}>
            Centro de la zona
          </AppText>
          <View style={styles.centerRow}>
            <Ionicons
              name={tieneCentro ? 'location' : 'location-outline'}
              size={18}
              color={tieneCentro ? colors.brand : colors.muted}
            />
            <AppText size={13} color={tieneCentro ? colors.ink : colors.muted} style={styles.centerText}>
              {tieneCentro
                ? `Fijado en ${center!.lat.toFixed(3)}, ${center!.lng.toFixed(3)}`
                : 'Aún no has fijado el centro.'}
            </AppText>
          </View>
          <Button
            title={tieneCentro ? 'Actualizar con mi ubicación' : 'Usar mi ubicación actual'}
            variant="secondary"
            icon="navigate"
            loading={location.status === 'loading'}
            onPress={usarMiUbicacion}
            style={styles.centerButton}
          />
          {location.status === 'denied' ? (
            <AppText size={12} color={colors.lost}>
              No pudimos acceder a tu ubicación. Activa el permiso para fijar la zona.
            </AppText>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <AppText weight="bold" size={15}>
            Radio
          </AppText>
          <View style={styles.chipsRow}>
            {RADIOS.map((r) => (
              <Chip
                key={r}
                label={`${r} km`}
                active={radioKm === r}
                onPress={() => setRadioKm(r)}
              />
            ))}
          </View>
        </Card>

        <Button
          title="Guardar zona"
          icon="checkmark"
          onPress={guardar}
          loading={saving}
          disabled={saving}
          style={styles.saveButton}
        />

        {savedZone ? (
          <Card style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Ionicons name="notifications-outline" size={18} color={colors.brand} />
              <AppText weight="bold" size={14} style={styles.summaryTitle}>
                Tu zona actual
              </AppText>
            </View>
            <AppText muted size={13}>
              {savedZone.activo ? 'Activa' : 'En pausa'} · radio de {savedZone.radio_km} km
              {centroGuardado ? ' · centro fijado' : ' · sin centro'}
            </AppText>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  errorCarga: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  errorCargaTexto: {
    textAlign: 'center',
  },
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  intro: {
    marginBottom: spacing.xs,
  },
  card: {
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  centerText: {
    flex: 1,
  },
  centerButton: {
    marginTop: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.xs,
  },
  summaryCard: {
    gap: spacing.xs,
    backgroundColor: colors.sky,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryTitle: {
    marginLeft: spacing.sm,
  },
});

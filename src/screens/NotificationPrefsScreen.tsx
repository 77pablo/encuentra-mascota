import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Prefs } from '../lib/notifyTargets';
import { getMisPrefs, guardarMisPrefs } from '../services/notificationPrefs';
import { notify } from '../lib/notify';
import { AppText, Card, ErrorState, Loading, Screen, Title } from '../ui';
import { Colors, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Los seis interruptores de la pantalla, agrupados por bloque. La clave es la
// misma que en `Prefs`, así el guardado es directo.
type ClavePref = keyof Omit<Prefs, 'userId'>;

interface Interruptor {
  clave: ClavePref;
  titulo: string;
  ayuda: string;
  icono: keyof typeof Ionicons.glyphMap;
}

const TIPOS: Interruptor[] = [
  {
    clave: 'zona',
    titulo: 'Reportes en mi zona',
    ayuda: 'Cuando se pierda una mascota cerca de tu zona.',
    icono: 'location-outline',
  },
  {
    clave: 'avistamientos',
    titulo: 'Avistamientos',
    ayuda: 'Cuando alguien avise que vio a tu mascota.',
    icono: 'eye-outline',
  },
  {
    clave: 'pistas',
    titulo: 'Pistas del barrio',
    ayuda: 'Cuando el vecindario deje un dato en tu reporte.',
    icono: 'chatbubble-ellipses-outline',
  },
  {
    clave: 'coincidencias',
    titulo: 'Posibles coincidencias',
    ayuda: 'Cuando aparezca un reporte que se parece al tuyo.',
    icono: 'sparkles-outline',
  },
];

const CANALES: Interruptor[] = [
  {
    clave: 'canalEmail',
    titulo: 'Correo',
    ayuda: 'Te llega un mail a la dirección de tu cuenta.',
    icono: 'mail-outline',
  },
  {
    clave: 'canalPush',
    titulo: 'Notificación al teléfono',
    ayuda: 'Te suena el celular apenas pasa algo.',
    icono: 'phone-portrait-outline',
  },
];

export default function NotificationPrefsScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [guardando, setGuardando] = useState<ClavePref | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(false);
    getMisPrefs()
      .then(setPrefs)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Guardado optimista: movemos el interruptor de inmediato y, si el guardado
  // falla, lo devolvemos a donde estaba y avisamos. Se siente más rápido y no
  // miente: si no se guardó, la persona se entera.
  const alternar = async (clave: ClavePref) => {
    if (!prefs || guardando) return;
    const anterior = prefs[clave];
    const nuevo = !anterior;
    setPrefs({ ...prefs, [clave]: nuevo });
    setGuardando(clave);
    try {
      await guardarMisPrefs({ [clave]: nuevo });
    } catch {
      setPrefs((p) => (p ? { ...p, [clave]: anterior } : p));
      // A propósito no mostramos el error crudo de la base: no le sirve a nadie
      // leer jerga de Postgres. Dejamos el interruptor como estaba y lo decimos
      // en criollo.
      notify('No se pudo guardar', 'No pudimos guardar el cambio. Probá de nuevo en un momento.');
    } finally {
      setGuardando(null);
    }
  };

  if (loading) return <Loading />;
  if (error || !prefs) return <ErrorState message="No pudimos cargar tus avisos." onRetry={cargar} />;

  const fila = (item: Interruptor, ultimo: boolean) => (
    <View key={item.clave} style={[styles.switchRow, ultimo ? null : styles.switchRowBorde]}>
      <Ionicons name={item.icono} size={20} color={colors.brand} />
      <View style={styles.switchText}>
        <AppText weight="bold" size={15}>
          {item.titulo}
        </AppText>
        <AppText muted size={12}>
          {item.ayuda}
        </AppText>
      </View>
      <Switch
        value={prefs[item.clave]}
        onValueChange={() => alternar(item.clave)}
        disabled={guardando !== null}
        trackColor={{ false: colors.line, true: colors.brand }}
        thumbColor={colors.white}
      />
    </View>
  );

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText muted size={14}>
          Elegí qué te avisamos y por dónde. Podés cambiarlo cuando quieras.
        </AppText>

        <Title size={16} style={styles.sectionTitle}>
          Qué quiero que me avisen
        </Title>
        <Card style={styles.card}>{TIPOS.map((i, idx) => fila(i, idx === TIPOS.length - 1))}</Card>

        <Title size={16} style={styles.sectionTitle}>
          Por dónde
        </Title>
        <Card style={styles.card}>{CANALES.map((i, idx) => fila(i, idx === CANALES.length - 1))}</Card>

        <View style={styles.notaRow}>
          <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
          <AppText muted size={12} style={styles.notaTexto}>
            El push llega solo en la app instalada en tu teléfono.
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionTitle: {
    marginTop: spacing.xs,
    marginBottom: -spacing.xs,
  },
  card: {
    gap: 0,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  switchRowBorde: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  notaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  notaTexto: {
    flex: 1,
  },
});

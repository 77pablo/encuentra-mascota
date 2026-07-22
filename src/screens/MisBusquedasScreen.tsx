import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { BusquedaGuardada, borrarBusqueda, listBusquedas } from '../services/busquedasGuardadas';
import { AppText, Card, EmptyState, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

const especieLabel: Record<'perro' | 'gato' | 'otro', string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Otra especie',
};

// "Mis búsquedas" (Función 2): lista de búsquedas guardadas ("avisame si
// aparece un gato en Ñuñoa") con borrado. Se guarda desde `ExplorarScreen`
// (botón "Avisarme de esta búsqueda"); el aviso en sí lo encola el trigger de
// la 0031 cuando alguien publica un reporte que calza.
export default function MisBusquedasScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [busquedas, setBusquedas] = useState<BusquedaGuardada[]>([]);
  const [loading, setLoading] = useState(true);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    listBusquedas()
      .then(setBusquedas)
      .catch((e) => notify('No se pudo cargar', mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(cargar);

  const borrar = async (b: BusquedaGuardada) => {
    const ok = await confirmAction(
      '¿Borrar esta búsqueda?',
      'Dejarás de recibir avisos de reportes que calcen con ella.',
    );
    if (!ok) return;
    setBorrandoId(b.id);
    try {
      await borrarBusqueda(b.id);
      setBusquedas((prev) => prev.filter((x) => x.id !== b.id));
      notify('Borrada', 'La búsqueda se eliminó.');
    } catch (e: any) {
      notify('No se pudo borrar', mensajeDeErrorDb(e));
    } finally {
      setBorrandoId(null);
    }
  };

  if (loading) return <Loading />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          Mis búsquedas
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Te avisamos apenas alguien publique un reporte que calce con alguna de estas.
        </AppText>

        {busquedas.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration
              title="Todavía no guardaste ninguna búsqueda"
              subtitle="Guardá una búsqueda desde Explorar (filtrá por comuna y tocá «Avisarme de esta búsqueda»)."
            />
          </View>
        ) : (
          <View style={styles.list}>
            {busquedas.map((b) => (
              <Card key={b.id} style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.textWrap}>
                    <AppText weight="bold" size={15}>
                      {b.tipo === 'perdida' ? '🔴 Perdida' : '🟢 Encontrada'} ·{' '}
                      {b.especie ? especieLabel[b.especie] : 'Cualquier especie'} · {b.comuna}
                    </AppText>
                  </View>
                  <TouchableOpacity
                    accessibilityLabel="Borrar búsqueda"
                    onPress={() => borrar(b)}
                    disabled={borrandoId === b.id}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.lost} />
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
    pageTitle: { marginBottom: spacing.xs },
    pageSubtitle: { marginBottom: spacing.sm },
    emptyWrap: { paddingVertical: spacing.xxxl },
    list: { gap: spacing.sm },
    card: { paddingVertical: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    textWrap: { flex: 1 },
    iconBtn: { padding: spacing.xs, borderRadius: radius.pill },
  });

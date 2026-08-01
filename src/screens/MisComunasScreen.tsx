import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { useAuth } from '../hooks/useAuth';
import { dejarDeSeguirComuna, getComunasSeguidas } from '../services/comunasSeguidas';
import { AppText, Button, Card, EmptyState, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// MIS COMUNAS — el otro lado del botón "Avisarme de esta comuna".
//
// Seguir una comuna se podía hacer desde un solo lugar (el panel de filtros de
// Explorar, que arranca colapsado) y no se podía deshacer desde ningún lado:
// no existía ninguna pantalla que mostrara qué comunas seguís, aunque cada una
// te genere avisos. Esta es esa pantalla, con el mismo patrón que "Mis
// búsquedas": lista, borrado con confirmación y un estado de error que NO se
// confunde con "no seguís ninguna".
//
// Además dice lo que hasta ahora no estaba dicho en ningún lado: estos avisos
// se saltean el interruptor "Reportes en mi zona" de la pantalla de Avisos
// (ver `resolverDestinatarios` en src/lib/notifyTargets.ts, donde los
// seguidores de comuna no pasan por `quiereEsteTipo`). Es a propósito —seguir
// una comuna es decir que sí explícitamente— pero si no se dice, la persona
// apaga el interruptor general, le siguen llegando avisos y no entiende nada.

export default function MisComunasScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const { user } = useAuth();
  const [comunas, setComunas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!user) {
      setComunas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorCarga(null);
    getComunasSeguidas(user.id)
      .then((cs) => {
        setComunas(cs);
        setErrorCarga(null);
      })
      .catch((e: any) => {
        // "No pudimos leerlas" no puede verse igual que "no seguís ninguna":
        // con la lista vacía por un fallo de red, la persona creería que ya no
        // sigue nada y no entendería por qué le siguen llegando avisos.
        console.error('No se pudieron leer las comunas seguidas:', e?.message ?? e);
        setErrorCarga(mensajeDeErrorDb(e));
      })
      .finally(() => setLoading(false));
  }, [user]);

  useFocusEffect(cargar);

  const quitar = async (comuna: string) => {
    if (!user) return;
    const ok = await confirmAction(
      `¿Dejar de seguir ${comuna}?`,
      'Vas a dejar de recibir avisos de los reportes nuevos de esa comuna.',
    );
    if (!ok) return;
    setQuitando(comuna);
    try {
      await dejarDeSeguirComuna(user.id, comuna);
      // Recién ACÁ se saca de la lista. Si se sacara antes (optimista) y el
      // guardado fallara, la pantalla diría que ya no la seguís mientras los
      // avisos siguen llegando.
      setComunas((prev) => prev.filter((c) => c !== comuna));
      notify('Listo', `Dejaste de seguir ${comuna}.`);
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setQuitando(null);
    }
  };

  if (loading) return <Loading />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          Mis comunas
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Te avisamos cuando alguien publique un reporte nuevo en estas comunas.
        </AppText>

        {errorCarga ? (
          <Card style={styles.errorCard}>
            <View style={styles.errorHeader}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.muted} />
              <AppText weight="bold" size={15} style={styles.errorTitulo}>
                No pudimos leer tus comunas
              </AppText>
            </View>
            <AppText muted size={13}>
              {errorCarga}
            </AppText>
            <AppText muted size={13}>
              No las tocamos: siguen guardadas tal como estaban.
            </AppText>
            <Button title="Reintentar" variant="secondary" onPress={cargar} style={styles.errorBoton} />
          </Card>
        ) : (
          <>
            {/* A19: dicho con todas las letras, acá, que es donde se puede
                hacer algo al respecto. */}
            <Card style={styles.avisoCard}>
              <View style={styles.avisoHeader}>
                <Ionicons name="notifications-outline" size={18} color={colors.brand} />
                <AppText weight="bold" size={15} style={styles.avisoTitulo}>
                  Estos avisos llegan igual
                </AppText>
              </View>
              <AppText muted size={13} style={styles.avisoTexto}>
                Los reportes nuevos de las comunas que seguís te llegan aunque tengas apagado
                «Reportes en mi zona» en Avisos: seguir una comuna es decir que sí a propósito, y
                no lo pisamos con el interruptor general.
              </AppText>
              <AppText muted size={13} style={styles.avisoTexto}>
                Para cortarlos, la forma es dejar de seguir la comuna acá.
              </AppText>
            </Card>

            {comunas.length === 0 ? (
              <View style={styles.emptyWrap}>
                <EmptyState
                  illustration
                  title="Todavía no seguís ninguna comuna"
                  subtitle="Podés seguir una desde Explorar: abrí los filtros, elegí la comuna y tocá «Avisarme de esa comuna»."
                />
              </View>
            ) : (
              <View style={styles.list}>
                {comunas.map((c) => (
                  <Card key={c} style={styles.card}>
                    <View style={styles.row}>
                      <Ionicons name="location-outline" size={18} color={colors.brand} />
                      <AppText weight="bold" size={15} style={styles.nombre}>
                        {c}
                      </AppText>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Dejar de seguir ${c}`}
                        onPress={() => quitar(c)}
                        disabled={quitando === c}
                        style={styles.iconBtn}
                      >
                        <Ionicons name="close-circle-outline" size={22} color={colors.lost} />
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
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
    avisoCard: { gap: spacing.xs, backgroundColor: colors.sky },
    avisoHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avisoTitulo: { flexShrink: 1 },
    avisoTexto: { lineHeight: 19 },
    errorCard: { gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
    errorHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    errorTitulo: { flexShrink: 1 },
    errorBoton: { marginTop: spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.lg },
    emptyWrap: { paddingVertical: spacing.xxl },
    list: { gap: spacing.sm },
    card: { paddingVertical: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    nombre: { flex: 1 },
    iconBtn: { padding: spacing.xs, borderRadius: radius.pill },
  });

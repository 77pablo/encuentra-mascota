import React, { useCallback, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { useAuth } from '../hooks/useAuth';
import { Adoption, listMyAdoptions, renovarAdopcion } from '../services/adoptions';
import { AppText, Button, Card, EmptyState, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { DIAS_VIGENCIA_ADOPCION, enPausa } from '../lib/cicloVidaAdopcion';
import { notify } from '../lib/notify';

// MIS PUBLICACIONES DE ADOPCIÓN.
//
// `listMyAdoptions` vivía en el servicio con CERO llamadores: se podía publicar
// un animal en adopción y después no había ninguna pantalla donde ver lo tuyo,
// saber si seguía visible, o llegar a editarlo sin buscarlo en el feed. Para
// reportes eso existe desde siempre ("Mis reportes" en el Perfil); adopción
// nació coja de ese lado.
//
// El estado de error va separado del vacío a propósito. Es la cuarta pantalla
// donde hace falta decirlo, porque nos equivocamos tres veces: si un fallo de
// red se muestra como "todavía no publicaste nada", la persona cree que su
// publicación se borró.

const especieLabel: Record<Adoption['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

export default function MisAdopcionesScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [adopciones, setAdopciones] = useState<Adoption[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [reactivando, setReactivando] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!user) {
      setAdopciones([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorCarga(null);
    listMyAdoptions(user.id)
      .then((as) => {
        setAdopciones(as);
        setErrorCarga(null);
      })
      .catch((e: any) => {
        console.error('No se pudieron leer las publicaciones de adopción:', e?.message ?? e);
        setErrorCarga(mensajeDeErrorDb(e));
      })
      .finally(() => setLoading(false));
  }, [user]);

  useFocusEffect(cargar);

  // CICLO DE VIDA (0052). Se relee la lista a propósito en vez de parchear la
  // fila en memoria: si no, la etiqueta "EN PAUSA" se queda pegada y la persona
  // vuelve a tocar el botón creyendo que no funcionó.
  const reactivar = async (id: string) => {
    setReactivando(id);
    try {
      await renovarAdopcion(id);
      cargar();
    } catch (e: any) {
      // Se avisa y NO se toca la etiqueta: fingir que volvió es peor que el
      // error, porque nadie iría a mirar de nuevo.
      notify('No se pudo reactivar', mensajeDeErrorDb(e));
    } finally {
      setReactivando(null);
    }
  };

  if (loading) return <Loading />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          Mis publicaciones
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Los animales que publicaste en adopción.
        </AppText>

        {errorCarga ? (
          <Card style={styles.errorCard}>
            <View style={styles.errorHeader}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.muted} />
              <AppText weight="bold" size={15} style={styles.errorTitulo}>
                No pudimos leer tus publicaciones
              </AppText>
            </View>
            <AppText muted size={13}>
              {errorCarga}
            </AppText>
            <AppText muted size={13}>
              No las tocamos: siguen publicadas tal como estaban.
            </AppText>
            <Button title="Reintentar" variant="secondary" onPress={cargar} style={styles.errorBoton} />
          </Card>
        ) : adopciones.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration
              title="Todavía no publicaste ninguna"
              subtitle="Si tenés un animal buscando hogar, podés publicarlo y el barrio lo va a ver."
              action={
                <Button
                  title="Publicar en adopción"
                  variant="secondary"
                  icon="add"
                  // Anidado y no `navigate('PublicarAdopcion')` pelado: esta
                  // pantalla vive en el stack del PERFIL y esa otra en el de la
                  // pestaña Adopción. `navigate` burbujea hacia ARRIBA, nunca
                  // hacia los descendientes de otra rama, así que el nombre
                  // pelado sería un botón muerto. Es el bug que ya apareció
                  // seis veces en este repo.
                  // (`AdopcionDetail`, en cambio, vive en el stack RAÍZ y sí se
                  // alcanza por nombre pelado desde acá.)
                  onPress={() => navigation.navigate('Adopcion', { screen: 'PublicarAdopcion' })}
                />
              }
            />
          </View>
        ) : (
          <View style={styles.list}>
            {adopciones.map((a) => {
              const adoptada = !!a.adoptada_en;
              const dormida = enPausa(a);
              return (
                <TouchableOpacity
                  key={a.id}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ${a.nombre ?? especieLabel[a.especie]}`}
                  onPress={() => navigation.navigate('AdopcionDetail', { id: a.id })}
                >
                  <Card style={styles.card}>
                    <View style={styles.row}>
                      {a.fotos?.[0] ? (
                        <Image source={{ uri: a.fotos[0] }} style={styles.foto} />
                      ) : (
                        <View style={[styles.foto, styles.fotoVacia]}>
                          <Ionicons name="paw" size={20} color={colors.muted} />
                        </View>
                      )}
                      <View style={styles.info}>
                        <AppText weight="bold" size={15}>
                          {a.nombre?.trim() || especieLabel[a.especie]}
                        </AppText>
                        <View style={styles.etiquetas}>
                          {adoptada ? (
                            <View style={[styles.etiqueta, styles.etiquetaFeliz]}>
                              <AppText size={11} weight="bold" style={styles.etiquetaTextoFeliz}>
                                ENCONTRÓ FAMILIA
                              </AppText>
                            </View>
                          ) : null}
                          {/* Si no se dice, una publicación oculta parece
                              borrada: no está en el feed y nada la explica. */}
                          {a.oculto ? (
                            <View style={[styles.etiqueta, styles.etiquetaOculta]}>
                              <AppText size={11} weight="bold" style={styles.etiquetaTexto}>
                                OCULTA
                              </AppText>
                            </View>
                          ) : null}
                          {/* Igual que "OCULTA": una publicación que salió del
                              listado y no lo dice parece borrada. */}
                          {dormida ? (
                            <View style={[styles.etiqueta, styles.etiquetaPausa]}>
                              <AppText size={11} weight="bold" style={styles.etiquetaTexto}>
                                EN PAUSA
                              </AppText>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    </View>

                    {dormida ? (
                      <View style={styles.pausaWrap}>
                        <AppText muted size={13}>
                          Pasaron {DIAS_VIGENCIA_ADOPCION} días sin novedades, así que dejó de
                          aparecer en el listado: por ahora no la están viendo. Si todavía busca
                          familia, la traés de vuelta con un toque.
                        </AppText>
                        <Button
                          title="Reactivar"
                          variant="secondary"
                          loading={reactivando === a.id}
                          disabled={reactivando === a.id}
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            reactivar(a.id);
                          }}
                          style={styles.pausaBoton}
                        />
                      </View>
                    ) : null}
                  </Card>
                </TouchableOpacity>
              );
            })}
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
    errorCard: { gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
    errorHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    errorTitulo: { flexShrink: 1 },
    errorBoton: { marginTop: spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.lg },
    emptyWrap: { paddingVertical: spacing.xxl },
    list: { gap: spacing.sm },
    card: { paddingVertical: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    foto: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.line },
    fotoVacia: { alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, gap: spacing.xs },
    etiquetas: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
    etiqueta: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      backgroundColor: colors.line,
    },
    etiquetaFeliz: { backgroundColor: colors.sky },
    etiquetaOculta: { backgroundColor: colors.line },
    etiquetaPausa: { backgroundColor: colors.line },
    pausaWrap: { gap: spacing.sm, marginTop: spacing.md },
    pausaBoton: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg },
    etiquetaTexto: { color: colors.muted },
    etiquetaTextoFeliz: { color: colors.found },
  });

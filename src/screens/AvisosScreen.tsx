import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { esMigracionSinAplicar, mensajeDeErrorDb } from '../lib/dbErrors';
import { textoDeAviso, type Aviso } from '../lib/avisosBandeja';
import { marcarAvisosLeidos } from '../lib/visitaAvisos';
import { misAvisos } from '../services/avisos';
import { timeAgo } from '../lib/time';
import FotoAvisoAnonimo from '../components/FotoAvisoAnonimo';
import { AppText, AvisoEstafa, Button, Card, EmptyState, Loading, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// LA BANDEJA DE AVISOS, DENTRO DE LA APP (migración 0051).
//
// Hasta ahora un aviso solo existía si salía por correo o por push. Los dos
// pueden fallar —y el correo está fallando ahora mismo, por la activación de
// Brevo—, y cuando fallan el aviso se pierde sin que nadie se entere. Acá se ve
// lo que la app tenía para decir aunque no haya salido nada.
//
// LO QUE MÁS IMPORTA DE ESTA PANTALLA no es la lista: es que "no pudimos leer"
// se vea DISTINTO de "no tenés avisos". Es la quinta vez que hace falta esta
// distinción en el repo. Si un corte de red se lee como un vacío, la persona
// concluye que no pasó nada — y justo acá "no pasó nada" es lo contrario de lo
// que puede haber pasado.
//
// LIMITACIÓN HONESTA: la bandeja muestra los avisos DIRIGIDOS (escaneo de
// collar, búsqueda guardada) y los de tus reportes (avistamiento, pista,
// coincidencia). Los de "reporte nuevo en tu zona" se resuelven por zona GPS en
// el dispatcher y no están en la fila, así que NO están acá. Por eso el texto de
// la pantalla nunca dice "todos tus avisos".
export default function AvisosScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "Todavía no está disponible" (migración sin aplicar) no es lo mismo que "se
  // cayó la red": el primero se arregla solo cuando corran el SQL, el segundo lo
  // puede reintentar la persona. Los dos llevan reintento igual.
  const [faltaMigracion, setFaltaMigracion] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    setFaltaMigracion(false);
    misAvisos()
      .then((lista) => {
        setAvisos(lista);
        setError(null);
        // Se marca hasta el aviso MÁS NUEVO que efectivamente se mostró, no
        // hasta "ahora": si llega uno mientras la pantalla está abierta, no
        // queda marcado como visto sin haberse visto. Con la bandeja vacía no se
        // toca la marca (adelantarla taparía avisos viejos sin ver).
        if (lista.length > 0) {
          const masNuevo = lista.reduce(
            (a, b) => (Date.parse(b.creado_en) > Date.parse(a.creado_en) ? b : a),
            lista[0],
          );
          marcarAvisosLeidos(masNuevo.creado_en);
        }
      })
      .catch((e: any) => {
        console.warn('No se pudieron leer los avisos:', e?.message ?? e);
        setFaltaMigracion(esMigracionSinAplicar(e));
        setError(mensajeDeErrorDb(e));
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(cargar);

  const abrir = (a: Aviso) => {
    // Los escaneos de collar no tienen reporte (`pet_id` null, ver 0027):
    // navegar igual abriría una ficha rota.
    if (!a.pet_id) return;
    navigation.navigate('PetDetail', { id: a.pet_id });
  };

  if (loading) return <Loading />;

  if (error) {
    return (
      <Screen padded>
        <View style={styles.errorCarga}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Title size={18} align="center">
            No pudimos leer tus avisos
          </Title>
          <AppText muted size={14} style={styles.centrado}>
            {faltaMigracion
              ? 'Esta pantalla todavía no está disponible. Estamos terminando de habilitarla.'
              : error}
          </AppText>
          <AppText muted size={13} style={styles.centrado}>
            No se perdió ninguno: siguen guardados y te los mostramos apenas podamos.
          </AppText>
          <Button title="Reintentar" onPress={cargar} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={24} style={styles.pageTitle}>
          Tus avisos
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Lo que pasó con tus reportes y con tus mascotas. Acá lo ves aunque no te haya llegado el
          correo.
        </AppText>

        {avisos.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration
              title="Todavía no te llegó ningún aviso"
              subtitle="Cuando alguien vea a tu mascota, deje una pista o escanee su placa, aparece acá."
            />
          </View>
        ) : (
          <View style={styles.list}>
            {avisos.map((a) => {
              const t = textoDeAviso(a);
              const navegable = !!a.pet_id;
              return (
                <TouchableOpacity
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={t.titulo}
                  activeOpacity={navegable ? 0.7 : 1}
                  onPress={() => abrir(a)}
                >
                  <Card style={styles.card}>
                    <View style={styles.row}>
                      <Ionicons name={t.icono as any} size={20} color={colors.brand} />
                      <View style={styles.textWrap}>
                        <AppText weight="bold" size={15}>
                          {t.titulo}
                        </AppText>
                        {t.detalle ? (
                          <AppText muted size={13} style={styles.detalle}>
                            {t.detalle}
                          </AppText>
                        ) : null}
                        {/* Texto escrito por alguien SIN CUENTA (0050). Es el
                            único que llega a la app sin ninguna identidad
                            detrás, así que se dice de dónde salió y se le pone
                            el mismo aviso antiestafa que ya usan el chat y la
                            ficha. Sin esto se leía igual que un aviso nuestro:
                            "Tenés una novedad · «la tengo, transferime»". */}
                        {t.deDesconocido ? (
                          <>
                            <AppText muted size={12} style={styles.deQuien}>
                              Lo escribió alguien sin cuenta, desde el link público.
                            </AppText>
                            {/* Variante "chat": es el caso más cercano —alguien
                                te escribe diciendo que la tiene—, solo que acá
                                ni siquiera hay una cuenta detrás. */}
                            <AvisoEstafa variante="chat" />
                          </>
                        ) : null}
                        {/* La foto que adjuntó quien avisó (D5, sobre el
                            bucket privado de la 0062). Solo se dibuja acá,
                            en la bandeja del DUEÑO: nunca sale al mapa ni a
                            la ficha pública. */}
                        {t.fotoPath ? <FotoAvisoAnonimo path={t.fotoPath} /> : null}
                        <AppText muted size={12} style={styles.cuando}>
                          {timeAgo(a.creado_en)}
                        </AppText>
                      </View>
                      {navegable ? (
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                      ) : null}
                    </View>
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
    pageSubtitle: { marginBottom: spacing.sm, lineHeight: 20 },
    emptyWrap: { paddingVertical: spacing.xxxl },
    errorCarga: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    centrado: { textAlign: 'center' },
    list: { gap: spacing.sm },
    card: { paddingVertical: spacing.md, borderRadius: radius.md },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    textWrap: { flex: 1 },
    detalle: { marginTop: 2, lineHeight: 18 },
    deQuien: { marginTop: spacing.xs, fontStyle: 'italic' },
    cuando: { marginTop: spacing.xs },
  });

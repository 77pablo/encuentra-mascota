import React, { useCallback, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { bandeja, DenunciaPendiente, descartar, retirar, suspender } from '../services/moderacionAdmin';
import { AppText, Button, Card, EmptyState, Loading, Screen, Title } from '../ui';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// PANEL DE MODERACION — solo accesible desde la fila condicional en
// ProfileScreen (profile.es_admin). Toda la autorización real vive en el
// servidor (RPCs security definer, migración 0040): si alguien sin permiso
// llega a esta pantalla igual, `bandeja()` rechaza con "no autorizado".

const TIPO_LABEL: Record<string, string> = {
  reporte: 'Reporte de mascota',
  adopcion: 'Publicación de adopción',
  pista: 'Pista del barrio',
  avistamiento: 'Avistamiento',
  pregunta_adopcion: 'Pregunta de adopción',
  mensaje: 'Mensaje de chat',
  usuario: 'Usuario',
};

// El snapshot de `contenido` cambia de forma según `tipo` (ver 0040): esta
// función junta los distintos nombres de columna en un texto y una foto para
// no repetir el `switch` en el render de cada tarjeta.
function textoDe(contenido: Record<string, unknown> | null): string | null {
  if (!contenido) return null;
  const candidato =
    (contenido.texto as string | undefined) ??
    (contenido.pregunta as string | undefined) ??
    (contenido.nota as string | undefined) ??
    (contenido.descripcion as string | undefined) ??
    null;
  return candidato && candidato.trim() ? candidato.trim() : null;
}

function fotoDe(contenido: Record<string, unknown> | null): string | null {
  if (!contenido) return null;
  const fotos = contenido.fotos as string[] | undefined;
  if (Array.isArray(fotos) && fotos[0]) return fotos[0];
  if (typeof contenido.imagen_url === 'string' && contenido.imagen_url) return contenido.imagen_url;
  if (typeof contenido.foto === 'string' && contenido.foto) return contenido.foto;
  return null;
}

export default function ModeracionScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [denuncias, setDenuncias] = useState<DenunciaPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [actuandoId, setActuandoId] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    bandeja()
      .then(setDenuncias)
      .catch((e) => notify('No se pudo cargar', mensajeDeErrorDb(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(cargar);

  const conAccion = async (id: string, accion: () => Promise<void>, mensaje: string) => {
    setActuandoId(id);
    try {
      await accion();
      notify('Listo', mensaje);
      cargar();
    } catch (e: any) {
      notify('No se pudo completar', mensajeDeErrorDb(e));
    } finally {
      setActuandoId(null);
    }
  };

  const onRetirar = (d: DenunciaPendiente) =>
    conAccion(d.id, () => retirar(d.id), 'El contenido se retiró.');

  const onDescartar = (d: DenunciaPendiente) =>
    conAccion(d.id, () => descartar(d.id), 'La denuncia se descartó.');

  const onSuspender = async (d: DenunciaPendiente) => {
    if (!d.denunciadoId) {
      notify('No se puede suspender', 'Esta denuncia no tiene un usuario asociado.');
      return;
    }
    const ok = await confirmAction(
      `¿Suspender a ${d.denunciadoNombre ?? 'este usuario'}?`,
      'No va a poder publicar ni escribir mensajes hasta que levantes la suspensión.',
    );
    if (!ok) return;
    await conAccion(d.id, () => suspender(d.id), 'El usuario quedó suspendido.');
  };

  if (loading) return <Loading />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Title size={24} style={styles.pageTitle}>
          Moderación
        </Title>
        <AppText muted size={14} style={styles.pageSubtitle}>
          Denuncias pendientes de revisión, de más antigua a más nueva.
        </AppText>

        {denuncias.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState emoji="🙌" title="No hay denuncias pendientes" subtitle="Todo tranquilo por acá." />
          </View>
        ) : (
          <View style={styles.list}>
            {denuncias.map((d) => {
              const texto = textoDe(d.contenido);
              const foto = fotoDe(d.contenido);
              const actuando = actuandoId === d.id;
              return (
                <Card key={d.id} style={styles.card}>
                  <AppText weight="bold" size={15}>
                    {TIPO_LABEL[d.tipo] ?? d.tipo} · {d.motivo}
                  </AppText>
                  {d.detalle ? (
                    <AppText size={13} style={styles.detalle}>
                      “{d.detalle}”
                    </AppText>
                  ) : null}
                  <AppText muted size={12} style={styles.metaLine}>
                    Denuncia de {d.reporterNombre ?? 'alguien'}
                  </AppText>
                  {d.denunciadoNombre ? (
                    <AppText muted size={12} style={styles.metaLine}>
                      Contra {d.denunciadoNombre} · {d.denunciasContraDenunciado}{' '}
                      {d.denunciasContraDenunciado === 1 ? 'denuncia' : 'denuncias'}
                    </AppText>
                  ) : null}

                  {foto ? (
                    <Image source={{ uri: foto }} style={styles.preview} />
                  ) : texto ? (
                    <View style={styles.textoPreview}>
                      <AppText size={13} numberOfLines={4}>
                        {texto}
                      </AppText>
                    </View>
                  ) : null}

                  <View style={styles.accionesRow}>
                    <Button
                      title="Retirar"
                      variant="danger"
                      icon="trash-outline"
                      disabled={actuando}
                      loading={actuando}
                      onPress={() => onRetirar(d)}
                      style={styles.accionBoton}
                    />
                    <Button
                      title="Descartar"
                      variant="secondary"
                      icon="close-outline"
                      disabled={actuando}
                      onPress={() => onDescartar(d)}
                      style={styles.accionBoton}
                    />
                    <Button
                      title="Suspender"
                      variant="ghost"
                      icon="ban-outline"
                      disabled={actuando || !d.denunciadoId}
                      onPress={() => onSuspender(d)}
                      style={styles.accionBoton}
                    />
                  </View>
                </Card>
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
    emptyWrap: { paddingVertical: spacing.xxxl },
    list: { gap: spacing.md },
    card: { gap: spacing.xs },
    detalle: { fontStyle: 'italic', color: colors.muted },
    metaLine: { marginTop: 2 },
    textoPreview: {
      marginTop: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.sky,
    },
    preview: {
      marginTop: spacing.sm,
      width: '100%',
      height: 160,
      borderRadius: radius.md,
    },
    accionesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    accionBoton: {
      flex: 1,
      minWidth: 100,
      paddingHorizontal: spacing.sm,
    },
  });

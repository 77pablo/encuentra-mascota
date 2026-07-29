import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  capturarPromptInstalacion,
  esIos,
  estaInstalada,
  pedirInstalacion,
  puedeInstalar,
} from '../lib/instalarPwa';
import { getInstalarPwaDescartada, setInstalarPwaDescartada } from '../lib/instalarPwaDescarte';
import { AppText, Button, Card, Title } from '../ui';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

interface InstalarAppCardProps {
  // 'tarjeta': Inicio — descartable con ✕, recuerda la elección.
  // 'fila': Perfil — entrada fija, no se descarta (solo se oculta si ya está
  // instalada).
  variante?: 'tarjeta' | 'fila';
}

// Web-only a propósito (degrada a null en nativo, donde la app ya se instala
// desde la tienda): tarjeta/fila que ofrece instalar la PWA. En Android/Chrome
// dispara el prompt nativo; en iOS (que no tiene ese evento) abre un modal con
// los 2 pasos manuales.
export function InstalarAppCard({ variante = 'tarjeta' }: InstalarAppCardProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);

  const [instalada, setInstalada] = useState(() => estaInstalada());
  const [disponibleAndroid, setDisponibleAndroid] = useState(() => puedeInstalar());
  // En la tarjeta de Inicio empieza en null (aún no sabemos si fue
  // descartada) para no mostrarla un instante de más y luego ocultarla; en la
  // fila de Perfil no aplica descarte, así que arranca en false.
  const [descartada, setDescartada] = useState<boolean | null>(variante === 'tarjeta' ? null : false);
  const [modalIosVisible, setModalIosVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    capturarPromptInstalacion();
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    // Listener propio (además del que engancha capturarPromptInstalacion())
    // solo para poder reaccionar en la UI cuando el navegador ofrece el
    // prompt: el evento llega después del montaje, no antes.
    const onBeforeInstallPrompt = () => setDisponibleAndroid(true);
    const onAppInstalled = () => setInstalada(true);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener?.('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener?.('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (variante !== 'tarjeta' || Platform.OS !== 'web') return;
    let vigente = true;
    getInstalarPwaDescartada().then((v) => {
      if (vigente) setDescartada(v);
    });
    return () => {
      vigente = false;
    };
  }, [variante]);

  if (Platform.OS !== 'web') return null;
  if (instalada) return null;
  if (variante === 'tarjeta' && descartada !== false) return null; // null (cargando) o true (descartada)

  const esIosDevice = esIos();
  if (!esIosDevice && !disponibleAndroid) return null; // nada que ofrecer en este navegador

  const instalar = async () => {
    if (esIosDevice) {
      setModalIosVisible(true);
      return;
    }
    const resultado = await pedirInstalacion();
    if (resultado === 'aceptada') {
      setInstalada(true);
    } else if (resultado === 'rechazada' && variante === 'tarjeta') {
      // No insistir en cada visita a Inicio si ya dijo que no.
      setDescartada(true);
      setInstalarPwaDescartada().catch((e) => {
      // Si no se guarda el descarte, la tarjeta vuelve a aparecer en la próxima
      // visita: molesto pero visible, así que no se le avisa a la persona. En
      // el log sí queda: un catch mudo acá haría que "insiste aunque le dije
      // que no" pareciera un capricho de la interfaz.
      console.warn('No se pudo recordar que descartaste la instalación:', e?.message ?? e);
    });
    }
  };

  const descartar = () => {
    setDescartada(true);
    setInstalarPwaDescartada().catch((e) => {
      // Si no se guarda el descarte, la tarjeta vuelve a aparecer en la próxima
      // visita: molesto pero visible, así que no se le avisa a la persona. En
      // el log sí queda: un catch mudo acá haría que "insiste aunque le dije
      // que no" pareciera un capricho de la interfaz.
      console.warn('No se pudo recordar que descartaste la instalación:', e?.message ?? e);
    });
  };

  if (variante === 'fila') {
    return (
      <>
        <TouchableOpacity activeOpacity={0.85} onPress={instalar} style={styles.fila}>
          <View style={styles.filaIconWrap}>
            <Ionicons name="download-outline" size={18} color={colors.brand} />
          </View>
          <AppText weight="semi" size={15} style={styles.filaTexto}>
            Instalar la app
          </AppText>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </TouchableOpacity>
        <ModalInstruccionesIos
          visible={modalIosVisible}
          onClose={() => setModalIosVisible(false)}
          colors={colors}
        />
      </>
    );
  }

  return (
    <>
      <Card style={styles.tarjeta}>
        <TouchableOpacity
          accessibilityLabel="Descartar"
          onPress={descartar}
          style={styles.cerrar}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={colors.muted} />
        </TouchableOpacity>
        <View style={styles.tarjetaFila}>
          <View style={styles.iconWrap}>
            <AppText size={22}>📲</AppText>
          </View>
          <View style={styles.tarjetaTexto}>
            <AppText weight="bold" size={14}>
              Llevá la app en tu teléfono
            </AppText>
            <AppText muted size={12} style={styles.tarjetaSubtitulo}>
              Instalala gratis, sin pasar por ninguna tienda.
            </AppText>
          </View>
        </View>
        <Button
          title={esIosDevice ? 'Cómo instalarla' : 'Instalar'}
          icon="download-outline"
          onPress={instalar}
          style={styles.tarjetaBoton}
        />
      </Card>
      <ModalInstruccionesIos
        visible={modalIosVisible}
        onClose={() => setModalIosVisible(false)}
        colors={colors}
      />
    </>
  );
}

function ModalInstruccionesIos({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: Colors;
}) {
  const styles = useMemo(() => crearEstilosModal(colors), [colors]);
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Card style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Title size={17}>Instalar en iPhone/iPad</Title>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <View style={styles.paso}>
            <View style={styles.pasoIconWrap}>
              <Ionicons name="share-outline" size={20} color={colors.brand} />
            </View>
            <AppText size={14} style={styles.pasoTexto}>
              1. Tocá el ícono de <AppText weight="bold" size={14}>Compartir</AppText> en Safari.
            </AppText>
          </View>
          <View style={styles.paso}>
            <View style={styles.pasoIconWrap}>
              <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
            </View>
            <AppText size={14} style={styles.pasoTexto}>
              2. Elegí <AppText weight="bold" size={14}>"Agregar a inicio"</AppText> y confirmá.
            </AppText>
          </View>
          <Button title="Entendido" onPress={onClose} style={styles.modalBoton} />
        </Card>
      </View>
    </Modal>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    tarjeta: {
      gap: spacing.md,
    },
    cerrar: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      zIndex: 1,
    },
    tarjetaFila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingRight: spacing.lg,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.sky,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tarjetaTexto: {
      flex: 1,
      gap: 2,
    },
    tarjetaSubtitulo: {
      lineHeight: 16,
    },
    tarjetaBoton: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.lg,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    filaIconWrap: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.sky,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filaTexto: {
      flex: 1,
    },
  });

const crearEstilosModal = (colors: Colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      gap: spacing.md,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    paso: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    pasoIconWrap: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.sky,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -2,
    },
    pasoTexto: {
      flex: 1,
      lineHeight: 19,
    },
    modalBoton: {
      marginTop: spacing.xs,
    },
  });

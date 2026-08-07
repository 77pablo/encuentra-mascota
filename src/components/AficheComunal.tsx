import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../ui';
import { lightColors, spacing } from '../theme';
import QrCode from './QrCode';
import { urlSitio } from '../lib/kitComunal';

// Afiche GENÉRICO del kit comunal (Tanda 21): no es de una mascota, es de la
// app — para diarios murales, veterinarias y negocios del barrio. Paleta
// clara FIJA como AfichePoster/CollarTag (se imprime; no puede salir oscuro).
export const AFICHE_COMUNAL_ANCHO = 640;

export default function AficheComunal() {
  const url = urlSitio();
  return (
    <View style={styles.hoja}>
      <AppText weight="bold" size={34} style={styles.titular}>
        ¿SE TE PERDIÓ TU MASCOTA?
      </AppText>
      <AppText size={20} style={styles.sub}>
        Tu comuna ya tiene dónde buscarla
      </AppText>
      <View style={styles.bullets}>
        <AppText size={16} style={styles.bullet}>
          • Publicá su ficha gratis, con foto y mapa
        </AppText>
        <AppText size={16} style={styles.bullet}>
          • ¿La viste? Avisá sin crear cuenta
        </AppText>
        <AppText size={16} style={styles.bullet}>
          • Los vecinos de la zona reciben la alerta
        </AppText>
      </View>
      <View style={styles.qrZona}>
        <QrCode value={url} size={200} />
        <AppText size={14} style={styles.qrTexto}>
          Escaneá para entrar. Gratis y sin trámite.
        </AppText>
        <AppText weight="bold" size={16} style={styles.url}>
          {url.replace(/^https?:\/\//, '')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hoja: {
    width: AFICHE_COMUNAL_ANCHO,
    backgroundColor: '#ffffff',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  titular: { color: lightColors.lost, textAlign: 'center' },
  sub: { color: lightColors.ink, textAlign: 'center' },
  bullets: { alignSelf: 'stretch', gap: spacing.xs, marginVertical: spacing.md },
  bullet: { color: lightColors.ink },
  qrZona: { alignItems: 'center', gap: spacing.xs },
  qrTexto: { color: lightColors.muted, textAlign: 'center' },
  url: { color: lightColors.brandDark },
});

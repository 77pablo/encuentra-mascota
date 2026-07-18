import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppText } from '../ui';
import { colors, font, radius, spacing } from '../theme';
import QrCode from './QrCode';
import { AficheContent } from '../lib/afiche';

export interface AfichePosterProps {
  content: AficheContent;
  foto: string | null; // uri o data-uri ya resuelta
  onFotoLoad?: () => void; // se dispara cuando la imagen terminó de cargar (para capturar)
  onFotoError?: () => void; // se dispara cuando la imagen falló al cargar (para no colgar la captura)
}

const WIDTH = 816; // 8.5in * 96dpi
const HEIGHT = 1056; // 11in * 96dpi

export default function AfichePoster({ content, foto, onFotoLoad, onFotoError }: AfichePosterProps) {
  return (
    <View style={styles.page}>
      <AppText style={styles.titular}>{content.titular}</AppText>

      <View style={styles.fotoWrap}>
        {foto ? (
          <Image source={{ uri: foto }} style={styles.foto} onLoad={onFotoLoad} onError={onFotoError} resizeMode="cover" />
        ) : (
          <View style={[styles.foto, styles.fotoPlaceholder]}>
            <AppText size={96}>🐾</AppText>
          </View>
        )}
      </View>

      {content.nombre ? <AppText style={styles.nombre}>{content.nombre}</AppText> : null}
      <AppText style={styles.subtitulo}>{content.subtitulo}</AppText>

      <AppText style={styles.senas}>{content.senas}</AppText>

      {content.recompensa ? (
        <View style={styles.recompensa}>
          <AppText style={styles.recompensaText}>🎁 Recompensa: {content.recompensa}</AppText>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.contacto}>
          <AppText style={styles.contactoLabel}>Contactá por WhatsApp</AppText>
          <AppText style={styles.contactoNumero}>{content.whatsappDisplay}</AppText>
          <AppText style={styles.zona}>{content.zonaTexto}</AppText>
        </View>
        <View style={styles.qrWrap}>
          <QrCode value={content.url ?? 'https://encuentratumascota.app'} size={200} />
          <AppText style={styles.qrText}>Escaneá para ver más</AppText>
        </View>
      </View>

      <AppText style={styles.marca}>Publicado en Encuentra tu Mascota 🐾</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: colors.bg,
    padding: spacing.xxxl,
    justifyContent: 'flex-start',
  },
  titular: {
    fontFamily: font.display,
    fontSize: 72,
    lineHeight: 78,
    color: colors.lost,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  fotoWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  foto: {
    width: WIDTH - spacing.xxxl * 2,
    height: 420,
    borderRadius: radius.lg,
    backgroundColor: colors.sky,
  },
  fotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nombre: {
    fontFamily: font.display,
    fontSize: 46,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitulo: {
    fontFamily: font.bodySemi,
    fontSize: 28,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  senas: {
    fontFamily: font.body,
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  recompensa: {
    alignSelf: 'center',
    backgroundColor: colors.sun,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  recompensaText: {
    fontFamily: font.bodyBold,
    fontSize: 28,
    color: colors.ink,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    borderTopWidth: 2,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  contacto: {
    flexShrink: 1,
    paddingRight: spacing.lg,
  },
  contactoLabel: {
    fontFamily: font.bodySemi,
    fontSize: 24,
    color: colors.brand,
  },
  contactoNumero: {
    fontFamily: font.display,
    fontSize: 44,
    color: colors.ink,
  },
  zona: {
    fontFamily: font.body,
    fontSize: 20,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  qrWrap: {
    alignItems: 'center',
  },
  qrText: {
    fontFamily: font.body,
    fontSize: 16,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  marca: {
    fontFamily: font.bodySemi,
    fontSize: 18,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

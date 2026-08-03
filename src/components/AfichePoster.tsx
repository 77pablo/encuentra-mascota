import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppText } from '../ui';
import { lightColors, font, radius, spacing } from '../theme';
import QrCode from './QrCode';
import { AficheContent, TEXTO_QR } from '../lib/afiche';
import { ETIQUETA_RECOMPENSA } from '../lib/recompensa';

// Este afiche se rasteriza a PNG para imprimir: SIEMPRE debe quedar en paleta
// clara, sin seguir el tema del sistema/usuario (si no, un afiche impreso
// podría salir oscuro). Por eso usa `lightColors` fijo y no `useColors()`.
const colors = lightColors;

export interface AfichePosterProps {
  content: AficheContent;
  foto: string | null; // uri o data-uri ya resuelta
  onFotoLoad?: () => void; // se dispara cuando la imagen terminó de cargar (para capturar)
  onFotoError?: () => void; // se dispara cuando la imagen falló al cargar (para no colgar la captura)
}

const WIDTH = 816; // 8.5in * 96dpi
const HEIGHT = 1056; // 11in * 96dpi
const QR_SIZE = 180;

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

      {content.nombre ? (
        <AppText style={styles.nombre} numberOfLines={1}>
          {content.nombre}
        </AppText>
      ) : null}
      <AppText style={styles.subtitulo} numberOfLines={1}>
        {content.subtitulo}
      </AppText>

      <AppText style={styles.senas} numberOfLines={2}>
        {content.senas}
      </AppText>

      {/* Sin la cifra, a propósito: un afiche con el monto pegado en la calle es
          el anzuelo perfecto para el que llama diciendo "la tengo, transferime". */}
      {content.hayRecompensa ? (
        <View style={styles.recompensaCaja}>
          <AppText style={styles.recompensaText}>🎁 {ETIQUETA_RECOMPENSA}</AppText>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.qrWrap}>
          <QrCode value={content.url} size={QR_SIZE} />
          <AppText style={styles.qrText}>{TEXTO_QR}</AppText>
        </View>
        {content.whatsappDisplay ? (
          <View style={styles.contacto}>
            <AppText style={styles.contactoLabel}>Contactá por WhatsApp</AppText>
            <AppText style={styles.contactoNumero} numberOfLines={1}>
              {content.whatsappDisplay}
            </AppText>
          </View>
        ) : null}
        <AppText style={styles.zona}>{content.zonaTexto}</AppText>
      </View>

      <AppText style={styles.marca}>Publicado en Encuentra tu Mascota 🐾</AppText>
    </View>
  );
}

// PRESUPUESTO DE ALTURA (F1, revisión adversarial final de la tanda 13; re-presupuestado
// en el fix de cierre porque el titular de "encontrada" es de 2 LÍNEAS).
//
// El footer es COLUMNA (QR + leyenda + [contacto] + zona), no fila: mide bastante
// más que el footer viejo que calibró originalmente esta página. captureRef corta
// el PNG exactamente en HEIGHT=1056, así que el peor caso tiene que entrar entero.
// El titular NO es siempre 1 línea: `armarAfiche` solo produce dos strings fijos
// (src/lib/afiche.ts) — 'SE BUSCA' (1 línea) y '¿CONOCÉS A ESTA MASCOTA?' (2 líneas
// a 72px HankenGrotesk ExtraBold en 752px de ancho útil) — así que el peor caso real
// es: titular a 2 líneas + nombre 1 línea + señas topeadas a 2 + recompensa + footer
// completo con número de WhatsApp (también topado a 1 línea, `numberOfLines={1}`: un
// teléfono tipeado a mano no debe poder envolver y empujarse a sí mismo afuera).
// Cada altura de acá abajo es DETERMINÍSTICA: todo texto que participa del
// presupuesto lleva `lineHeight` explícito en su estilo (nunca el alto "natural" de
// la fuente), así que un fallback de fuente (HankenGrotesk sin cargar todavía cuando
// se dispara captureRef) no puede correr la cuenta.
//
// AVAILABLE = HEIGHT - 2*spacing.xxxl(32) = 1056 - 64 = 992
//
//   1. titular:      lineHeight 78 × 2 líneas    + marginBottom spacing.sm(8)  = 164
//   2. fotoWrap:      foto 240                   + marginBottom spacing.sm(8)  = 248  (subtotal 412)
//   3. nombre:        lineHeight 50 (1 línea)     + marginBottom 0              =  50  (subtotal 462)
//   4. subtitulo:     lineHeight 32 (1 línea)     + marginBottom spacing.sm(8)  =  40  (subtotal 502)
//   5. señas:         lineHeight 34 × 2 líneas    + marginBottom spacing.sm(8)  =  76  (subtotal 578)
//   6. recompensaCaja: paddingVertical spacing.xs(4)×2=8 + texto lineHeight 32
//                      + marginBottom spacing.sm(8)                            =  48  (subtotal 626)
//   7. footer:
//        borde 2 + paddingTop spacing.sm(8)                                   =  10
//        qrWrap: QR_SIZE 180 + marginBottom spacing.xs(4)
//                + qrText (lineHeight 18 + marginTop spacing.xs(4))           = 206
//        contacto: label lineHeight 28 + numero lineHeight 50 (numberOfLines=1
//                  SIEMPRE: el número cuenta como 1 línea sin excepción)       =  78
//        zona: lineHeight 24 + marginTop spacing.xs(4)                        =  28
//        footer total = 10+206+78+28                                         = 322  (subtotal 948)
//   8. marca:         lineHeight 22               + marginTop spacing.xs(4)   =  26  (TOTAL 974)
//
// TOTAL = 974 ≤ 992 → sobran 18px de margen real, con el PEOR caso (titular a 2
// líneas). El caso "SE BUSCA" (titular 1 línea, item 1 = 86) da TOTAL = 896, con
// 96px de margen. La foto bajó de 300 a 240 (recupera 60px) y se ajustó lo que
// faltaba con spacing: recompensaCaja de spacing.sm a spacing.xs de padding
// vertical (8px), footer de spacing.md a spacing.sm de paddingTop (4px), y
// qrWrap/marca de spacing.sm a spacing.xs de margen (4px cada uno) — 20px más.
// Si se agrega o agranda algo acá, hay que volver a sumar esta tabla término a
// término (no "a ojo"), y el peor caso a presupuestar es SIEMPRE el titular de
// 2 líneas, no el de 1.
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
    marginBottom: spacing.sm,
  },
  fotoWrap: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  foto: {
    width: WIDTH - spacing.xxxl * 2,
    height: 240,
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
    lineHeight: 50,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitulo: {
    fontFamily: font.bodySemi,
    fontSize: 28,
    lineHeight: 32,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  senas: {
    fontFamily: font.body,
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  recompensaCaja: {
    alignSelf: 'center',
    backgroundColor: colors.sun,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  recompensaText: {
    fontFamily: font.bodyBold,
    fontSize: 28,
    lineHeight: 32,
    color: colors.ink,
  },
  footer: {
    alignItems: 'center',
    marginTop: 'auto',
    borderTopWidth: 2,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  contacto: {
    alignItems: 'center',
  },
  contactoLabel: {
    fontFamily: font.bodySemi,
    fontSize: 24,
    lineHeight: 28,
    color: colors.brand,
  },
  contactoNumero: {
    fontFamily: font.display,
    fontSize: 44,
    lineHeight: 50,
    color: colors.ink,
  },
  zona: {
    fontFamily: font.body,
    fontSize: 20,
    lineHeight: 24,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  qrWrap: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  qrText: {
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 18,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  marca: {
    fontFamily: font.bodySemi,
    fontSize: 18,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});

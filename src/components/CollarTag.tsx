import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import QrCode from './QrCode';
import { AppText } from '../ui';
import { lightColors, font, radius, spacing } from '../theme';
import { armarEtiquetaCollar, armarNombreArchivoCollar } from '../lib/collarTag';

// Esta placa se rasteriza a PNG para imprimir: SIEMPRE debe quedar en paleta
// clara, sin seguir el tema del sistema/usuario (si no, una placa impresa
// podría salir oscura). Por eso usa `lightColors` fijo y no `useColors()`.
const colors = lightColors;
import { capturarAfiche, entregarAfiche } from '../lib/aficheImage';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { MyPet } from '../services/myPets';

export interface CollarTagProps {
  pet: Pick<MyPet, 'nombre' | 'especie' | 'collar_token'>;
  onDone: () => void;
  onError: (mensaje: string) => void;
}

// Proporción de placa / tarjeta (algo más ancha que alta).
const WIDTH = 680;
const HEIGHT = 420;
const QR_SIZE = 240;

// Genera el PNG de la etiqueta de collar: monta un póster fuera de pantalla,
// lo rasteriza y lo entrega (descarga en web / hoja de compartir en nativo).
// Reusa el mecanismo del afiche (`aficheImage.ts`), que es genérico. No lleva
// foto: la placa tiene que ser legible impresa y chica, y el QR es lo esencial.
export default function CollarTag({ pet, onDone, onError }: CollarTagProps) {
  const posterRef = useRef<View>(null);
  const disparado = useRef(false);
  const etiqueta = armarEtiquetaCollar(pet);

  const capturar = useCallback(async () => {
    if (disparado.current) return;
    disparado.current = true;
    try {
      const png = await capturarAfiche(posterRef.current);
      await entregarAfiche(png, armarNombreArchivoCollar(pet));
      onDone();
    } catch (e: any) {
      onError(mensajeDeErrorDb(e));
    }
  }, [pet, onDone, onError]);

  // Sin foto: capturamos tras un margen para que asiente el layout (mismo
  // criterio que AficheGenerator para el caso sin imagen).
  useEffect(() => {
    const t = setTimeout(capturar, 400);
    return () => clearTimeout(t);
  }, [capturar]);

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={posterRef} collapsable={false}>
        <View style={styles.card}>
          <View style={styles.left}>
            <AppText style={styles.hola}>¡Hola! Me llamo</AppText>
            <AppText style={styles.nombre} numberOfLines={2}>
              {pet.nombre}
            </AppText>
            <AppText style={styles.mensaje}>{etiqueta.mensaje}</AppText>
            <AppText style={styles.marca}>Encuentra tu Mascota 🐾</AppText>
          </View>
          <View style={styles.right}>
            <View style={styles.qrWrap}>
              <QrCode value={etiqueta.url ?? 'https://encuentratumascota.app'} size={QR_SIZE} />
            </View>
            <AppText style={styles.qrText}>Escaneá el código</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
  },
  card: {
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xxxl,
    gap: spacing.xl,
  },
  left: {
    flex: 1,
    justifyContent: 'center',
  },
  hola: {
    fontFamily: font.bodySemi,
    fontSize: 24,
    color: colors.brand,
  },
  nombre: {
    fontFamily: font.display,
    fontSize: 56,
    lineHeight: 60,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  mensaje: {
    fontFamily: font.body,
    fontSize: 24,
    lineHeight: 32,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  marca: {
    fontFamily: font.bodySemi,
    fontSize: 18,
    color: colors.muted,
  },
  right: {
    alignItems: 'center',
  },
  qrWrap: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  qrText: {
    fontFamily: font.body,
    fontSize: 18,
    color: colors.muted,
    marginTop: spacing.sm,
  },
});

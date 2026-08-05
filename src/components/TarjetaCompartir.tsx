import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
// Import directo (no el barrel `../ui`): el barrel reexporta `Button`, que
// carga @expo/vector-icons → expo-font → expo-asset, un paquete que falta en
// el node_modules compartido de este worktree y rompe CUALQUIER test que
// pase por el barrel (afecta a toda la app, no algo introducido acá). AppText
// no depende de nada de eso, así que importarlo directo evita el problema y
// deja este componente testeable.
import { AppText } from '../ui/AppText';
import { lightColors, font, spacing } from '../theme';
import QrCode from './QrCode';
import { DatosTarjeta } from '../lib/tarjeta';
import { fotoParaCaptura } from '../lib/aficheImage';

// Tarjeta compartible: se rasteriza a PNG para WhatsApp/redes, así que
// SIEMPRE debe quedar en paleta clara (misma regla que AfichePoster/
// CollarTag para assets compartibles/imprimibles), nunca según el tema del
// dispositivo/usuario. Genérica (F3+F4): recibe el shape `DatosTarjeta` ya
// armado (ver `datosDeReporte`/`datosDeAdopcion`/`datosDeFinalFeliz` en
// `src/lib/tarjeta.ts`), no conoce `Pet` ni `Adoption`.
const colors = lightColors;

const LADO = 1080;

export interface TarjetaCompartirProps {
  datos: DatosTarjeta;
  // Se dispara UNA vez cuando la tarjeta ya está lista para capturar (la
  // foto cargó, falló, o no había foto). Encapsula acá la misma espera que
  // usa AficheGenerator para el afiche, para que las pantallas que ofrecen
  // "Compartir tarjeta" no tengan que repetir la lógica de espera.
  onListo?: () => void;
}

export default function TarjetaCompartir({ datos, onListo }: TarjetaCompartirProps) {
  const { banda, bandaColor, titulo, subtitulo, qrUrl } = datos;
  const [foto, setFoto] = useState<string | null | undefined>(undefined); // undefined = resolviendo
  const disparado = useRef(false);

  // En web, bajamos la foto a data-uri antes de renderizar (mismo motivo que
  // el afiche: una imagen de otro origen ensucia el canvas y falla la
  // captura). Ver src/lib/aficheImage.ts.
  useEffect(() => {
    let vivo = true;
    const original = datos.fotoUrl;
    fotoParaCaptura(original)
      .then((f) => vivo && setFoto(f))
      .catch(() => vivo && setFoto(original));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avisarListo = () => {
    if (disparado.current) return;
    disparado.current = true;
    onListo?.();
  };

  useEffect(() => {
    if (foto === undefined) return; // aún resolviendo la foto
    if (!foto) {
      const t = setTimeout(avisarListo, 400);
      return () => clearTimeout(t);
    }
    // Red de seguridad por si `onLoad`/`onError` de la imagen nunca disparan.
    const t = setTimeout(avisarListo, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto]);

  if (foto === undefined) return null;

  return (
    <View style={styles.page}>
      <View style={[styles.banda, { backgroundColor: bandaColor }]}>
        <AppText style={styles.bandaTexto}>{banda}</AppText>
      </View>

      <View style={styles.fotoWrap}>
        {foto ? (
          <Image
            source={{ uri: foto }}
            style={styles.foto}
            resizeMode="cover"
            onLoad={avisarListo}
            onError={avisarListo}
          />
        ) : (
          <View style={[styles.foto, styles.fotoPlaceholder]}>
            <AppText size={140}>🐾</AppText>
          </View>
        )}
      </View>

      <View style={styles.pie}>
        <View style={styles.pieTextos}>
          <AppText style={styles.titulo}>{titulo}</AppText>
          {subtitulo ? <AppText style={styles.subtitulo}>{subtitulo}</AppText> : null}
        </View>
        <View style={styles.qrWrap}>
          {/* Componente genérico (F1/F3/F4): a esta altura no queda el id del
              reporte/adopción para armar `/mascota/<id>` o `/adopcion/<id>`
              como hace `armarAfiche`. Por eso `qrUrl` llega siempre resuelto
              desde `datosDeReporte`/`datosDeAdopcion`/`datosDeFinalFeliz`
              (lib/tarjeta.ts) — con base configurada o, si no, con el
              respaldo a la ficha en nuestro dominio, nunca a la home (deuda
              tanda 13, D2 · Step 4). Este componente sólo consume. */}
          <QrCode value={qrUrl} size={130} />
        </View>
      </View>

      <AppText style={styles.marca}>Encuentra tu Mascota 🐾</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: LADO,
    height: LADO,
    backgroundColor: colors.card,
  },
  banda: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  bandaTexto: {
    fontFamily: font.display,
    fontSize: 44,
    color: colors.white,
    letterSpacing: 1,
  },
  fotoWrap: {
    flex: 1,
    backgroundColor: colors.sky,
  },
  foto: {
    width: '100%',
    height: '100%',
  },
  fotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.xl,
    backgroundColor: colors.bg,
  },
  pieTextos: {
    flexShrink: 1,
    paddingRight: spacing.lg,
  },
  titulo: {
    fontFamily: font.display,
    fontSize: 50,
    color: colors.ink,
  },
  subtitulo: {
    fontFamily: font.bodySemi,
    fontSize: 30,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  qrWrap: {
    alignItems: 'center',
  },
  marca: {
    fontFamily: font.bodySemi,
    fontSize: 22,
    color: colors.muted,
    textAlign: 'center',
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
  },
});

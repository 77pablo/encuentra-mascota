import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Screen, Title } from '../ui';
import { spacing, radius, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import ComunaPickerModal from '../components/ComunaPickerModal';
import { armarCodigoEmbed, urlWidget } from '../lib/widgetInstitucion';
import { abrirEnlace } from '../lib/mapas';

const MS_FEEDBACK = 2000;

// "Poné las mascotas de tu comuna en tu sitio" (Tanda 20). Una veterinaria,
// refugio o municipio elige una comuna y copia un <iframe> para su web, que
// muestra las mascotas perdidas/encontradas activas de esa comuna alimentado
// por nosotros. Sin login ni rol: el widget solo muestra datos ya públicos, así
// que cualquiera puede tomarlo — es lo que ayuda a que lo adopten.
export default function WidgetInstitucionScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [comuna, setComuna] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // En web el origin real; en nativo, el dominio de producción (el widget vive
  // ahí). Así el código copiado siempre apunta al sitio, no a localhost.
  const origin =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'https://encuentras-mascota.pages.dev';

  const codigo = comuna ? armarCodigoEmbed(origin, comuna) : '';

  const copiar = async () => {
    const clipboard = Platform.OS === 'web' ? globalThis.navigator?.clipboard : undefined;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(codigo);
        setCopiado(true);
        setTimeout(() => setCopiado(false), MS_FEEDBACK);
        return;
      } catch (e) {
        console.warn('no se pudo copiar el código del widget', e);
      }
    }
    Share.share({ message: codigo });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={22}>Mostrá las mascotas de tu comuna en tu sitio</Title>
        <AppText muted size={14} style={styles.intro}>
          Si tenés una veterinaria, refugio, junta de vecinos o municipio, podés poner en tu página web
          las mascotas perdidas y encontradas de una comuna. Se actualiza solo y lleva a cada ficha.
        </AppText>

        <Card style={styles.card}>
          <AppText weight="semi" size={14}>
            1. Elegí la comuna
          </AppText>
          <Button
            title={comuna ?? 'Elegir comuna'}
            variant="secondary"
            icon="location-outline"
            onPress={() => setPicker(true)}
            style={styles.boton}
          />
        </Card>

        {comuna ? (
          <Card style={styles.card}>
            <AppText weight="semi" size={14}>
              2. Copiá este código y pegalo en tu sitio
            </AppText>
            <View style={styles.codigoCaja}>
              <AppText size={12} style={styles.codigoTexto}>
                {codigo}
              </AppText>
            </View>
            <Button
              title={copiado ? '¡Copiado!' : 'Copiar el código'}
              variant="secondary"
              icon={copiado ? 'checkmark' : 'copy-outline'}
              onPress={copiar}
              style={styles.boton}
            />
            <Button
              title="Ver cómo se ve"
              variant="ghost"
              icon="open-outline"
              onPress={() => abrirEnlace(urlWidget(origin, comuna))}
              style={styles.boton}
            />
            <View style={styles.nota}>
              <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
              <AppText muted size={12} style={styles.notaTexto}>
                Muestra solo reportes activos y públicos. Es gratis y no necesitás cuenta.
              </AppText>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <ComunaPickerModal
        visible={picker}
        onClose={() => setPicker(false)}
        onSelect={(nombre) => {
          setComuna(nombre);
          setPicker(false);
        }}
        titulo="Elegí la comuna del widget"
      />
    </Screen>
  );
}

function crearEstilos(colors: Colors) {
  return StyleSheet.create({
    content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
    intro: { lineHeight: 20 },
    card: { gap: spacing.sm },
    boton: { alignSelf: 'flex-start' },
    codigoCaja: {
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.sm,
    },
    codigoTexto: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: colors.ink },
    nota: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start', marginTop: spacing.xs },
    notaTexto: { flex: 1, lineHeight: 17 },
  });
}

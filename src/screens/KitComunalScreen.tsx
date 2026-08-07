import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Screen, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import AficheComunalGenerador from '../components/AficheComunalGenerador';
import { mensajesKit } from '../lib/kitComunal';
import { notify } from '../lib/notify';

const MS_FEEDBACK = 2000;

// Kit de arranque comunal (Tanda 21): afiche imprimible + mensajes listos
// para pegar. Para quien quiere traer la app a su comuna — puede no tener
// cuenta (misma lección que el widget), así que no hay ningún gate.
export default function KitComunalScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const mensajes = useMemo(() => mensajesKit(), []);

  const copiar = async (id: string, texto: string) => {
    const clipboard = Platform.OS === 'web' ? globalThis.navigator?.clipboard : undefined;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(texto);
        setCopiado(id);
        setTimeout(() => setCopiado(null), MS_FEEDBACK);
        return;
      } catch (e) {
        console.warn('no se pudo copiar el mensaje del kit', e);
      }
    }
    Share.share({ message: texto });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={22}>Traé la app a tu comuna</Title>
        <AppText muted size={14} style={styles.intro}>
          Mientras más vecinos la conozcan, más rápido vuelven las mascotas a casa. Acá tenés un
          afiche para imprimir y mensajes listos para compartir.
        </AppText>

        <Card style={styles.card}>
          <AppText weight="semi" size={14}>
            Afiche para el diario mural o la vitrina
          </AppText>
          <Button
            title={generando ? 'Generando…' : 'Descargar el afiche'}
            variant="secondary"
            icon="download-outline"
            onPress={() => setGenerando(true)}
            disabled={generando}
            style={styles.boton}
          />
        </Card>

        {mensajes.map((m) => (
          <Card key={m.id} style={styles.card}>
            <AppText weight="semi" size={14}>
              {m.titulo}
            </AppText>
            <View style={styles.mensajeCaja}>
              <AppText size={13} style={styles.mensajeTexto}>
                {m.texto}
              </AppText>
            </View>
            <Button
              title={copiado === m.id ? '¡Copiado!' : 'Copiar'}
              variant="secondary"
              icon={copiado === m.id ? 'checkmark' : 'copy-outline'}
              onPress={() => copiar(m.id, m.texto)}
              style={styles.boton}
            />
          </Card>
        ))}
      </ScrollView>

      {generando ? (
        <AficheComunalGenerador
          onDone={() => setGenerando(false)}
          onError={(msj) => {
            setGenerando(false);
            notify('No pudimos generar el afiche', msj);
          }}
        />
      ) : null}
    </Screen>
  );
}

function crearEstilos(colors: Colors) {
  return StyleSheet.create({
    content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
    intro: { lineHeight: 20 },
    card: { gap: spacing.sm },
    boton: { alignSelf: 'flex-start' },
    mensajeCaja: {
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.sm,
    },
    mensajeTexto: { lineHeight: 19 },
  });
}

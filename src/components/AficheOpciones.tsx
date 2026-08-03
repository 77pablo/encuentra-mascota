import React, { useState } from 'react';
import { Platform, Share, StyleSheet, Switch, View } from 'react-native';
import { AppText, Button, Card, Title } from '../ui';
import { type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { faltaWhatsapp, textoImprenta } from '../lib/afiche';
import { Pet } from '../services/pets';
import { Profile } from '../services/profile';

interface Props {
  pet: Pet;
  profile: Pick<Profile, 'telefono'> | null;
  onGenerar: (incluirNumero: boolean) => void;
  onCerrar: () => void;
}

// F10 (revisión adversarial final): en web, `Share.share` de react-native-web
// RECHAZA en Firefox y en Chrome/Linux (no hay `navigator.share` ahí) y el
// botón no hacía nada — mientras el rótulo seguía diciendo "Copiar". El botón
// tiene que COPIAR de verdad, así que en web usa el portapapeles del
// navegador y solo cae a `Share.share` si el portapapeles no está disponible
// o falla. En nativo se mantiene `Share.share` tal cual estaba (ahí sí abre
// el panel del sistema).
const MS_FEEDBACK_COPIADO = 2000;

// La hoja previa al afiche: acá vive la decisión de Pablo (número prendido
// por defecto, apagable) y el texto de imprenta. Dos toques: abrir y Descargar.
export default function AficheOpciones({ pet, profile, onGenerar, onCerrar }: Props) {
  const colors = useColors();
  const sinWhatsapp = faltaWhatsapp(profile);
  const [incluirNumero, setIncluirNumero] = useState(!sinWhatsapp);
  const [copiado, setCopiado] = useState(false);
  const styles = crearEstilos(colors);

  // Mismo criterio que `onPress={() => shareReport(pet)}` en PetDetailScreen
  // (src/lib/share.ts) para el respaldo de `Share.share`: sin `.catch()`
  // mudo. Si rechaza, queda como rechazo sin atrapar — visible en consola —
  // en vez de tragado en silencio (ver __tests__/lib/sinCatchMudos.test.ts).
  const compartirTexto = async () => {
    const texto = textoImprenta(pet.nombre || null);
    const clipboard = Platform.OS === 'web' ? globalThis.navigator?.clipboard : undefined;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), MS_FEEDBACK_COPIADO);
        return;
      } catch (e) {
        // No queda mudo (guardián sinCatchMudos): se avisa y se cae al
        // respaldo de abajo, que en web puede fallar igual (es justo lo que
        // este fix vino a arreglar), pero es mejor intento que ninguno.
        console.warn('no se pudo copiar al portapapeles, cae a Share.share', e);
      }
    }
    Share.share({ message: texto });
  };

  return (
    <Card style={styles.card}>
      <Title size={16}>Tu afiche para imprimir</Title>
      {sinWhatsapp ? (
        <AppText muted size={13} style={styles.nota}>
          No tenés WhatsApp cargado, así que el afiche va a salir solo con el QR.
          Igual sirve: quien lo escanee puede avisarte sin crear cuenta.
        </AppText>
      ) : (
        <>
          <View style={styles.switchRow}>
            <AppText size={14} style={styles.switchTexto}>
              Incluir mi número de WhatsApp
            </AppText>
            <Switch
              testID="switch-numero"
              value={incluirNumero}
              onValueChange={setIncluirNumero}
              trackColor={{ false: colors.line, true: colors.brand }}
              thumbColor={colors.white}
            />
          </View>
          {!incluirNumero ? (
            <AppText muted size={13} style={styles.nota}>
              Sin tu número puede avisar menos gente, sobre todo quien no escanea QR.
            </AppText>
          ) : null}
        </>
      )}
      <Button title="Descargar afiche" icon="print" onPress={() => onGenerar(incluirNumero)} />
      <Button
        title={copiado ? 'Copiado ✓' : 'Copiar texto para la fotocopiadora'}
        variant="secondary"
        icon={copiado ? 'checkmark' : 'copy-outline'}
        onPress={compartirTexto}
        style={styles.botonTexto}
      />
      <Button title="Cerrar" variant="ghost" onPress={onCerrar} />
    </Card>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    card: { gap: 10 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    switchTexto: { flex: 1, marginRight: 8 },
    nota: { marginBottom: 4 },
    botonTexto: { marginTop: 2 },
  });

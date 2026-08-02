import React, { useState } from 'react';
import { Share, StyleSheet, Switch, View } from 'react-native';
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

// La hoja previa al afiche: acá vive la decisión de Pablo (número prendido
// por defecto, apagable) y el texto de imprenta. Dos toques: abrir y Descargar.
export default function AficheOpciones({ pet, profile, onGenerar, onCerrar }: Props) {
  const colors = useColors();
  const sinWhatsapp = faltaWhatsapp(profile);
  const [incluirNumero, setIncluirNumero] = useState(!sinWhatsapp);
  const styles = crearEstilos(colors);

  // Mismo criterio que `onPress={() => shareReport(pet)}` en PetDetailScreen
  // (src/lib/share.ts): sin `.catch()` mudo. Si `Share.share` rechaza, queda
  // como rechazo sin atrapar — visible en consola — en vez de tragado en
  // silencio (ver __tests__/lib/sinCatchMudos.test.ts).
  const compartirTexto = () => {
    Share.share({ message: textoImprenta(pet.nombre || null) });
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
        title="Copiar texto para la fotocopiadora"
        variant="secondary"
        icon="copy-outline"
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

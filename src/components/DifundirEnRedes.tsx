import React, { useMemo, useState } from 'react';
import { Linking, Platform, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Title } from '../ui';
import { radius, spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { armarTextoDifusion } from '../lib/difusionRedes';
import { gruposSugeridos } from '../data/gruposDifusion';
import { petUrl } from '../lib/links';
import { Pet } from '../services/pets';

interface Props {
  pet: Pet;
  onCompartirTarjeta: () => void;
  onCerrar: () => void;
}

const MS_FEEDBACK_COPIADO = 2000;

// La hoja "Difundir en redes" (Tanda 15). El valor está en llevar el reporte
// ADONDE está la gente: los grupos de Facebook/WhatsApp de barrio, que es donde
// se mueven los casos en Chile. Arma el texto (sin monto ni teléfono — eso lo
// cuida armarTextoDifusion), lo copia, y da un toque para abrir cada grupo.
//
// NO construye su propio texto: delega en armarTextoDifusion para que la regla
// de "nunca el monto, nunca el teléfono" viva en un solo lugar testeado.
export default function DifundirEnRedes({ pet, onCompartirTarjeta, onCerrar }: Props) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [copiado, setCopiado] = useState(false);

  const texto = armarTextoDifusion(
    {
      nombre: pet.nombre,
      especie: pet.especie,
      estado: pet.estado,
      comuna: pet.comuna,
      descripcion: pet.descripcion,
      recompensa: pet.recompensa,
      robada: pet.robada,
    },
    petUrl(pet.id) ?? '',
  );
  const grupos = gruposSugeridos(pet.comuna ?? null);

  // Mismo criterio que AficheOpciones: en web el portapapeles del navegador
  // (Share.share de react-native-web rechaza en Firefox y Chrome/Linux), con
  // Share.share como respaldo. Sin catch mudo (guardián sinCatchMudos).
  const copiar = async () => {
    const clipboard = Platform.OS === 'web' ? globalThis.navigator?.clipboard : undefined;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), MS_FEEDBACK_COPIADO);
        return;
      } catch (e) {
        console.warn('no se pudo copiar al portapapeles, cae a Share.share', e);
      }
    }
    Share.share({ message: texto });
  };

  const abrirGrupo = (url: string) => {
    Linking.openURL(url).catch((e) => console.warn('no se pudo abrir el grupo', e));
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="megaphone-outline" size={18} color={colors.brand} />
        <Title size={17} style={styles.headerTitle}>
          Difundir en redes
        </Title>
      </View>
      <AppText muted size={13} style={styles.intro}>
        Lo que más ayuda es que el reporte llegue a los grupos del barrio. Copiá el texto, pegalo en
        un grupo y compartí la foto aparte con el botón de la tarjeta.
      </AppText>

      <View style={styles.textoCaja}>
        <AppText size={13}>{texto}</AppText>
      </View>

      <Button
        title={copiado ? '¡Copiado!' : 'Copiar el texto'}
        variant="secondary"
        icon={copiado ? 'checkmark' : 'copy-outline'}
        onPress={copiar}
        style={styles.boton}
      />
      <Button
        title="Compartir la tarjeta con foto"
        variant="secondary"
        icon="image"
        onPress={onCompartirTarjeta}
        style={styles.boton}
      />

      <AppText weight="semi" muted size={13} style={styles.seccion}>
        Grupos donde publicarlo
      </AppText>
      {grupos.map((g) => (
        <TouchableOpacity
          key={g.url}
          style={styles.grupoFila}
          onPress={() => abrirGrupo(g.url)}
          accessibilityRole="link"
          accessibilityLabel={`Abrir el grupo ${g.nombre}`}
        >
          <Ionicons
            name={g.red === 'whatsapp' ? 'logo-whatsapp' : 'logo-facebook'}
            size={18}
            color={colors.brand}
          />
          <AppText size={14} style={styles.grupoNombre}>
            {g.nombre}
          </AppText>
          <Ionicons name="open-outline" size={16} color={colors.muted} />
        </TouchableOpacity>
      ))}

      <AppText muted size={12} style={styles.pie}>
        Al tocar un grupo se abre Facebook; ahí pegás el texto. No hace falta que quien lo vea tenga
        cuenta en la app para avisarte.
      </AppText>

      <Button title="Listo" variant="ghost" onPress={onCerrar} style={styles.boton} />
    </Card>
  );
}

function crearEstilos(colors: Colors) {
  return StyleSheet.create({
    card: { marginTop: spacing.md, gap: spacing.sm },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    headerTitle: { color: colors.ink },
    intro: { marginBottom: spacing.xs },
    textoCaja: {
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.sm,
    },
    boton: { marginTop: spacing.xs },
    seccion: { marginTop: spacing.sm },
    grupoFila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    grupoNombre: { flex: 1, color: colors.ink },
    pie: { marginTop: spacing.xs },
  });
}

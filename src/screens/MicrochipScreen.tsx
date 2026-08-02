import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Screen, Title } from '../ui';
import { Colors, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { abrirBusquedaMapa, abrirEnlace } from '../lib/mapas';
import {
  BUSQUEDAS_LECTOR,
  QUE_ES_UN_CHIP,
  REGISTROS_CAIDOS,
  REGISTROS_CONSULTABLES,
  URL_REGISTRO_NACIONAL,
  hayQuePegarElNumeroAMano,
  urlDeConsulta,
} from '../data/registrosChip';

// "Encontré una mascota con chip" — el consultor de microchip.
//
// Tres cosas, en el orden en que las necesita alguien parado en la vereda con
// un perro al lado:
//   1. Qué es esto (y que NO es un GPS: es la confusión más frecuente).
//   2. Dónde se lo leen GRATIS, ahora: se abre el mapa del teléfono con la
//      búsqueda hecha. Mismo patrón que AyudaScreen — no mantenemos una lista
//      de direcciones porque se desactualiza sola.
//   3. Ya tengo el número: a qué registros lo consulto.
//
// Lo que NO se pudo hacer, y se dice en pantalla en vez de disimularlo: ningún
// registro chileno acepta el número por URL, así que hay que pegarlo a mano en
// cada uno. Ver el comentario largo de `data/registrosChip.ts`.

type FilaProps = {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  sub: string;
  onPress: () => void;
};

function Fila({ icono, titulo, sub, onPress }: FilaProps) {
  // Subcomponente a nivel de módulo (mismo motivo que en AyudaScreen): no ve
  // el `styles` del componente de abajo, así que resuelve el suyo.
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button">
      <Card style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={icono} size={20} color={colors.brand} />
        </View>
        <View style={styles.textWrap}>
          <AppText weight="bold" size={14}>
            {titulo}
          </AppText>
          <AppText muted size={12}>
            {sub}
          </AppText>
        </View>
        <Ionicons name="open-outline" size={18} color={colors.muted} />
      </Card>
    </TouchableOpacity>
  );
}

export default function MicrochipScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const aMano = hayQuePegarElNumeroAMano();

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Title size={22} style={styles.title}>
          Encontraste una mascota con chip
        </Title>
        <AppText muted size={13} style={styles.subtitle}>
          El chip es lo que más rápido la devuelve a su casa. Con chip vuelven más
          del doble de los perros, y casi veinte veces más los gatos.
        </AppText>

        {/* 1. QUÉ ES — 20 segundos, para quien nunca escuchó del tema. */}
        <Card style={styles.explicaCard}>
          <AppText weight="bold" size={15} style={styles.explicaTitulo}>
            Qué es un chip (y qué no es)
          </AppText>
          {QUE_ES_UN_CHIP.map((linea) => (
            <View key={linea} style={styles.explicaFila}>
              <Ionicons
                name="ellipse"
                size={6}
                color={colors.brand}
                style={styles.explicaBullet}
              />
              <AppText muted size={13} style={styles.explicaTexto}>
                {linea}
              </AppText>
            </View>
          ))}
        </Card>

        {/* 2. DÓNDE LEERLO — el mapa del teléfono, siempre actualizado. */}
        <AppText weight="bold" size={13} style={styles.sectionLabel}>
          1 · DÓNDE SE LO LEEN GRATIS, CERCA TUYO
        </AppText>
        <AppText muted size={13} style={styles.sectionSub}>
          No hace falta pedir hora ni ser cliente. Pedí que le pasen el lector: son
          diez segundos y sale un número de quince dígitos.
        </AppText>
        {BUSQUEDAS_LECTOR.map((b) => (
          <Fila
            key={b.id}
            icono={b.id === 'municipalidad' ? 'business' : b.id === 'urgencia' ? 'alarm' : 'medkit'}
            titulo={b.titulo}
            sub={b.sub}
            onPress={() => abrirBusquedaMapa(b.query)}
          />
        ))}

        {/* 3. QUÉ HACER CON EL NÚMERO. */}
        <AppText weight="bold" size={13} style={styles.sectionLabel}>
          2 · YA TENÉS EL NÚMERO: DÓNDE CONSULTARLO
        </AppText>
        <AppText muted size={13} style={styles.sectionSub}>
          En Chile no hay una consulta única: el dato está repartido entre varios
          registros y ninguno habla con el otro. Anotá el número y probalo en los
          dos{aMano ? ' —hay que pegarlo a mano en cada sitio, ninguno lo recibe desde acá—' : ''}.
        </AppText>
        {REGISTROS_CONSULTABLES.map((r) => (
          <Fila
            key={r.id}
            icono={r.oficial ? 'shield-checkmark' : 'search'}
            titulo={r.oficial ? `${r.nombre} · oficial` : r.nombre}
            sub={r.detalle}
            onPress={() => abrirEnlace(urlDeConsulta(r))}
          />
        ))}

        {/* Los muertos. Nombrarlos es un servicio: si no, la persona los googlea
            y termina en una página de casinos o en un dominio en venta. */}
        <Card style={styles.caidosCard}>
          <View style={styles.caidosHeader}>
            <Ionicons name="alert-circle" size={18} color={colors.lost} />
            <AppText weight="bold" size={14} style={styles.caidosTitulo}>
              Los que vas a ver en Google y ya no sirven
            </AppText>
          </View>
          {REGISTROS_CAIDOS.map((r) => (
            <AppText key={r.id} muted size={12} style={styles.caidoLinea}>
              • {r.dominio} — {r.motivo}
            </AppText>
          ))}
        </Card>

        {/* 4. EL EMPUJÓN A INSCRIBIR. */}
        <AppText weight="bold" size={13} style={styles.sectionLabel}>
          3 · SI NO APARECE EN NINGÚN REGISTRO
        </AppText>
        <Card style={styles.registrarCard}>
          <AppText size={13} style={styles.registrarTexto}>
            Pasa seguido: tiene chip, pero nadie lo inscribió. Sin la inscripción, el
            número no lleva a ninguna parte.
          </AppText>
          <AppText size={13} style={styles.registrarTexto}>
            En Chile inscribir es <AppText weight="bold" size={13}>gratis y obligatorio</AppText> por
            la Ley 21.020. Si la mascota es tuya —o si te la terminás quedando—, dejala
            inscrita: es lo único que hace que el chip sirva el día que haga falta.
          </AppText>
          <Button
            title="Inscribir en el Registro Nacional"
            icon="shield-checkmark"
            onPress={() => abrirEnlace(URL_REGISTRO_NACIONAL)}
            style={styles.registrarBoton}
          />
          <AppText muted size={12} style={styles.registrarNota}>
            También podés hacerlo en tu municipalidad o en cualquier veterinaria
            registradora, sin costo.
          </AppText>
        </Card>

        <AppText muted size={12} style={styles.footer}>
          Si el chip no está inscrito o su familia no contesta, avisá igual a tu
          municipio y publicá el reporte acá: entre las dos cosas es como más
          aparecen.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    content: {
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
    },
    title: {
      marginTop: spacing.sm,
    },
    subtitle: {
      marginBottom: spacing.sm,
      lineHeight: 19,
    },
    explicaCard: {
      padding: spacing.md,
      gap: spacing.xs,
      backgroundColor: colors.sky,
    },
    explicaTitulo: {
      marginBottom: spacing.xs,
    },
    explicaFila: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    explicaBullet: {
      marginTop: 7,
      marginRight: spacing.sm,
    },
    explicaTexto: {
      flex: 1,
      lineHeight: 19,
    },
    sectionLabel: {
      color: colors.muted,
      letterSpacing: 0.5,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    sectionSub: {
      lineHeight: 19,
      marginBottom: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: colors.sky,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textWrap: {
      flex: 1,
      gap: 2,
    },
    caidosCard: {
      padding: spacing.md,
      marginTop: spacing.md,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.line,
    },
    caidosHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    caidosTitulo: {
      flex: 1,
    },
    caidoLinea: {
      lineHeight: 17,
    },
    registrarCard: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    registrarTexto: {
      lineHeight: 19,
    },
    registrarBoton: {
      marginTop: spacing.xs,
    },
    registrarNota: {
      lineHeight: 17,
    },
    footer: {
      marginTop: spacing.lg,
      lineHeight: 18,
    },
  });

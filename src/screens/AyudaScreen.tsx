import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, Screen, Title } from '../ui';
import { Colors, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { abrirBusquedaMapa, abrirEnlace } from '../lib/mapas';
import { URL_CONSULTA_NACIONAL } from '../data/registrosChip';

// Ayuda rápida cuando alguien necesita actuar YA: abre el mapa del teléfono con
// la búsqueda hecha (siempre actualizado, sin listas que mantener) + recursos
// nacionales + qué tener a mano. Se llega desde la guía "recién se me perdió" y
// desde Perfil.

type Accion = {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  sub: string;
  onPress: () => void;
  /** `false` cuando la fila NO sale de la app (navega a otra pantalla): la
   *  flecha de "se abre afuera" sería mentira. */
  externo?: boolean;
};

function Fila({ icono, titulo, sub, onPress, externo = true }: Accion) {
  // Subcomponente a nivel de módulo: no puede leer el `styles` de
  // AyudaScreen (es local a ese componente), así que resuelve sus propios
  // colores y estilos con el mismo `crearEstilos`.
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
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
        <Ionicons name={externo ? 'open-outline' : 'chevron-forward'} size={18} color={colors.muted} />
      </Card>
    </TouchableOpacity>
  );
}

export default function AyudaScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Title size={22} style={styles.title}>
          Ayuda y recursos
        </Title>
        <AppText muted size={13} style={styles.subtitle}>
          Cuando necesitás actuar rápido: abrimos el mapa con la búsqueda lista.
        </AppText>

        {/* Arriba de todo: si la mascota está al lado, el chip es lo que más
            rápido la devuelve a su casa. La pantalla dedicada explica qué es,
            dónde se lo leen gratis y a qué registros consultar el número. */}
        <Fila
          icono="hardware-chip"
          titulo="Encontré una mascota con chip"
          sub="Dónde se lo leen gratis y dónde consultar el número"
          externo={false}
          onPress={() => navigation.navigate('Microchip')}
        />

        <AppText weight="bold" size={13} style={styles.sectionLabel}>
          BUSCAR CERCA DE TI
        </AppText>
        <Fila
          icono="medkit"
          titulo="Veterinarias cerca"
          sub="Abre el mapa con veterinarias de tu zona"
          onPress={() => abrirBusquedaMapa('veterinaria')}
        />
        <Fila
          icono="alarm"
          titulo="Veterinaria de urgencia (24h)"
          sub="Para una emergencia, ahora"
          onPress={() => abrirBusquedaMapa('veterinaria urgencia 24 horas')}
        />
        <Fila
          icono="paw"
          titulo="Refugios y rescatistas"
          sub="Por si llegó una mascota con sus señas"
          onPress={() => abrirBusquedaMapa('refugio de animales')}
        />

        <AppText weight="bold" size={13} style={styles.sectionLabel}>
          RECURSOS ÚTILES
        </AppText>
        <Fila
          icono="document-text"
          titulo="Registro Nacional de Mascotas"
          sub="Ley Cholito: consultá un número de chip"
          // La página de consultas, no la raíz: `registratumascota.cl` responde
          // con un 302 hacia `http://` y el enlace terminaba degradado.
          onPress={() => abrirEnlace(URL_CONSULTA_NACIONAL)}
        />
        <Fila
          icono="business"
          titulo="Tu municipalidad"
          sub="Tenencia responsable y control canino comunal"
          onPress={() => abrirBusquedaMapa('municipalidad tenencia responsable de mascotas')}
        />

        <Card style={styles.tipCard}>
          <AppText weight="bold" size={14} style={styles.tipTitle}>
            Qué tener a mano
          </AppText>
          <AppText muted size={13} style={styles.tipLine}>
            • Señas claras: color, tamaño, collar, algo que la distinga.
          </AppText>
          <AppText muted size={13} style={styles.tipLine}>
            • Una foto reciente y nítida.
          </AppText>
          <AppText muted size={13} style={styles.tipLine}>
            • El número de chip, si tiene: en una veterinaria pueden leerlo.
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    marginTop: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.muted,
    letterSpacing: 0.5,
    marginTop: spacing.md,
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
  tipCard: {
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  tipTitle: {
    marginBottom: spacing.xs,
  },
  tipLine: {
    lineHeight: 19,
  },
});

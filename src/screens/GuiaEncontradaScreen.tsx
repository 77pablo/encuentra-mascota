import React, { useEffect, useState, useMemo } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { GUIA_ENCONTRADA, GuiaEncontradaPaso } from '../data/guiaEncontrada';
import { resolverNavegacionGuia } from '../lib/guiaNavegacion';
import { notify } from '../lib/notify';
import { AppText, Button, Card, Screen, Title } from '../ui';
import { Colors, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Espejo de GuiaPerdidaScreen (Función 4): progreso de la checklist guardado
// SOLO en este dispositivo (misma justificación que allá — ayuda visual, no
// dato sensible ni compartido). Clave DISTINTA para no mezclar el progreso de
// ambas guías.
const KEY = 'guia_encontrada_progreso';

async function leerMarcados(): Promise<string[]> {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof localStorage !== 'undefined'
          ? localStorage.getItem(KEY)
          : null
        : await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const validos = new Set(GUIA_ENCONTRADA.map((p) => p.id));
    return parsed.filter((x): x is string => typeof x === 'string' && validos.has(x));
  } catch {
    return [];
  }
}

async function guardarMarcados(ids: string[]): Promise<void> {
  try {
    const raw = JSON.stringify(ids);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, raw);
      return;
    }
    await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // Sin almacenamiento no pasa nada grave: solo no recordamos el progreso.
  }
}

export default function GuiaEncontradaScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    leerMarcados().then((ids) => {
      if (vivo) setMarcados(new Set(ids));
    });
    return () => {
      vivo = false;
    };
  }, []);

  const toggle = (id: string) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      guardarMarcados([...next]);
      return next;
    });
  };

  const irA = (paso: GuiaEncontradaPaso) => {
    if (!paso.accion) return;
    const { url, ruta, params } = paso.accion;
    if (url) {
      Linking.openURL(url).catch(() =>
        notify('No se pudo abrir', 'Revisá el enlace del Registro Nacional de Mascotas.'),
      );
      return;
    }
    if (!ruta) return;
    const destino = resolverNavegacionGuia(ruta, params);
    navigation.navigate(destino.name, destino.params);
  };

  const total = GUIA_ENCONTRADA.length;
  const hechos = GUIA_ENCONTRADA.reduce((n, p) => (marcados.has(p.id) ? n + 1 : n), 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Title size={24} style={styles.title}>
            Te encontraste una mascota
          </Title>
          <AppText muted size={14} style={styles.subtitle}>
            Gracias por parar a ayudarla. Vamos paso a paso para que vuelva con su
            familia. Marca lo que ya hiciste para no perderte.
          </AppText>
          {hechos > 0 ? (
            <View style={styles.progressPill}>
              <Ionicons name="checkmark-circle" size={15} color={colors.found} />
              <AppText size={12} weight="semi" color={colors.found} style={styles.progressLabel}>
                {hechos} de {total} listos
              </AppText>
            </View>
          ) : null}
        </View>

        {GUIA_ENCONTRADA.map((paso, i) => {
          const hecho = marcados.has(paso.id);
          return (
            <Card key={paso.id} style={styles.card}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.row}
                onPress={() => toggle(paso.id)}
                accessibilityRole="checkbox"
                // `aria-checked` además del state: en web, react-native-web 0.21
                // ya no traduce `accessibilityState`. Ver RegisterScreen.
                accessibilityState={{ checked: hecho }}
                aria-checked={hecho}
                accessibilityLabel={`Paso ${i + 1}: ${paso.titulo}`}
              >
                <Ionicons
                  name={hecho ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={hecho ? colors.found : colors.muted}
                  style={styles.check}
                />
                <View style={styles.stepText}>
                  <AppText
                    weight="bold"
                    size={15}
                    style={[styles.stepTitle, hecho && styles.stepTitleDone]}
                  >
                    {i + 1}. {paso.titulo}
                  </AppText>
                  <AppText muted size={13} style={styles.stepDetail}>
                    {paso.detalle}
                  </AppText>
                </View>
              </TouchableOpacity>

              {paso.accion ? (
                <Button
                  title={paso.accion.label}
                  variant="secondary"
                  onPress={() => irA(paso)}
                  style={styles.stepButton}
                />
              ) : null}
            </Card>
          );
        })}

        <AppText muted size={12} style={styles.footer}>
          Esta guía son consejos prácticos para acompañarte, no una indicación
          veterinaria. Ante una urgencia de salud, acude a un veterinario.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    lineHeight: 20,
  },
  progressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.sky,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  progressLabel: {
    marginLeft: 4,
  },
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  check: {
    marginRight: spacing.sm,
    marginTop: 1,
  },
  stepText: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    lineHeight: 20,
  },
  stepTitleDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  stepDetail: {
    lineHeight: 19,
  },
  stepButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  footer: {
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});

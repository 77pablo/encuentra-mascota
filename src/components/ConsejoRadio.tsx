import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pet } from '../services/pets';
import { radioLabel, radioSugerido } from '../lib/radioSugerido';
import { AppText, Card } from '../ui';
import { radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface ConsejoRadioProps {
  pet: Pick<Pet, 'especie' | 'estado' | 'creado_en' | 'ambito'>;
  now?: number;
}

// HASTA DÓNDE CONVIENE BUSCAR, dicho corto y en la ficha del dueño.
//
// El radio sale de src/lib/radioSugerido.ts (estudio de Queensland + Missing
// Animal Response). Se amplía solo con los días: si ya pasó la mediana de
// tiempo hasta el reencuentro y no apareció, este caso no es el típico y hay
// que mirar más lejos.
//
// DEGRADA SIN LA MIGRACIÓN 0046: `pet.ambito` llega `undefined` tanto si la
// columna no existe como si el reporte es viejo o la persona omitió la
// pregunta. Los tres casos significan lo mismo ("no sabemos") y `radioSugerido`
// los resuelve con el criterio conservador: el radio ANCHO. Nunca se le achica
// la búsqueda a nadie por falta de dato.
export function ConsejoRadio({ pet, now = Date.now() }: ConsejoRadioProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);

  // Solo tiene sentido en una mascota PERDIDA: en "encontrada" el animal ya
  // está a resguardo y no hay nada que rastrillar.
  if (pet.estado !== 'perdida') return null;

  const dias = Math.floor((now - new Date(pet.creado_en).getTime()) / DIA_MS);
  // El valor de la columna va CRUDO a propósito: `radioSugerido` ya descarta
  // cualquier cosa que no sea un ámbito conocido y cae en el caso ancho. Acá
  // había un `esAmbito(...)` de más: defensa duplicada que ningún test podía
  // distinguir de la que sí hace el trabajo, o sea código muerto disfrazado de
  // prolijidad. Si alguien afloja el saneo, el rojo tiene que salir en un solo
  // lugar (__tests__/lib/radioSugerido.test.ts) y no en dos.
  const sugerido = radioSugerido({ especie: pet.especie, ambito: pet.ambito, dias });
  const ampliado = sugerido.km > sugerido.inicialKm;

  return (
    <Card style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="locate-outline" size={20} color={colors.brand} />
        </View>
        <View style={styles.textWrap}>
          <AppText weight="bold" size={14}>
            Buscá {radioLabel(sugerido.km)} a la redonda
          </AppText>
          <AppText muted size={12} style={styles.motivo}>
            {sugerido.motivo}
          </AppText>
          {ampliado ? (
            <AppText muted size={12} style={styles.motivo}>
              Ya pasaron unos días: ampliamos el círculo desde los{' '}
              {radioLabel(sugerido.inicialKm)} del principio.
            </AppText>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: colors.sky,
      padding: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textWrap: {
      flex: 1,
      gap: 2,
    },
    motivo: {
      lineHeight: 17,
    },
  });

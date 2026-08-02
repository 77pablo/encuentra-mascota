import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  COLORES,
  COLOR_ETIQUETA,
  type ColorPelaje,
  ESTERILIZADOS,
  ESTERILIZADO_ETIQUETA,
  type EsterilizadoValor,
  MAX_COLORES,
  SEXOS,
  SEXO_ETIQUETA,
  type Sexo,
  TAMANOS,
  TAMANO_ETIQUETA,
  type Tamano,
} from '../lib/senasMascota';
import { AppText, Chip } from '../ui';
import { spacing } from '../theme';

// LAS SEÑAS QUE SÍ SE PUBLICAN: color, tamaño, sexo y esterilizado.
//
// Todo esto ya se escribía en la descripción libre, pero ahí no lo puede leer
// nadie más que una persona. Marcado en chips, el motor de coincidencias puede
// DESCARTAR un par que se contradice, que es lo que hace que las sugerencias
// dejen de ser "misma especie + 15 km".
//
// Se puede saltear entero y cada chip se suelta volviéndolo a tocar: quien
// acaba de perder a su animal no está para llenar un formulario, y lo que falta
// no descarta ninguna coincidencia (ver src/lib/senasMascota.ts).
//
// El NÚMERO DE CHIP no está acá a propósito: no se publica y va por otro lado
// (ver src/services/petChip.ts y el bloque privado de PublishScreen).

export interface Senas {
  colores: ColorPelaje[];
  tamano: Tamano | null;
  sexo: Sexo | null;
  esterilizado: EsterilizadoValor | null;
}

export const SENAS_VACIAS: Senas = {
  colores: [],
  tamano: null,
  sexo: null,
  esterilizado: null,
};

/** Las señas de un reporte ya guardado, para precargar el formulario de editar. */
export function senasDeReporte(pet: {
  colores?: string[] | null;
  tamano?: string | null;
  sexo?: string | null;
  esterilizado?: string | null;
}): Senas {
  return {
    colores: ((pet.colores ?? []) as string[]).filter((c): c is ColorPelaje =>
      (COLORES as readonly string[]).includes(c),
    ),
    tamano: (TAMANOS as readonly string[]).includes(pet.tamano ?? '')
      ? (pet.tamano as Tamano)
      : null,
    sexo: (SEXOS as readonly string[]).includes(pet.sexo ?? '') ? (pet.sexo as Sexo) : null,
    esterilizado: (ESTERILIZADOS as readonly string[]).includes(pet.esterilizado ?? '')
      ? (pet.esterilizado as EsterilizadoValor)
      : null,
  };
}

export function SelectorSenas({
  valor,
  onChange,
}: {
  valor: Senas;
  onChange: (senas: Senas) => void;
}) {
  const styles = useMemo(() => crearEstilos(), []);

  const toggleColor = (color: ColorPelaje) => {
    const ya = valor.colores.includes(color);
    if (ya) {
      onChange({ ...valor, colores: valor.colores.filter((c) => c !== color) });
      return;
    }
    // El tope se hace acá y no en el submit para que se note al tocar: llegar a
    // "Publicar" y descubrir que se cayeron dos colores sería peor.
    if (valor.colores.length >= MAX_COLORES) return;
    onChange({ ...valor, colores: [...valor.colores, color] });
  };

  // Volver a tocar el mismo chip lo suelta. Sin esto, contestar por error deja
  // a la persona encerrada en una respuesta que después usa el motor para
  // DESCARTAR coincidencias: es peor que no haber contestado.
  const uno = <T extends string>(campo: keyof Senas, actual: T | null, elegido: T) =>
    onChange({ ...valor, [campo]: actual === elegido ? null : elegido });

  return (
    <View style={styles.wrap}>
      <AppText size={14} weight="bold">
        Señas (opcional, ayuda a encontrarla)
      </AppText>
      <AppText muted size={12} style={styles.ayuda}>
        Con esto podemos descartar los reportes que claramente no son. Marcá lo que
        sepas y saltate el resto.
      </AppText>

      <AppText muted size={12} style={styles.etiqueta}>
        Color{valor.colores.length > 0 ? ` (${valor.colores.length}/${MAX_COLORES})` : ''}
      </AppText>
      <View style={styles.chipsRow}>
        {COLORES.map((c) => (
          <Chip
            key={c}
            label={COLOR_ETIQUETA[c]}
            active={valor.colores.includes(c)}
            onPress={() => toggleColor(c)}
          />
        ))}
      </View>

      <AppText muted size={12} style={styles.etiqueta}>
        Tamaño
      </AppText>
      <View style={styles.chipsRow}>
        {TAMANOS.map((t) => (
          <Chip
            key={t}
            label={TAMANO_ETIQUETA[t]}
            active={valor.tamano === t}
            onPress={() => uno('tamano', valor.tamano, t)}
          />
        ))}
      </View>

      <AppText muted size={12} style={styles.etiqueta}>
        Sexo
      </AppText>
      <View style={styles.chipsRow}>
        {SEXOS.map((s) => (
          <Chip
            key={s}
            label={SEXO_ETIQUETA[s]}
            active={valor.sexo === s}
            onPress={() => uno('sexo', valor.sexo, s)}
          />
        ))}
      </View>

      <AppText muted size={12} style={styles.etiqueta}>
        ¿Está esterilizado/a?
      </AppText>
      <View style={styles.chipsRow}>
        {ESTERILIZADOS.map((e) => (
          <Chip
            key={e}
            label={ESTERILIZADO_ETIQUETA[e]}
            active={valor.esterilizado === e}
            onPress={() => uno('esterilizado', valor.esterilizado, e)}
          />
        ))}
      </View>
    </View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    wrap: {
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    ayuda: {
      lineHeight: 17,
    },
    etiqueta: {
      marginTop: spacing.sm,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
  });

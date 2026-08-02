import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pet } from '../services/pets';
import { debePreguntar, Hito, RespuestaCierre } from '../lib/cierreCasos';
import { responderEstado } from '../services/cierreCasos';
import { confirmAction } from '../lib/notify';
import { AppText, Button, Card, Title } from '../ui';
import { spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// LA TARJETA QUE PREGUNTA "¿APARECIÓ?" — se dibuja sola (devuelve null) cuando
// no corresponde, incluida la base sin la migración 0049 aplicada.
//
// SOBRE EL TONO, que es lo más difícil de este archivo: quien la lee puede no
// haber encontrado a su animal. La pregunta no lleva un solo signo de
// exclamación, no da por hecho el final feliz, y la tercera salida ("ya no lo
// busco") no está pintada de rojo ni redactada como una derrota. Nadie le debe
// explicaciones a una app.
//
// NO tiene botón de "cerrar": si la persona no quiere responder hoy, no
// responde y la pregunta la espera. Un descarte permanente nos dejaría sin
// saber nunca qué pasó, que es justo el problema que esto viene a resolver.

// Cómo se nombra a la mascota cuando no tiene nombre cargado.
const especieLabel: Record<Pet['especie'], string> = {
  perro: 'tu perro',
  gato: 'tu gato',
  otro: 'tu mascota',
};

// Concordancia del pronombre. No sabemos el sexo del animal: lo que se usa es
// el género gramatical de la palabra con la que lo nombramos ("el perro", "el
// gato", "la mascota"). Es la convención del castellano y evita el "buscándolo/a".
const pronombre: Record<Pet['especie'], 'lo' | 'la'> = {
  perro: 'lo',
  gato: 'lo',
  otro: 'la',
};

// Un texto por hito. La diferencia no es decorativa: a los 3 días quedan dos
// preguntas por delante y a los 21 esta es la última, y decirlo cambia cómo se
// lee. La del día 21 además promete explícitamente que el reporte NO se cae
// solo por no contestar.
// Los subtextos no afirman cuánto tiempo pasó EXACTO, y es a propósito.
//
// Antes decían "pasaron tres días" / "pasó una semana" / "pasaron tres
// semanas", pero el hito que se muestra es el más alto ALCANZADO: alguien que
// abre la app al día 20 veía el hito 7 y leía "pasó una semana", cuando habían
// pasado veinte días. El texto tiene que ser cierto en toda la ventana del
// hito, no solo el día exacto en que se cumple.
//
// Y el del 21 prometía "esta es la última vez que te preguntamos" sin que el
// código lo cumpliera: sin respuesta, volvía a salir en cada apertura para
// siempre. Ahora hay un tope real en `debePreguntar` (el vencimiento), así que
// la promesa se puede sostener — pero se dice de una forma que sigue siendo
// cierta aunque el reporte se reactive.
const SUBTEXTO: Record<Hito, string> = {
  3: 'Ya pasaron unos días desde que publicaste. Contanos cómo va: si ya está en casa sacamos el aviso, y si no, lo dejamos donde está.',
  7: 'Pasó más de una semana. Sea cual sea la respuesta, saberlo ayuda a que el mapa muestre lo que está pasando de verdad.',
  21: 'Pasaron varias semanas. No te vamos a seguir preguntando: si seguís buscando, tu reporte se queda acá mientras esté al día.',
};

export const ERROR_AL_GUARDAR =
  'No pudimos guardar tu respuesta. Tu reporte quedó como estaba: probá de nuevo.';

// ¿Esta tarjeta se va a dibujar? Una sola fuente de verdad, exportada porque
// PetDetailScreen la necesita para callar al viejo `NudgeVigencia` mientras
// esta pregunta está en pantalla (las dos preguntan casi lo mismo).
//
// SOLO en reportes de mascota PERDIDA. En uno de mascota ENCONTRADA quien
// publicó no es el dueño: la pregunta que corresponde no es "¿apareció?" sino
// si dio con su familia, y hasta la tercera salida es otra ("me lo quedé", "lo
// llevé a un refugio"). Preguntar mal es peor que no preguntar. Mismo criterio
// de alcance que PlanBusqueda y ConsejoRadio.
export function seVaAPreguntar(pet: Pet, ahora?: Date): boolean {
  if (pet.estado !== 'perdida') return false;
  return debePreguntar(pet, ahora ?? new Date()).preguntar;
}

export interface PreguntaSiAparecioProps {
  pet: Pet;
  // Se llama SOLO cuando la base confirmó el cambio, con la respuesta elegida.
  // La pantalla la usa para reflejar el nuevo estado sin volver a consultar.
  onRespondido: (respuesta: RespuestaCierre) => void;
  /**
   * Qué hacer con "Sí, volvió a casa". Si la pantalla lo pasa, este botón
   * DELEGA en ella en vez de cerrar el reporte por su cuenta.
   *
   * Hace falta porque el reencuentro ya tenía su propio flujo —el panel con
   * "dejá un mensajito y una foto"— y cerrarlo por atajo lo perdía PARA
   * SIEMPRE: al quedar `reunida`, la ficha conmuta a la tarjeta de final feliz
   * y el botón que abría ese panel desaparece en el mismo render. No hay
   * ninguna pantalla que vuelva a poner `activo = true`, así que la nota y la
   * foto de ese reencuentro ya no se podían cargar nunca más.
   *
   * Además evitaba tener dos botones con la misma etiqueta en la misma
   * pantalla haciendo cosas distintas, siendo el de arriba el que perdía datos.
   */
  onVolvioACasa?: () => void;
  // El reloj entra por parámetro (convención de src/lib/recordatorios.ts).
  ahora?: Date;
}

export function PreguntaSiAparecio({
  pet,
  onRespondido,
  onVolvioACasa,
  ahora,
}: PreguntaSiAparecioProps) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  // Qué respuesta se está mandando ahora mismo (null = ninguna). Sirve para el
  // spinner y para que el reintento repita LA MISMA, no la primera de la lista.
  const [enviando, setEnviando] = useState<RespuestaCierre | null>(null);
  const [fallo, setFallo] = useState<RespuestaCierre | null>(null);

  // Un solo `new Date()` para las dos consultas: con dos, un cruce de
  // milisegundo podría dar respuestas distintas.
  const momento = ahora ?? new Date();
  const { hito } = debePreguntar(pet, momento);
  if (!seVaAPreguntar(pet, momento) || hito === null) return null;

  const nombre = pet.nombre?.trim() || especieLabel[pet.especie];
  const le = pronombre[pet.especie];
  const ocupado = enviando !== null;

  const enviar = async (respuesta: RespuestaCierre) => {
    if (respuesta === 'ya_no_busco') {
      // La única de las tres sin vuelta atrás desde la app: no hay ninguna
      // pantalla que vuelva a poner `activo = true`. Por eso se avisa qué pasa
      // exactamente, en vez de una advertencia genérica.
      const ok = await confirmAction(
        '¿Cerramos el reporte?',
        `Va a dejar de aparecer en las búsquedas y en el mapa. Queda guardado en tu perfil, con todo lo que te escribieron.`,
      );
      if (!ok) return;
    }
    setEnviando(respuesta);
    setFallo(null);
    try {
      await responderEstado(pet.id, respuesta);
      onRespondido(respuesta);
    } catch {
      // A propósito no se usa `mensajeDeErrorDb`: acá lo que importa no es qué
      // pasó del lado del servidor sino que el reporte NO cambió. El detalle
      // técnico (PGRST202 de la migración sin aplicar, red caída, RLS) no le
      // dice nada a quien está buscando a su perro, y el consejo es el mismo.
      setFallo(respuesta);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="help-circle-outline" size={18} color={colors.brand} />
        <Title size={16} style={styles.headerTitle}>
          ¿Apareció {nombre}?
        </Title>
      </View>
      <AppText muted size={13} style={styles.texto}>
        {SUBTEXTO[hito]}
      </AppText>

      <Button
        title="Sí, volvió a casa"
        icon="heart"
        loading={enviando === 'aparecio'}
        disabled={ocupado}
        // Si la pantalla ofrece su flujo de reencuentro, se usa ese: es el que
        // deja cargar el mensaje y la foto del final feliz. Cerrar por atajo
        // los perdía para siempre (ver `onVolvioACasa`).
        onPress={() => (onVolvioACasa ? onVolvioACasa() : enviar('aparecio'))}
        style={styles.accion}
      />
      <Button
        title={`Sigo buscándo${le}`}
        variant="secondary"
        icon="search"
        loading={enviando === 'sigo_buscando'}
        disabled={ocupado}
        onPress={() => enviar('sigo_buscando')}
        style={styles.accion}
      />
      {/* Ghost y no "danger": dejar de buscar no es un error que la app tenga
          que marcar en rojo. */}
      <Button
        title={`Ya no ${le} busco`}
        variant="ghost"
        loading={enviando === 'ya_no_busco'}
        disabled={ocupado}
        onPress={() => enviar('ya_no_busco')}
        style={styles.accion}
      />

      {fallo ? (
        <View style={styles.errorBox}>
          <AppText size={13} color={colors.lost}>
            {ERROR_AL_GUARDAR}
          </AppText>
          <Button
            title="Reintentar"
            variant="secondary"
            icon="refresh"
            loading={ocupado}
            onPress={() => enviar(fallo)}
            style={styles.accion}
          />
        </View>
      ) : null}
    </Card>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    card: {
      marginTop: spacing.md,
      backgroundColor: colors.sky,
      gap: spacing.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    headerTitle: {
      flexShrink: 1,
      lineHeight: 22,
    },
    texto: {
      lineHeight: 19,
      marginBottom: spacing.xs,
    },
    accion: {
      marginTop: spacing.xs,
    },
    errorBox: {
      marginTop: spacing.sm,
    },
  });

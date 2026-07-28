import React, { createContext, useContext, useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppText, Screen, Title } from '../ui';
import { Colors, font, radius, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { BloqueLegal, DOCUMENTOS_LEGALES, TramoLegal } from '../content/legalGenerado';

// Política de privacidad y Términos de uso que se muestran DENTRO de la app.
//
// Esta pantalla NO tiene texto legal propio. Los documentos viven en
// `docs/legal/*.md` y `scripts/generar-legales.js` los convierte en tres cosas:
// las dos páginas web públicas y `src/content/legalGenerado.ts`, que es lo que
// se pinta acá. Antes eran tres copias a mano y la app se quedaba con la
// versión vieja cada vez que alguien corregía el markdown.
//
// Si hay que cambiar una palabra del texto: se cambia en docs/legal/ y se corre
// `npm run legales`. Acá solo se decide cómo se ve.
//
// Sobre el correo de contacto: no existe todavía, y el generador se encarga de
// que ninguna de las tres superficies prometa un canal que hoy no atendería
// nadie (ver `[[CANAL: …]]` y `textoCanal()` en el generador). Los textos que
// llegan acá ya apuntan a Perfil → Editar perfil / Avisos / Borrar mi cuenta.
//
// Los marcadores [[PENDIENTE: …]] del markdown no llegan crudos: los datos que
// faltan vienen ya redactados en castellano y las preguntas para el abogado se
// quedan en la página web de borrador, que es para quien las tiene que
// contestar. Un usuario que se está registrando no es ese público.

type Estilos = ReturnType<typeof crearEstilos>;

// Un solo StyleSheet para toda la pantalla: los documentos son varios cientos
// de bloques y no tiene sentido que cada uno cree el suyo.
const CtxEstilos = createContext<Estilos | null>(null);

function useEstilos(): Estilos {
  const estilos = useContext(CtxEstilos);
  if (!estilos) throw new Error('Los bloques legales van dentro de <LegalScreen>');
  return estilos;
}

const plano = (tramos: TramoLegal[]) => tramos.map((t) => t.texto).join('');

/** Un texto con sus tramos en negrita, cursiva, código o enlace. */
function Tramos({
  tramos,
  size = 14,
  muted = false,
  prefijo,
  style,
}: {
  tramos: TramoLegal[];
  size?: number;
  muted?: boolean;
  prefijo?: string;
  style?: object;
}) {
  const colors = useColors();
  return (
    <AppText size={size} muted={muted} style={[{ lineHeight: Math.round(size * 1.45) }, style]}>
      {prefijo}
      {tramos.map((tramo, i) => {
        if (tramo.enlace) {
          const destino = tramo.enlace;
          return (
            <Text
              key={i}
              style={{ color: colors.brand, textDecorationLine: 'underline' }}
              onPress={() => {
                Linking.openURL(destino).catch(() => {
                  /* sin navegador disponible: el texto del enlace ya se ve */
                });
              }}
            >
              {tramo.texto}
            </Text>
          );
        }
        if (!tramo.fuerte && !tramo.enfasis && !tramo.codigo) return tramo.texto;
        return (
          <Text
            key={i}
            style={[
              tramo.fuerte && { fontFamily: font.bodyBold },
              tramo.enfasis && { fontStyle: 'italic' as const },
              tramo.codigo && { color: colors.brand },
            ]}
          >
            {tramo.texto}
          </Text>
        );
      })}
    </AppText>
  );
}

/** Una tabla del documento. */
function Tabla({ bloque }: { bloque: Extract<BloqueLegal, { tipo: 'tabla' }> }) {
  const estilos = useEstilos();

  // Sin encabezado es el `| | |` del markdown: una lista de campo/valor.
  if (!bloque.columnas.length) {
    return (
      <View style={estilos.grupo}>
        {bloque.filas.map((fila, i) => (
          <View key={i} style={estilos.dato}>
            <AppText size={13} style={estilos.datoEtiqueta}>
              {plano(fila[0] ?? [])}
            </AppText>
            <Tramos tramos={fila[1] ?? []} />
          </View>
        ))}
      </View>
    );
  }

  // Con encabezado, una tarjeta por fila. Las tablas de estos documentos tienen
  // hasta cuatro columnas de texto corrido: en la web se resuelve con scroll
  // horizontal, pero en un teléfono no hay a dónde scrollear.
  return (
    <View style={estilos.grupo}>
      {bloque.filas.map((fila, i) => (
        <View key={i} style={estilos.fila}>
          <Tramos tramos={fila[0] ?? []} size={15} style={estilos.filaTitulo} />
          {fila.slice(1).map((celda, j) =>
            celda.length ? (
              <View key={j} style={estilos.dato}>
                <AppText size={12} style={estilos.datoEtiqueta}>
                  {plano(bloque.columnas[j + 1] ?? [])}
                </AppText>
                <Tramos tramos={celda} />
              </View>
            ) : null,
          )}
        </View>
      ))}
    </View>
  );
}

/** `meta` es la línea de app/fecha/versión que abre cada documento. */
function Bloque({ bloque, meta = false }: { bloque: BloqueLegal; meta?: boolean }) {
  const estilos = useEstilos();

  switch (bloque.tipo) {
    case 'separador':
      return <View style={estilos.separador} />;

    case 'titulo':
      return bloque.nivel <= 2 ? (
        <Title size={18} style={estilos.tituloSeccion}>
          {plano(bloque.texto)}
        </Title>
      ) : (
        <AppText size={15} style={estilos.subtitulo}>
          {plano(bloque.texto)}
        </AppText>
      );

    case 'parrafo':
      return <Tramos tramos={bloque.texto} size={meta ? 12 : 14} muted={meta} />;

    case 'lista':
      return (
        <View style={estilos.grupo}>
          {bloque.items.map((item, i) => (
            <Tramos
              key={i}
              tramos={item}
              prefijo={bloque.ordenada ? `${bloque.inicio + i}.  ` : '•  '}
            />
          ))}
        </View>
      );

    case 'nota':
      return (
        <View style={estilos.nota}>
          {bloque.bloques.map((hijo, i) => (
            <Bloque key={i} bloque={hijo} />
          ))}
        </View>
      );

    case 'tabla':
      return <Tabla bloque={bloque} />;

    default:
      return null;
  }
}

export default function LegalScreen() {
  const colors = useColors();
  const estilos = useMemo(() => crearEstilos(colors), [colors]);

  return (
    <Screen padded>
      <CtxEstilos.Provider value={estilos}>
        <ScrollView contentContainerStyle={estilos.content} showsVerticalScrollIndicator={false}>
          {DOCUMENTOS_LEGALES.map((doc, i) => (
            <View key={doc.ruta} style={estilos.documento}>
              {i > 0 ? <View style={estilos.divider} /> : null}
              <Title size={22} style={estilos.mainTitle}>
                {doc.titulo}
              </Title>
              {doc.bloques.map((bloque, j) => (
                <Bloque key={j} bloque={bloque} meta={j === 0} />
              ))}
            </View>
          ))}
        </ScrollView>
      </CtxEstilos.Provider>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    content: {
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    documento: {
      gap: spacing.sm,
    },
    mainTitle: {
      marginTop: spacing.md,
    },
    tituloSeccion: {
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    subtitulo: {
      color: colors.ink,
      fontFamily: font.bodySemi,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    grupo: {
      gap: spacing.xs,
    },
    nota: {
      backgroundColor: colors.sky,
      borderLeftColor: colors.brand,
      borderLeftWidth: 3,
      borderRadius: radius.sm,
      gap: spacing.xs,
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    fila: {
      borderColor: colors.line,
      borderRadius: radius.sm,
      borderWidth: 1,
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    filaTitulo: {
      marginBottom: spacing.xs,
    },
    dato: {
      marginTop: spacing.xs,
    },
    datoEtiqueta: {
      color: colors.muted,
      marginBottom: 2,
    },
    separador: {
      height: 1,
      backgroundColor: colors.line,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    divider: {
      height: 1,
      backgroundColor: colors.line,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
  });

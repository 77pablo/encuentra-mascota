import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Screen, Title } from '../ui';
import { Colors, spacing } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Texto base de privacidad y términos. Redactado en lenguaje simple para que
// cualquier usuario lo entienda; conviene revisarlo con un profesional antes
// de usarlo como documento legal definitivo en Chile.
const ULTIMA_ACTUALIZACION = '16 de julio de 2026';
// PENDIENTE: falta definir el correo de contacto de la app. Mientras no exista,
// la seccion "Contacto" no se muestra: es preferible no prometer un canal que
// no atendemos antes que dejar un texto de relleno a la vista de los usuarios
// (hasta hoy decia literalmente "[tu correo de contacto]" en produccion).
// Ambas tiendas EXIGEN un contacto del desarrollador, asi que esto bloquea la
// publicacion y hay que llenarlo antes de subir a App Store o Google Play.
const CORREO_CONTACTO: string | null = null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // Subcomponente a nivel de módulo: no puede leer el `styles` de
  // LegalScreen (es local a ese componente), así que resuelve sus propios
  // colores y estilos con el mismo `crearEstilos`.
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <View style={styles.section}>
      <Title size={18} style={styles.sectionTitle}>
        {title}
      </Title>
      {children}
    </View>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <AppText style={styles.item} size={14}>
      {'•  '}
      {children}
    </AppText>
  );
}

export default function LegalScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText muted size={12}>
          Última actualización: {ULTIMA_ACTUALIZACION}
        </AppText>
        <AppText muted size={12} style={styles.disclaimer}>
          Este es un texto base pensado para explicar de forma clara cómo funciona la app. Conviene
          revisarlo con un profesional antes de usarlo como documento legal definitivo en Chile.
        </AppText>

        <Title size={22} style={styles.mainTitle}>
          Política de privacidad
        </Title>

        <Section title="Qué datos recopilamos">
          <Item>Tu correo y tu nombre, para identificar tu cuenta.</Item>
          <Item>Tu foto de perfil, si decides agregar una.</Item>
          <Item>Las fotos de las mascotas que publicas en un reporte.</Item>
          <Item>La ubicación del reporte, que tú marcas manualmente en el mapa.</Item>
          <Item>Los mensajes que envías y recibes en el chat de la app.</Item>
        </Section>

        <Section title="Para qué los usamos">
          <Item>Para mostrar los reportes de mascotas perdidas y encontradas.</Item>
          <Item>Para permitir que otros usuarios te contacten sobre un reporte.</Item>
          <Item>Para ayudar a reunir a las mascotas con su familia.</Item>
          <AppText size={14} style={styles.paragraph}>
            No vendemos tus datos a terceros.
          </AppText>
        </Section>

        <Section title="Qué es visible para otros usuarios">
          <Item>Los reportes y sus fotos son públicos: así funciona la búsqueda de mascotas.</Item>
          <Item>Tu correo no se muestra a otros usuarios en ningún caso.</Item>
          <Item>El contacto entre usuarios ocurre solo a través del chat interno de la app.</Item>
        </Section>

        <Section title="Tus derechos">
          <Item>Puedes editar o borrar tus reportes cuando quieras.</Item>
          <Item>Puedes borrar tu cuenta cuando quieras.</Item>
          <Item>Al borrar un reporte, se elimina su información de la app.</Item>
        </Section>

        <Section title="Menores y contenido de terceros">
          <Item>No publiques datos sensibles de otras personas en tus reportes o mensajes.</Item>
        </Section>

        {CORREO_CONTACTO ? (
          <Section title="Contacto">
            <AppText size={14} style={styles.paragraph}>
              Si tienes dudas sobre tus datos, escríbenos a: {CORREO_CONTACTO}
            </AppText>
          </Section>
        ) : null}

        <View style={styles.divider} />

        <Title size={22} style={styles.mainTitle}>
          Términos de uso
        </Title>

        <Section title="Uso responsable">
          <Item>Publica información veraz sobre las mascotas perdidas o encontradas.</Item>
          <Item>
            No publiques contenido ofensivo, falso o spam: puede ser denunciado y ocultado por el
            equipo de la app.
          </Item>
        </Section>

        <Section title="La app es una herramienta comunitaria">
          <Item>No garantiza el reencuentro con tu mascota.</Item>
          <Item>No verifica la identidad de las personas que usan la app.</Item>
          <Item>
            Ten precaución al coordinar encuentros en persona: elige siempre lugares públicos y, si
            es posible, acompañado.
          </Item>
        </Section>

        <Section title="Recompensas">
          <AppText size={14} style={styles.paragraph}>
            Si ofreces o aceptas una recompensa, es un acuerdo entre particulares. La app no
            participa en ese acuerdo ni se hace responsable de su cumplimiento.
          </AppText>
        </Section>

        <Section title="Moderación">
          <AppText size={14} style={styles.paragraph}>
            Podemos ocultar o eliminar reportes, fotos o mensajes que incumplan estas normas.
          </AppText>
        </Section>
      </ScrollView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  disclaimer: {
    marginBottom: spacing.sm,
  },
  mainTitle: {
    marginTop: spacing.md,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  item: {
    lineHeight: 20,
  },
  paragraph: {
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
});

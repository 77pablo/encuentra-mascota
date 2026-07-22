import React, { useState, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { forgotPasswordSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { mensajeDeErrorAuth } from '../../lib/authErrors';
import { AppText, Button, Card, Input, Screen, Title } from '../../ui';
import { Colors, radius, spacing } from '../../theme';
import { useColors } from '../../theme/ThemeProvider';

export default function ForgotPasswordScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      notify('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const redirectTo = Platform.OS === 'web' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo,
      });
      if (error) {
        notify('No se pudo enviar el enlace', mensajeDeErrorAuth(error));
        return;
      }
      notify(
        'Revisa tu correo',
        'Te enviamos un enlace para restablecer tu contraseña. Revisa también spam.'
      );
      navigation.goBack();
    } catch (e: any) {
      notify('No se pudo conectar', mensajeDeErrorAuth(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroBand}>
            <AppText size={48}>🔑</AppText>
            <Title size={24} align="center" style={styles.heroTitle}>
              ¿Olvidaste tu contraseña?
            </Title>
            <AppText muted align="center" style={styles.heroSubtitle}>
              Escribe tu correo y te enviaremos un enlace para restablecerla.
            </AppText>
          </View>

          <View style={styles.body}>
            <Card style={styles.card}>
              <Input
                label="Correo"
                icon="mail"
                placeholder="tucorreo@ejemplo.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Button
                title={loading ? 'Enviando…' : 'Enviar enlace'}
                onPress={onSubmit}
                loading={loading}
                style={styles.primaryButton}
              />
              <Button
                title="Volver a iniciar sesión"
                variant="ghost"
                onPress={() => navigation.goBack()}
              />
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  heroBand: {
    backgroundColor: colors.sky,
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  heroTitle: {
    marginTop: spacing.sm,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    maxWidth: 280,
  },
  body: {
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  primaryButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});

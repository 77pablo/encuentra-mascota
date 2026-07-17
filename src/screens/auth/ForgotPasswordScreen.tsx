import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { forgotPasswordSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { AppText, Button, Card, Input, Screen, Title } from '../../ui';
import { spacing } from '../../theme';

export default function ForgotPasswordScreen({ navigation }: any) {
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
        notify('No se pudo enviar el enlace', error.message);
        return;
      }
      notify(
        'Revisa tu correo',
        'Te enviamos un enlace para restablecer tu contraseña. Revisa también spam.'
      );
      navigation.goBack();
    } catch (e: any) {
      notify('Error de red', e?.message ?? 'Intenta de nuevo.');
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
          <View style={styles.hero}>
            <AppText size={56}>🔑</AppText>
            <Title size={26} align="center" style={styles.heroTitle}>
              ¿Olvidaste tu contraseña?
            </Title>
            <AppText muted align="center" style={styles.heroSubtitle}>
              Escribe tu correo y te enviaremos un enlace para restablecerla.
            </AppText>
          </View>

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
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  heroTitle: {
    marginTop: spacing.sm,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
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

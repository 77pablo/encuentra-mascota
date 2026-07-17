import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { loginSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { AppText, Button, Card, Input, Mascota, Screen, Title } from '../../ui';
import { colors, spacing } from '../../theme';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      notify('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) {
        notify('No se pudo entrar', error.message);
      }
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
            <Mascota size={56} color={colors.brandDark} />
            <Title size={26} align="center" style={styles.heroTitle}>
              Encuentra tu Mascota
            </Title>
            <AppText muted align="center" style={styles.heroSubtitle}>
              Bienvenido de vuelta. El barrio te estaba esperando.
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
            <Input
              label="Contraseña"
              icon="lock-closed"
              placeholder="Tu contraseña"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Button
              title={loading ? 'Entrando…' : 'Entrar'}
              onPress={onSubmit}
              loading={loading}
              style={styles.primaryButton}
            />
            <Button
              title="¿Olvidaste tu contraseña?"
              variant="ghost"
              onPress={() => navigation.navigate('ForgotPassword')}
            />
            <Button
              title="¿No tienes cuenta? Crea una"
              variant="ghost"
              onPress={() => navigation.navigate('Register')}
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

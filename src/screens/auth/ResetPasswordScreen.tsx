import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { resetPasswordSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { useAuth } from '../../hooks/useAuth';
import { AppText, Button, Card, Input, Screen, Title } from '../../ui';
import { colors, radius, spacing } from '../../theme';

export default function ResetPasswordScreen() {
  const { clearRecovering } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      notify('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (error) {
        notify('No se pudo actualizar', error.message);
        return;
      }
      notify('Listo', 'Tu contraseña se actualizó.');
      clearRecovering();
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
          <View style={styles.heroBand}>
            <AppText size={48}>🔒</AppText>
            <Title size={24} align="center" style={styles.heroTitle}>
              Nueva contraseña
            </Title>
            <AppText muted align="center" style={styles.heroSubtitle}>
              Elige una contraseña nueva para tu cuenta.
            </AppText>
          </View>

          <View style={styles.body}>
            <Card style={styles.card}>
              <Input
                label="Nueva contraseña"
                icon="lock-closed"
                placeholder="Mínimo 6 caracteres"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <Input
                label="Confirmar contraseña"
                icon="lock-closed"
                placeholder="Repite tu contraseña"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <Button
                title={loading ? 'Guardando…' : 'Guardar contraseña'}
                onPress={onSubmit}
                loading={loading}
                style={styles.primaryButton}
              />
            </Card>
          </View>
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

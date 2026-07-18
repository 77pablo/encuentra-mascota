import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { registerSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { AppText, Button, Card, Input, Mascota, Screen, Title } from '../../ui';
import { colors, radius, spacing } from '../../theme';

export default function RegisterScreen({ navigation }: any) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = registerSchema.safeParse({ nombre, email, password });
    if (!parsed.success) {
      notify('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { data: { nombre: parsed.data.nombre } },
      });
      if (error) {
        notify('No se pudo registrar', error.message);
        return;
      }
      notify('¡Cuenta creada!', 'Ahora inicia sesión con tu correo y contraseña.');
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
            <Mascota size={56} color={colors.brandDark} />
            <Title size={24} align="center" style={styles.heroTitle}>
              Crea tu cuenta
            </Title>
            <AppText muted align="center" style={styles.heroSubtitle}>
              Únete al barrio. Juntos encontramos más.
            </AppText>
          </View>

          <View style={styles.body}>
            <Card style={styles.card}>
              <Input
                label="Nombre"
                icon="person"
                placeholder="Tu nombre"
                value={nombre}
                onChangeText={setNombre}
              />
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
                placeholder="Mínimo 6 caracteres"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <Button
                title={loading ? 'Creando…' : 'Registrarme'}
                onPress={onSubmit}
                loading={loading}
                style={styles.primaryButton}
              />
              <Button
                title="¿Ya tienes cuenta? Inicia sesión"
                variant="ghost"
                onPress={() => navigation.goBack()}
              />
              <AppText muted size={12} align="center" style={styles.legalNote}>
                Al crear tu cuenta aceptas los Términos y la Política de Privacidad.
              </AppText>
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
  legalNote: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});

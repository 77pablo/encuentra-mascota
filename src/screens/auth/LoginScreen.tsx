import React, { useState, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { loginSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { mensajeDeErrorAuth } from '../../lib/authErrors';
import { volverAtras } from '../../lib/authReturn';
import { AppText, Button, Card, Input, Mascota, Screen, Title } from '../../ui';
import { Colors, radius, spacing } from '../../theme';
import { useColors } from '../../theme/ThemeProvider';

export default function LoginScreen({ navigation, route }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
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
        notify('No se pudo entrar', mensajeDeErrorAuth(error));
        return;
      }
      // Entró: sacamos la pantalla de auth de encima. Debajo quedó intacta la
      // pantalla desde donde vino (el detalle, el perfil, lo que sea), así que
      // vuelve exactamente ahí y no rebota al Inicio.
      volverAtras(navigation);
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
            <Mascota size={72} color={colors.brandDark} />
            <Title size={28} align="center" style={styles.heroTitle}>
              Encuentra tu Mascota
            </Title>
            <AppText muted align="center" style={styles.heroSubtitle}>
              Bienvenido de vuelta. Tu barrio te estaba esperando.
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
                onPress={() => navigation.replace('Register', route?.params)}
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
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  heroTitle: {
    marginTop: spacing.md,
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

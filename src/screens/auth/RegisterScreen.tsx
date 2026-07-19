import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { registerSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';
import { mensajeDeErrorAuth } from '../../lib/authErrors';
import { volverAtras } from '../../lib/authReturn';
import { AppText, Button, Card, Input, Mascota, Screen, Title } from '../../ui';
import { colors, radius, spacing } from '../../theme';

export default function RegisterScreen({ navigation, route }: any) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = registerSchema.safeParse({ nombre, email, password, aceptaTerminos });
    if (!parsed.success) {
      notify('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { data: { nombre: parsed.data.nombre } },
      });
      if (error) {
        notify('No se pudo registrar', mensajeDeErrorAuth(error));
        return;
      }
      // Si el proyecto no exige confirmar el correo, el registro ya deja
      // sesión iniciada: volvemos derecho a donde estaba el usuario en vez de
      // mandarlo a iniciar sesión de nuevo.
      if (data.session) {
        notify('¡Cuenta creada!', 'Ya estás dentro. Seguimos donde estabas.');
        volverAtras(navigation);
        return;
      }
      notify('¡Cuenta creada!', 'Ahora inicia sesión con tu correo y contraseña.');
      navigation.replace('Login', route?.params);
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
                onPress={() => navigation.replace('Login', route?.params)}
              />
              {/* Casilla explicita y sin premarcar: Google Play no acepta el
                  "al continuar aceptas..." en letra chica, y el enlace tiene
                  que dejar LEER el texto antes de aceptarlo. */}
              <TouchableOpacity
                style={styles.terminosFila}
                onPress={() => setAceptaTerminos((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: aceptaTerminos }}
                accessibilityLabel="Acepto los Términos y la Política de Privacidad"
              >
                <Ionicons
                  name={aceptaTerminos ? 'checkbox-outline' : 'square-outline'}
                  size={22}
                  color={aceptaTerminos ? colors.brandDark : colors.muted}
                />
                <AppText size={13} style={styles.terminosTexto}>
                  Acepto los{' '}
                  <AppText
                    size={13}
                    weight="bold"
                    style={styles.terminosEnlace}
                    onPress={() => navigation.navigate('Legal')}
                  >
                    Términos y la Política de Privacidad
                  </AppText>
                  .
                </AppText>
              </TouchableOpacity>
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
  terminosFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  terminosTexto: {
    flex: 1,
    lineHeight: 19,
  },
  terminosEnlace: {
    color: colors.brandDark,
    textDecorationLine: 'underline',
  },
});

import { Ionicons } from '@expo/vector-icons';
import React, { useState, useMemo } from 'react';
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
import { Colors, radius, spacing } from '../../theme';
import { useColors } from '../../theme/ThemeProvider';

export default function RegisterScreen({ navigation, route }: any) {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);

  // Se arma en 'YYYY-MM-DD' para que el schema calcule la edad. El año NO se
  // rellena con ceros a proposito: si el usuario escribe solo dos digitos, la
  // cadena no cuadra con \d{4} y el schema la rechaza como fecha invalida en
  // vez de aceptar un año absurdo como 0005.
  const fechaNacimiento =
    dia.trim() && mes.trim() && anio.trim()
      ? `${anio.trim()}-${mes.trim().padStart(2, '0')}-${dia.trim().padStart(2, '0')}`
      : '';

  const onSubmit = async () => {
    const parsed = registerSchema.safeParse({
      nombre,
      email,
      password,
      fechaNacimiento,
      aceptaTerminos,
    });
    if (!parsed.success) {
      notify('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        // La fecha viaja en la metadata para que el trigger `handle_new_user`
        // la guarde en `profiles.fecha_nacimiento` (columna privada, migracion
        // 0024). Si el registro no supera el corte de edad, nunca llegamos aca:
        // no se guarda nada del intento.
        options: {
          data: { nombre: parsed.data.nombre, fecha_nacimiento: parsed.data.fechaNacimiento },
        },
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
              {/* Fecha de nacimiento real y obligatoria, no una casilla "soy
                  mayor de 14". Se pide ANTES de crear la cuenta: si es menor de
                  14 no se crea nada. La edad se valida en el schema. */}
              <AppText weight="semi" muted size={13} style={styles.fechaLabel}>
                Fecha de nacimiento
              </AppText>
              <View style={styles.fechaFila}>
                <View style={styles.fechaDia}>
                  <Input
                    placeholder="Día"
                    keyboardType="number-pad"
                    value={dia}
                    onChangeText={setDia}
                  />
                </View>
                <View style={styles.fechaMes}>
                  <Input
                    placeholder="Mes"
                    keyboardType="number-pad"
                    value={mes}
                    onChangeText={setMes}
                  />
                </View>
                <View style={styles.fechaAnio}>
                  <Input
                    placeholder="Año"
                    keyboardType="number-pad"
                    value={anio}
                    onChangeText={setAnio}
                  />
                </View>
              </View>
              <AppText muted size={12} style={styles.fechaAyuda}>
                Necesitas tener al menos 14 años para crear una cuenta. Sin cuenta igual puedes
                ver los reportes, el mapa y las fotos.
              </AppText>
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
  fechaLabel: {
    marginBottom: spacing.xs,
  },
  fechaFila: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fechaDia: {
    flex: 1,
  },
  fechaMes: {
    flex: 1,
  },
  fechaAnio: {
    flex: 1.4,
  },
  fechaAyuda: {
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    lineHeight: 17,
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

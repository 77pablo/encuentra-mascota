import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { loginSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      Alert.alert('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) Alert.alert('No se pudo entrar', error.message);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', textAlign: 'center' }}>Encuentra tu Mascota</Text>
      <TextInput placeholder="Correo" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <TextInput placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword}
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <Button title={loading ? 'Entrando…' : 'Entrar'} onPress={onSubmit} disabled={loading} />
      <Button title="Crear cuenta" onPress={() => navigation.navigate('Register')} />
    </View>
  );
}

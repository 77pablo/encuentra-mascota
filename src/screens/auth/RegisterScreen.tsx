import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { registerSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';

export default function RegisterScreen() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const parsed = registerSchema.safeParse({ nombre, email, password });
    if (!parsed.success) {
      Alert.alert('Revisa los datos', parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      setLoading(false);
      Alert.alert('No se pudo registrar', error.message);
      return;
    }
    if (data.user) {
      // Crear la fila de perfil (RLS exige auth.uid() = id)
      await supabase.from('profiles').insert({ id: data.user.id, nombre: parsed.data.nombre });
    }
    setLoading(false);
    Alert.alert('¡Listo!', 'Revisa tu correo si se pide confirmación, luego entra.');
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', textAlign: 'center' }}>Crear cuenta</Text>
      <TextInput placeholder="Tu nombre" value={nombre} onChangeText={setNombre}
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <TextInput placeholder="Correo" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <TextInput placeholder="Contraseña (mín. 6)" secureTextEntry value={password} onChangeText={setPassword}
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }} />
      <Button title={loading ? 'Creando…' : 'Registrarme'} onPress={onSubmit} disabled={loading} />
    </View>
  );
}

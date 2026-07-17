import React, { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { registerSchema } from '../../schemas/auth';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/notify';

export default function RegisterScreen() {
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

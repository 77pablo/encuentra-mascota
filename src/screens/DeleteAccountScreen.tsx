import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borrarMiCuenta } from '../services/account';
import { confirmAction, notify } from '../lib/notify';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { useAuth } from '../hooks/useAuth';
import { AppText, Button, Card, Screen, Title } from '../ui';
import { colors, spacing } from '../theme';

// Borrar la cuenta no tiene vuelta atrás, así que la pantalla dice con todas
// las letras qué se destruye y qué sobrevive ANTES de ofrecer el botón. Que las
// pistas sigan ayudando a otros vecinos no es un detalle legal: es lo que hace
// que irse sea una decisión tranquila y no un salto al vacío.

const SE_BORRA = [
  'Tus reportes de mascotas, con sus fotos.',
  'Tu nombre, tu foto, tu teléfono y tu red social.',
  'Tu zona de alerta y tus reportes guardados.',
  'Tu correo: nadie va a poder relacionar lo que quede con vos.',
];

const QUEDA = [
  'Las pistas y avistamientos que dejaste en reportes de otros, firmados “Un vecino”: le siguen sirviendo a alguien que busca a su mascota.',
  'Tus conversaciones, del lado de la otra persona, como “Cuenta eliminada”. No va a poder escribirte más.',
];

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [borrando, setBorrando] = useState(false);

  const onBorrar = async () => {
    const ok = await confirmAction(
      '¿Borrar tu cuenta?',
      'Esto no se puede deshacer. Tus datos se borran para siempre.',
    );
    if (!ok) return;

    setBorrando(true);
    try {
      await borrarMiCuenta();
      notify('Cuenta borrada', 'Listo. Gracias por haber ayudado a encontrar mascotas.');
      await signOut();
    } catch (e: any) {
      // Título a propósito en modo "reintentá", no "no se pudo": si el fallo
      // ocurrió después de borrar las fotos, la cuenta sigue viva y conviene
      // que la persona vuelva a intentar en vez de quedarse a mitad de camino.
      notify('Necesitás reintentar', mensajeDeErrorDb(e));
    } finally {
      setBorrando(false);
    }
  };

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Title>Borrar mi cuenta</Title>
        <AppText muted>
          Si te vas, te vas de verdad: no guardamos una copia por las dudas.
        </AppText>

        <Card>
          <View style={styles.encabezado}>
            <Ionicons name="trash-outline" size={18} color={colors.lost} />
            <AppText weight="bold">Se borra para siempre</AppText>
          </View>
          {SE_BORRA.map((t) => (
            <AppText key={t} style={styles.item}>
              · {t}
            </AppText>
          ))}
        </Card>

        <Card>
          <View style={styles.encabezado}>
            <Ionicons name="heart-outline" size={18} color={colors.brand} />
            <AppText weight="bold">Queda, pero sin tu nombre</AppText>
          </View>
          {QUEDA.map((t) => (
            <AppText key={t} style={styles.item}>
              · {t}
            </AppText>
          ))}
        </Card>

        <Button
          title={borrando ? 'Borrando…' : 'Borrar mi cuenta'}
          variant="danger"
          icon="trash-outline"
          onPress={onBorrar}
          disabled={borrando}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  item: {
    marginBottom: spacing.xs,
  },
});

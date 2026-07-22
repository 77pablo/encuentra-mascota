import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUnread } from '../hooks/useUnread';
import { useAuth } from '../hooks/useAuth';
import { mensajeDe } from '../lib/requireAuth';
import { notify } from '../lib/notify';
import { AppText } from '../ui';
import { radius } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';

// Ícono de Mensajes para el encabezado de las pantallas principales (Inicio,
// Explorar, Adopción). Reemplaza a la vieja pestaña "Mensajes": muestra el badge
// de no leídos y abre la bandeja (registrada en el stack raíz como `Mensajes`).
// En modo invitado dispara el mismo portero que tenía la pestaña.
export default function MensajesButton() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const navigation = useNavigation<any>();
  const { count } = useUnread();
  const { session } = useAuth();

  const onPress = () => {
    if (!session) {
      notify(mensajeDe('contactar'));
      navigation.navigate('Register');
      return;
    }
    navigation.navigate('Mensajes');
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Mensajes"
    >
      <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.ink} />
      {count > 0 ? (
        <View style={styles.badge}>
          <AppText weight="bold" size={10} color={colors.white}>
            {count > 99 ? '99+' : count}
          </AppText>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const crearEstilos = (colors: Colors) => StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.lost,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

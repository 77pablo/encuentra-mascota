import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { getComunasSeguidas, seguirComuna, dejarDeSeguirComuna } from '../services/comunasSeguidas';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { notify } from '../lib/notify';
import { Button } from '../ui';
import { spacing } from '../theme';

// Botón "Avisarme de [comuna]" / "Siguiendo [comuna]". Extraído de la vieja
// `ComunidadScreen` para reusarlo en `ExplorarScreen` cuando hay un filtro de
// comuna puesto. Encapsula su propio estado `sigue`/`guardando` y el portero
// para invitados. La suscripción vive en `services/comunasSeguidas`.
export default function SeguirComunaButton({ comuna }: { comuna: string }) {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [sigue, setSigue] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!user) {
      setSigue(false);
      return;
    }
    let vivo = true;
    getComunasSeguidas(user.id)
      .then((cs) => {
        if (vivo) setSigue(cs.includes(comuna));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [user, comuna]);

  const toggleSeguir = async () => {
    if (!user) {
      notify('Creá una cuenta', 'Necesitás una cuenta para seguir comunas y recibir avisos.');
      navigation.navigate('Register');
      return;
    }
    setGuardando(true);
    try {
      if (sigue) {
        await dejarDeSeguirComuna(user.id, comuna);
        setSigue(false);
        notify('Listo', `Dejaste de seguir ${comuna}.`);
      } else {
        await seguirComuna(user.id, comuna);
        setSigue(true);
        notify('¡Listo!', `Te avisaremos de reportes nuevos en ${comuna}.`);
      }
    } catch (e: any) {
      notify('No se pudo guardar', mensajeDeErrorDb(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Button
      title={sigue ? `Siguiendo ${comuna}` : `Avisarme de ${comuna}`}
      icon={sigue ? 'notifications' : 'notifications-outline'}
      variant={sigue ? 'secondary' : 'primary'}
      onPress={toggleSeguir}
      loading={guardando}
      disabled={guardando}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: spacing.md,
  },
});

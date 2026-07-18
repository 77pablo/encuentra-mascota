import { useCallback } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from './useAuth';
import { AccionProtegida, mensajeDe } from '../lib/requireAuth';
import { notify } from '../lib/notify';

// El portero, del lado de la interfaz. Se usa como primera línea del manejador
// de cualquier acción protegida:
//
//   const requireAuth = useRequireAuth();
//   const contactar = () => {
//     if (!requireAuth('contactar')) return;
//     …
//   };
//
// Con sesión devuelve `true` y el llamador sigue con lo suyo. Sin sesión avisa
// con el texto propio de esa acción, empuja la pantalla de registro sobre el
// stack raíz y devuelve `false`.
//
// La intención se guarda en `volverA` (la ruta donde estaba el usuario y sus
// parámetros). Como el stack raíz ya no se remonta al cambiar la sesión, la
// vuelta se resuelve sacando la pantalla de auth de encima: debajo quedó
// intacta la pantalla exacta desde donde se disparó el portero, con su
// navegador anidado y su scroll. Ver `volverAtras` en `src/lib/authReturn.ts`.
export function useRequireAuth(): (accion: AccionProtegida) => boolean {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute();

  return useCallback(
    (accion: AccionProtegida) => {
      if (session) return true;
      notify(mensajeDe(accion));
      navigation.navigate('Register', {
        volverA: { name: route.name, params: route.params },
      });
      return false;
    },
    [session, navigation, route.name, route.params],
  );
}

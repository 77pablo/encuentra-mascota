import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
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
// La vuelta al origen NO necesita parámetros: como el stack raíz ya no se
// remonta al cambiar la sesión, alcanza con sacar la pantalla de auth de encima
// con `goBack` — debajo quedó intacta la pantalla exacta desde donde se disparó
// el portero, con su navegador anidado y su scroll. Ver `volverAtras` en
// `src/lib/authReturn.ts`. (Pasar la ruta como parámetro solo ensuciaba la URL
// de la web con `?volverA=[object Object]`.)
export function useRequireAuth(): (accion: AccionProtegida) => boolean {
  const { session } = useAuth();
  const navigation = useNavigation<any>();

  return useCallback(
    (accion: AccionProtegida) => {
      if (session) return true;
      notify(mensajeDe(accion));
      navigation.navigate('Register');
      return false;
    },
    [session, navigation],
  );
}

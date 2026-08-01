import { supabase } from '../lib/supabase';
import { RespuestaCierre } from '../lib/cierreCasos';

// CIERRE DE CASOS — el único camino de escritura de la respuesta "¿apareció?".
//
// Vive en su propio archivo y NO en `services/pets.ts` por dos razones: para no
// pelear el merge con las otras tareas de la tanda (el mismo criterio por el
// que `reunions.ts` está separado), y porque esto no es un update a `pets`
// sino una llamada a una RPC que hace tres cosas a la vez.
//
// NO recibe el id del usuario, y no es un olvido: el dueño sale de `auth.uid()`
// dentro de la función `security definer` (migración 0049). Si viajara como
// parámetro, cualquiera podría cerrar el reporte de otra persona — es el patrón
// de `mi_perfil()` y `anonimizar_mi_cuenta()`.
//
// TAMPOCO traga el error. La RPC lanza cuando no actualizó ninguna fila
// (reporte ajeno o inexistente) y cuando la migración no está aplicada
// (PGRST202). Las dos cosas tienen que llegar a la tarjeta para que se vean:
// que la app diga "listo" sin haber guardado nada es peor que el error mismo.
export async function responderEstado(petId: string, respuesta: RespuestaCierre): Promise<void> {
  const { error } = await supabase.rpc('responder_estado', {
    p_pet_id: petId,
    p_respuesta: respuesta,
  });
  if (error) throw error;
}

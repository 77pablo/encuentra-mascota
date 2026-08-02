import { supabase } from '../lib/supabase';
import { ErrorAmigable } from '../lib/dbErrors';

// Borrar la cuenta propia. Todo el trabajo pesado pasa en la Edge Function
// `delete-account`: borra las fotos, anonimiza los datos y borra el usuario de
// Auth, en ese orden. Desde acá solo la invocamos y traducimos el fallo.
export async function borrarMiCuenta(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });

  if (error) {
    // Si el fallo ocurrió después de borrar las fotos (ver el comentario en la
    // Edge Function), la cuenta queda viva y los reportes con imágenes rotas.
    // Por eso el mensaje empuja a reintentar en vez de sonar a "ya fue".
    throw new ErrorAmigable(
      // Sin "escribinos": no hay dónde todavía (`CORREO_CONTACTO` es null hasta
      // que haya dominio propio). Se ofrece la vía que SÍ existe sin cuenta: la
      // página pública de borrado, que Google exige y que ya está publicada.
      'No terminamos de borrar tu cuenta: sigue activa. Volvé a intentarlo en unos minutos; si sigue fallando, podés pedirlo desde la página de borrado del sitio.',
    );
  }
  // La función responde 200 con { ok: true }. Cualquier otra cosa es un fallo
  // que NO debemos tratar como éxito: si diéramos por borrada una cuenta que
  // sigue viva, la persona se iría creyendo que sus datos ya no están.
  if (!data?.ok) {
    throw new ErrorAmigable(
      'El borrado quedó a medias y tu cuenta sigue activa. Volvé a intentarlo, por favor.',
    );
  }
}

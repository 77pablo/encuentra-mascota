import { supabase } from '../lib/supabase';
import { normalizarSenas, type SenasPrivadas } from '../lib/senaPrivada';

// ACCESO A LA SEÑA SECRETA DE VERIFICACIÓN (migración 0047).
//
// Este es el ÚNICO archivo de la app que nombra `pet_senas_privadas`, y el
// guardián `__tests__/db/senasPrivadas.test.ts` lo verifica. Si mañana hace falta
// leer la seña desde otra pantalla, se pasa por acá; así hay un solo lugar donde
// mirar cuando se pregunte "¿esto se puede filtrar?".
//
// La seña NUNCA viaja en la misma consulta que las columnas de `pets`: es otra
// tabla y otra llamada. Además de la privacidad, eso es lo que hace que la app
// ande con la 0047 SIN aplicar — pedir una columna/tabla inexistente junto a las
// viejas haría fallar la consulta entera, y el reporte no cargaría en ninguna
// pantalla.

const TABLA = 'pet_senas_privadas';

// ¿El error es "la migración 0047 todavía no está aplicada"?
//   · 42P01  → undefined_table de Postgres.
//   · PGRST205 → PostgREST no encuentra la tabla en el cache de esquema.
// Mismo escalón de compatibilidad que `esColumnaFaltante` en services/moderation.ts.
function esTablaFaltante(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('could not find the table') || msg.includes('does not exist');
}

// Lee la seña del reporte. Devuelve null si no hay, si la 0047 no está aplicada,
// o si quien pregunta no es el dueño — este último caso no lo decide este código
// sino la RLS, que simplemente no devuelve la fila.
//
// NO TIRA NUNCA. Se llama desde adentro del chat: un corte de red no puede
// llevarse por delante la pantalla de mensajes por un extra.
export async function obtenerSenasPrivadas(petId: string): Promise<SenasPrivadas | null> {
  const { data, error } = await supabase
    .from(TABLA)
    .select('sena_1, sena_2')
    .eq('pet_id', petId)
    .maybeSingle();

  if (error) {
    // Sin migración es lo esperado: ni siquiera avisamos.
    if (!esTablaFaltante(error)) {
      console.warn(`obtenerSenasPrivadas: no se pudo leer la seña del reporte ${petId}:`, error.message);
    }
    return null;
  }
  if (!data) return null;
  return { sena1: data.sena_1 ?? null, sena2: data.sena_2 ?? null };
}

// Guarda (o borra) la seña del reporte.
//
// Devuelve `false` SOLO cuando la 0047 no está aplicada: es "la función todavía
// no existe", no un fracaso. Cualquier otro error SÍ se propaga, porque quien
// apretó Guardar tiene que enterarse de que no se guardó.
//
// Publicar un reporte no puede fallar por esto: `PublishScreen` lo llama después
// de crear el reporte y se come el error. Una mascota perdida importa más que un
// extra.
export async function guardarSenasPrivadas(
  petId: string,
  userId: string,
  sena1: string | null | undefined,
  sena2: string | null | undefined,
): Promise<boolean> {
  const { sena1: s1, sena2: s2 } = normalizarSenas(sena1, sena2);

  // Vaciar las dos casillas = borrar la seña. Se borra la FILA en vez de dejarla
  // con dos nulls: una fila vacía haría que la UI creyera que hay algo guardado.
  if (!s1 && !s2) {
    const { error } = await supabase.from(TABLA).delete().eq('pet_id', petId);
    if (error) {
      if (esTablaFaltante(error)) return false;
      throw error;
    }
    return true;
  }

  const { error } = await supabase
    .from(TABLA)
    .upsert({ pet_id: petId, user_id: userId, sena_1: s1, sena_2: s2 }, { onConflict: 'pet_id' });
  if (error) {
    if (esTablaFaltante(error)) return false;
    throw error;
  }
  return true;
}

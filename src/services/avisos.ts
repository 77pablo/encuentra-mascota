import { supabase } from '../lib/supabase';
import type { Aviso } from '../lib/avisosBandeja';

// CLIENTE DE LA BANDEJA DE AVISOS — RPC `mis_avisos()` (migración 0051).
//
// Este es el ÚNICO archivo de `src/` que lee la cola de avisos, y no lo hace
// contra la tabla: `notification_events` nace SIN policies (0011), o sea que es
// invisible para la app a propósito. La única puerta es la RPC `security
// definer`, y esa RPC NO recibe ningún parámetro de identidad: el destinatario
// sale de `auth.uid()` adentro de la base. Si acá apareciera un `p_user_id`,
// cualquiera podría leer la cola ajena.
//
// QUÉ HAY EN LA BANDEJA Y QUÉ NO: los avisos DIRIGIDOS (escaneo de collar,
// búsqueda guardada) y los que se resuelven por dueño del reporte (avistamiento,
// pista, coincidencia). Los de 'reporte_nuevo' NO: su destinatario se calcula
// por zona GPS y comuna seguida en el dispatcher, no está en la fila. El SQL de
// la 0051 lo explica largo, y la pantalla no promete que estén todos.
//
// NO DEVUELVE `[]` CUANDO FALLA. Es el bug que ya apareció cuatro veces en el
// repo: un error de lectura que se muestra como "no tenés nada" hace que la
// persona crea que no pasó nada. El error se propaga y la pantalla lo dice.

export type { Aviso } from '../lib/avisosBandeja';

// Cuántos avisos se piden por defecto. La base igual acota a 200 (`least`), así
// que este número solo decide cuánto trae la pantalla de una.
const LIMITE_POR_DEFECTO = 50;

export async function misAvisos(limite: number = LIMITE_POR_DEFECTO): Promise<Aviso[]> {
  const { data, error } = await supabase.rpc('mis_avisos', { p_limite: limite });
  if (error) throw error;
  return ((data ?? []) as Aviso[]).map((fila) => ({
    id: fila.id,
    tipo: fila.tipo,
    pet_id: fila.pet_id ?? null,
    // `datos` es `jsonb not null default '{}'` en la tabla, pero una fila vieja
    // o un cliente futuro pueden traer null: sin este coalesce, `textoDeAviso`
    // rompe y se cae la bandeja entera por UNA fila.
    datos: (fila.datos ?? {}) as Record<string, unknown>,
    creado_en: fila.creado_en,
  }));
}

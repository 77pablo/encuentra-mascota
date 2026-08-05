import { supabase } from '../lib/supabase';
import { ErrorAmigable } from '../lib/dbErrors';
import { difuminarUbicacion } from '../lib/difuminarUbicacion';
import { filtrarBloqueados, idsBloqueados } from './bloqueos';

export interface Sighting {
  id: string;
  pet_id: string;
  user_id: string;
  lat: number;
  lng: number;
  nota: string | null;
  foto: string | null;
  creado_en: string;
}

export interface NewSighting {
  pet_id: string;
  user_id: string;
  lat: number;
  lng: number;
  nota?: string | null;
  foto?: string | null;
  // true cuando lat/lng ya vienen difuminadas (ej. el pin no se movio del
  // punto inicial del reporte, que createPet ya difumino). Por defecto es
  // false: una coordenada "cruda" (GPS del usuario o un toque/arrastre en el
  // mapa) siempre se tiene que difuminar aca. Ver AddSightingScreen.
  yaDifuminado?: boolean;
}

// Registra un avistamiento ("lo vi acá") y devuelve la fila creada.
export async function addSighting(input: NewSighting): Promise<Sighting> {
  // Un avistamiento es la ubicacion de quien lo reporta y tiene el mismo
  // problema de privacidad que el reporte inicial: se difumina aca, al
  // escribir, y la coordenada exacta no se guarda en ninguna parte.
  //
  // Excepcion: si input.yaDifuminado es true, la coordenada que llego ya
  // esta difuminada (viene del pin inicial, que createPet ya movio ~250m) y
  // no se toca de nuevo. Difuminar una coordenada ya difuminada no arriesga
  // privacidad (nunca acerca al punto real), pero si degrada sin necesidad
  // la precision del rastro: dos difuminados independientes pueden sumar
  // error en la misma direccion y alejar el avistamiento mas de lo que
  // cualquiera de los dos haria solo.
  const { lat, lng } = input.yaDifuminado
    ? { lat: input.lat, lng: input.lng }
    : difuminarUbicacion({ lat: input.lat, lng: input.lng });
  const { data, error } = await supabase
    .from('sightings')
    .insert({
      pet_id: input.pet_id,
      user_id: input.user_id,
      lat,
      lng,
      nota: input.nota ?? null,
      foto: input.foto ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Sighting;
}

// Rastro de avistamientos de un reporte, del más reciente al más antiguo.
//
// Se ocultan los avistamientos de gente que bloquee. Decision de producto: se
// oculta el avistamiento entero (nota, firma y pin). El filtro es del CLIENTE
// (lista corta, sin cursor) y degrada a conjunto vacio si no hay sesion o la
// tabla 0022 todavia no existe.
//
// DESDE LA 0066 (tanda 14, area C) esta misma funcion la llama tambien
// `PublicPetScreen`, SIN SESION: el vecino que escanea el afiche. Dos cosas la
// hacen segura para ese caso sin tocar una linea:
//   · `idsBloqueados()` devuelve un conjunto vacio si no hay usuario logueado
//     (ver services/bloqueos.ts) — nunca lanza por falta de sesion — y
//     `filtrarBloqueados` con un conjunto vacio devuelve la lista tal cual.
//   · Contra una base SIN la 0066 aplicada, `anon` no tiene ninguna policy de
//     SELECT sobre `sightings`: la RLS no lanza error, devuelve 200 con 0
//     filas (el mismo silencio de siempre). La pantalla ve una lista vacia,
//     no un error, y se degrada sola.
// La fila que devuelve esta funcion SI trae `user_id` (la columna existe,
// la policy de la 0066 no filtra por columna). El autor del avistamiento
// nunca debe salir al DOM: quien renderiza esto (PetDetailScreen,
// PublicPetScreen) solo pinta `nota`/`lat`/`lng`, jamas `user_id` ni un
// nombre resuelto a partir de el — y no podria aunque quisiera, `profiles`
// sigue cerrado a `anon`.
export async function listSightings(petId: string): Promise<Sighting[]> {
  const [{ data, error }, bloqueados] = await Promise.all([
    supabase
      .from('sightings')
      .select('*')
      .eq('pet_id', petId)
      .order('creado_en', { ascending: false }),
    idsBloqueados(),
  ]);
  if (error) throw error;
  return filtrarBloqueados((data ?? []) as Sighting[], bloqueados, (s) => s.user_id);
}

// Borra un avistamiento (autor del avistamiento o dueño del reporte, según la
// RLS de 0007).
//
// Pedimos las filas borradas a propósito, igual que `borrarTip`: cuando la RLS
// rechaza un delete, PostgREST NO devuelve error, simplemente no borra nada.
// Sin este chequeo, una sesión vencida hacía que la pantalla dijera "listo",
// sacara el avistamiento de la lista y el dato siguiera ahí para todo el mundo.
export async function deleteSighting(id: string): Promise<void> {
  const { data, error } = await supabase.from('sightings').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new ErrorAmigable('No se pudo borrar el avistamiento.');
  }
}

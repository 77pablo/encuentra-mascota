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
// hacen segura para ese caso:
//   · `idsBloqueados()` devuelve un conjunto vacio si no hay usuario logueado
//     (ver services/bloqueos.ts) — nunca lanza por falta de sesion — y
//     `filtrarBloqueados` con un conjunto vacio devuelve la lista tal cual.
//   · Contra una base SIN la 0066 aplicada, `anon` no tiene ninguna policy de
//     SELECT sobre `sightings`: la RLS no lanza error, devuelve 200 con 0
//     filas (el mismo silencio de siempre). La pantalla ve una lista vacia,
//     no un error, y se degrada sola.
//
// SIN SESION, EL `select` PIDE SOLO LAS COLUMNAS QUE LA 0066 CONCEDE A
// `anon`: `id, pet_id, lat, lng, nota, creado_en`. Esto YA NO ES una
// convencion de "el renderer no lo pinta" — es un control real de Postgres.
// Desde la 0066, `anon` tiene un `revoke select` de tabla completa y un
// `grant select` por columna que deliberadamente deja afuera `user_id` y
// `foto` (ver el comentario de esa migracion: `user_id` deanonimiza al autor
// via el RPC publico `perfil_publico`, `foto` queda afuera porque
// `PublicPetScreen` no la renderiza). Un `select('*')` en este camino daria
// 42501 — no una fila con campos de mas, un error de permiso liso, porque
// pedir una columna sin privilegio de columna falla la consulta entera (la
// misma trampa que documenta `0064_vectores_de_foto.sql` para `embedding`).
// CON SESION, el `select('*')` de siempre sigue andando: el grant de
// `authenticated` no cambio, sigue siendo la tabla completa (incluido
// `user_id`, que esta misma funcion usa mas abajo para filtrar bloqueados).
export async function listSightings(petId: string): Promise<Sighting[]> {
  const conSesion = await haySesion();
  // Tipado explicito `string` (no el literal que TS infiere del ternario): sin
  // esto, postgrest-js intenta parsear el string de columnas A NIVEL DE TIPOS
  // para inferir la forma de la fila devuelta, y con una UNION de dos
  // literales (`'*' | 'id, pet_id, ...'`) ese parser falla para una de las dos
  // ramas (`ParserError`). Con `string` generico el resultado es
  // `GenericStringError[]` en vez de `Sighting[]` — mismo patron ya resuelto
  // en `listQuestions` (adoptionQuestions.ts) con un select dinamico: doble
  // cast `as unknown as Sighting[]`, no un cast directo (que TS rechaza por
  // "neither type sufficiently overlaps").
  const columnas: string = conSesion ? '*' : 'id, pet_id, lat, lng, nota, creado_en';
  const [{ data, error }, bloqueados] = await Promise.all([
    supabase
      .from('sightings')
      .select(columnas)
      .eq('pet_id', petId)
      .order('creado_en', { ascending: false }),
    idsBloqueados(),
  ]);
  if (error) throw error;
  return filtrarBloqueados((data ?? []) as unknown as Sighting[], bloqueados, (s) => s.user_id);
}

// ¿Hay una sesion abierta? Mismo patron tolerante que `idsBloqueados`
// (services/bloqueos.ts): si `getUser()` lanza (red caida, mock incompleto en
// un test que no le pega a auth) se toma como "sin sesion", nunca se
// propaga el error — esta funcion solo decide QUE COLUMNAS pedir, no debe
// poder romper la lectura del rastro.
async function haySesion(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    return Boolean(data?.user?.id);
  } catch {
    return false;
  }
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

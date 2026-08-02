import { supabase } from '../lib/supabase';
import { MyPetInput } from '../schemas/myPet';
import { rutaDeFotoPropia } from '../lib/rutaStorage';

// Una ficha "Mi mascota": registro permanente de una mascota (distinto de un
// reporte `pets`). Se registra una vez y sirve para pre-cargar un reporte
// "perdida" en un toque y para imprimir la placa de collar con QR.
export interface MyPet {
  id: string;
  user_id: string;
  nombre: string;
  especie: 'perro' | 'gato' | 'otro';
  raza: string | null;
  foto: string | null;
  senas: string | null;
  chip: string | null;
  // Token de 128 bits generado en el servidor (default de la 0027). Es la clave
  // pública del QR: nunca se fija desde el cliente.
  collar_token: string;
  creado_en: string;
  // Carnet "Mi mascota" (Función 6, migración 0034): edad + próximas dosis.
  // Todas opcionales; `null` cuando el dueño no las cargó. `select('*')` ya se
  // usaba antes de la 0034, así que estas columnas nuevas no rompen la
  // consulta si la migración todavía no está aplicada (PostgREST simplemente
  // no las devuelve).
  fecha_nacimiento: string | null;
  vacuna_proxima: string | null;
  antiparasitario_interno_proximo: string | null;
  antiparasitario_externo_proximo: string | null;
}

// Los opcionales vacíos se guardan como null, no como cadena vacía: una seña
// "" no aporta nada y ensucia la base. `undefined` y '' colapsan a null.
function limpio(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}

export async function listMyPets(userId: string): Promise<MyPet[]> {
  const { data, error } = await supabase
    .from('my_pets')
    .select('*')
    .eq('user_id', userId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyPet[];
}

// ------------------------------------------------------------
// EL CHIP DE LA FICHA, PARA PRE-CARGAR UN REPORTE (0054)
//
// Los únicos usuarios de los que tenemos el chip con certeza son los que
// registraron una ficha "Mi mascota" —la 0027 ya lo guarda y las guías les dicen
// que lo tengan a mano—, y hasta acá publicaban SIN él: el motor de la 0054
// arrancaba con su señal más fuerte apagada justo donde el dato ya existía.
//
// POR QUÉ UNA LECTURA Y NO UN PARÁMETRO DE NAVEGACIÓN. `MyPetsScreen` tiene la
// ficha entera en memoria, chip incluido, así que mandarlo en el `navigate` era
// una línea. Pero los params de navegación se serializan en la URL en la versión
// web y quedan en el historial del navegador: el dato más sensible del proyecto
// —el que prueba de quién es el animal y con el que se puede intentar
// re-registrarlo a nombre de otro— terminaría escrito en la barra de direcciones.
// Por eso viaja el id de la ficha y el chip se lee de nuevo acá, por el mismo
// camino que ya usa la pantalla: la tabla, cerrada por RLS al dueño.
// ------------------------------------------------------------

/** Lo que tiene la ficha, o `null` si NO SE PUDO SABER. */
export type LecturaChipFicha = { chip: string | null };

/**
 * Lee el chip de una ficha "Mi mascota".
 *
 * Tres estados a propósito, los mismos que `leerChip` (services/petChip.ts):
 * `{ chip: '985…' }` hay uno, `{ chip: null }` se leyó y no hay ninguno, y
 * `null` no se pudo leer (sin red, sin permiso, sesión caída).
 *
 * La fila que no vuelve cuenta como "no se pudo": la ficha existe —venimos de
 * tocar su botón—, así que si la RLS no la devuelve es que no pudimos verla, no
 * que la mascota no tenga chip. Confundirlas es la trampa de siempre en este
 * repo, solo que acá al revés: la pantalla mostraría el campo vacío sin decir
 * nada y la persona publicaría creyendo que su chip viajó.
 *
 * NO TIRA NUNCA: publicar una mascota perdida no puede fallar por un extra.
 */
export async function leerChipDeFicha(fichaId: string): Promise<LecturaChipFicha | null> {
  // Solo la columna que hace falta. Nada de `select('*')`: el resto de la ficha
  // ya viajó por params y no queremos traer de vuelta lo que no vamos a usar.
  const { data, error } = await supabase
    .from('my_pets')
    .select('chip')
    .eq('id', fichaId)
    .maybeSingle();
  if (error) {
    // El número JAMÁS entra al log: se registra que falló y cuál ficha, no el dato.
    console.warn(`leerChipDeFicha: no se pudo leer la ficha ${fichaId}:`, error.message);
    return null;
  }
  if (!data) return null;
  return { chip: ((data as { chip?: string | null }).chip ?? null) as string | null };
}

// Fechas del carnet (Función 6): camelCase en el lado JS, mapeadas a las
// columnas snake_case de la migración 0034. Todas opcionales; `null`/`undefined`
// se guardan como `null` (nada cargado).
export interface CarnetInput {
  fechaNacimiento?: string | null;
  vacunaProxima?: string | null;
  antiparasitarioInternoProximo?: string | null;
  antiparasitarioExternoProximo?: string | null;
}

export async function createMyPet(
  input: MyPetInput,
  foto: string | null,
  userId: string,
  carnet: CarnetInput = {},
): Promise<MyPet> {
  // NO se envía `collar_token`: lo genera el servidor con su default (128 bits),
  // para que el cliente no pueda fijarlo.
  const { data, error } = await supabase
    .from('my_pets')
    .insert({
      user_id: userId,
      nombre: input.nombre.trim(),
      especie: input.especie,
      raza: limpio(input.raza),
      senas: limpio(input.senas),
      chip: limpio(input.chip),
      foto: limpio(foto),
      fecha_nacimiento: carnet.fechaNacimiento ?? null,
      vacuna_proxima: carnet.vacunaProxima ?? null,
      antiparasitario_interno_proximo: carnet.antiparasitarioInternoProximo ?? null,
      antiparasitario_externo_proximo: carnet.antiparasitarioExternoProximo ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MyPet;
}

// Campos editables de una ficha. La foto se maneja aparte (se sube y se pasa la
// URL); el resto sale del formulario.
export interface MyPetUpdate {
  nombre?: string;
  especie?: 'perro' | 'gato' | 'otro';
  raza?: string | null;
  senas?: string | null;
  chip?: string | null;
  foto?: string | null;
  fechaNacimiento?: string | null;
  vacunaProxima?: string | null;
  antiparasitarioInternoProximo?: string | null;
  antiparasitarioExternoProximo?: string | null;
}

export async function updateMyPet(id: string, fields: MyPetUpdate): Promise<void> {
  // Normalizamos los opcionales de texto a null igual que en el alta.
  const payload: Record<string, unknown> = {};
  if (fields.nombre !== undefined) payload.nombre = fields.nombre.trim();
  if (fields.especie !== undefined) payload.especie = fields.especie;
  if (fields.raza !== undefined) payload.raza = limpio(fields.raza);
  if (fields.senas !== undefined) payload.senas = limpio(fields.senas);
  if (fields.chip !== undefined) payload.chip = limpio(fields.chip);
  if (fields.foto !== undefined) payload.foto = limpio(fields.foto);
  if (fields.fechaNacimiento !== undefined) payload.fecha_nacimiento = fields.fechaNacimiento;
  if (fields.vacunaProxima !== undefined) payload.vacuna_proxima = fields.vacunaProxima;
  if (fields.antiparasitarioInternoProximo !== undefined) {
    payload.antiparasitario_interno_proximo = fields.antiparasitarioInternoProximo;
  }
  if (fields.antiparasitarioExternoProximo !== undefined) {
    payload.antiparasitario_externo_proximo = fields.antiparasitarioExternoProximo;
  }

  const { error } = await supabase.from('my_pets').update(payload).eq('id', id);
  if (error) throw error;
}

// Borra la ficha y, con ella, su foto del bucket público. Mismo orden y criterio
// que `deletePet`: primero se lee la ruta, después se borra de Storage y al final
// la fila. Si Storage falla, la fila se borra igual (estado malo visible > la
// persona sin poder borrar su ficha).
export async function deleteMyPet(id: string, userId: string): Promise<void> {
  const { data: fila, error: errLectura } = await supabase
    .from('my_pets')
    .select('foto')
    .eq('id', id)
    .maybeSingle();
  if (errLectura) {
    console.warn(
      `deleteMyPet: no se pudo leer la foto de la ficha ${id} antes de borrarla (se borra igual):`,
      errLectura.message,
    );
  }

  const ruta = fila?.foto ? rutaDeFotoPropia(fila.foto as string, userId) : null;
  if (ruta) {
    const { error: errStorage } = await supabase.storage.from('pet-photos').remove([ruta]);
    if (errStorage) console.warn('No se pudo borrar la foto de la ficha:', errStorage.message);
  }

  const { error } = await supabase.from('my_pets').delete().eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------
// LECTURA PÚBLICA POR COLLAR (RPCs de la 0027)
//
// Estas dos funciones son la ÚNICA vía pública para tocar una ficha, y pasan por
// las RPCs `security definer` que filtran columnas. Nunca leen la tabla directo.
// ------------------------------------------------------------

// Lo que la página pública del collar puede ver. Nunca trae user_id, contacto,
// chip ni señas: la RPC no los devuelve.
export interface MascotaCollar {
  nombre: string;
  especie: 'perro' | 'gato' | 'otro';
  foto: string | null;
  // id del reporte perdido activo vinculado, o null si la mascota no está
  // reportada como perdida ahora mismo.
  reporte_perdida_id: string | null;
}

// Resuelve una ficha por su token de collar. `null` si el token no existe
// (indistinguible de "no existe", a propósito).
export async function mascotaPorCollar(token: string): Promise<MascotaCollar | null> {
  const { data, error } = await supabase.rpc('mascota_por_collar', { p_token: token });
  if (error) throw error;
  const filas = (data ?? []) as MascotaCollar[];
  return filas.length > 0 ? filas[0] : null;
}

// Encola un aviso al dueño de la ficha ("alguien vio a tu mascota"). El que
// escanea puede ser anónimo. La RPC no devuelve nada y aplica su propio
// rate-limit; un token inexistente no da error (no se filtra existencia).
export async function avisarEscaneoCollar(
  token: string,
  nota: string | null,
  lat: number | null,
  lng: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('avisar_escaneo_collar', {
    p_token: token,
    p_nota: nota,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw error;
}

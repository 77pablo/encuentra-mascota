// Traduce los errores que devuelve Postgres/PostgREST a algo que se entienda.
//
// Con la validación del servidor (migración 0016), un texto demasiado largo o un
// dato fuera de rango ya no se guarda — pero el error que vuelve es del estilo
// «new row for relation "pets" violates check constraint "pets_descripcion_largo"».
// Eso no se le muestra a nadie.
//
// Igual que en `authErrors.ts`: si no reconocemos el error, damos un mensaje
// genérico en español. NUNCA se filtra el texto original.

// Nombre de la restricción -> qué decirle a la persona.
const POR_RESTRICCION: Record<string, string> = {
  busquedas_guardadas_comuna_largo: 'La comuna es muy larga (máximo 80 caracteres).',
  pets_descripcion_largo: 'La descripción es muy larga. Contá las señas en menos de 1.000 caracteres.',
  pets_nombre_largo: 'El nombre de la mascota es muy largo (máximo 60 caracteres).',
  pets_raza_largo: 'La raza es muy larga (máximo 60 caracteres).',
  pets_recompensa_largo: 'La recompensa es muy larga (máximo 100 caracteres).',
  pets_lat_rango: 'La ubicación no parece válida. Volvé a marcar el punto en el mapa.',
  pets_lng_rango: 'La ubicación no parece válida. Volvé a marcar el punto en el mapa.',
  pets_fotos_cantidad: 'Podés subir hasta 4 fotos.',
  pets_fotos_largo: 'Hubo un problema con las fotos. Probá subirlas de nuevo.',
  pets_final_feliz_largo: 'La nota del reencuentro es muy larga (máximo 500 caracteres).',
  pets_final_foto_largo: 'Hubo un problema con la foto. Probá subirla de nuevo.',
  pet_tips_texto_largo: 'La pista es muy larga: máximo 500 caracteres.',
  pet_updates_texto_largo: 'La novedad es muy larga (máximo 1.000 caracteres).',
  sightings_nota_largo: 'La nota es muy larga (máximo 500 caracteres).',
  sightings_foto_largo: 'Hubo un problema con la foto. Probá subirla de nuevo.',
  sightings_lat_rango: 'El punto que marcaste no parece válido.',
  sightings_lng_rango: 'El punto que marcaste no parece válido.',
  // Desde la 0038 (mensajes solo-foto) reemplaza al viejo constraint
  // `messages_texto_largo`, que esa migración dropeó.
  messages_texto_o_imagen: 'El mensaje es muy largo, o le falta texto y foto.',
  profiles_nombre_largo: 'El nombre es muy largo (máximo 60 caracteres).',
  profiles_telefono_largo: 'El teléfono es muy largo.',
  profiles_red_social_largo: 'El enlace de tu red social es muy largo.',
  profiles_foto_largo: 'Hubo un problema con la foto de perfil. Probá subirla de nuevo.',
  alert_zones_radio_rango: 'Ese radio no es válido. Elegí uno de los que ofrece la app.',
  alert_zones_lat_rango: 'La zona no parece válida. Volvé a marcar tu ubicación.',
  alert_zones_lng_rango: 'La zona no parece válida. Volvé a marcar tu ubicación.',
  // Preguntas públicas de adopción (migración 0032).
  adoption_questions_pregunta_largo: 'La pregunta es muy larga (máximo 500 caracteres).',
  adoption_questions_respuesta_largo: 'La respuesta es muy larga (máximo 1.000 caracteres).',
  // Carnet de "Mi mascota" (migración 0034): fechas fuera del rango sano.
  my_pets_nacimiento_rango: 'La fecha de nacimiento no parece válida.',
  my_pets_vacuna_rango: 'La fecha de la próxima vacuna no parece válida.',
  my_pets_antiint_rango: 'La fecha del próximo antiparasitario interno no parece válida.',
  my_pets_antiext_rango: 'La fecha del próximo antiparasitario externo no parece válida.',
  // Búsquedas guardadas repetidas (migración 0031): índice único.
  busquedas_guardadas_unicas: 'Ya tenés guardada esa búsqueda.',
};

// Fragmentos que aparecen en el mensaje, para lo que no tiene nombre de
// restricción (errores de RLS, límites de nuestros triggers, red).
const POR_TEXTO: { contiene: string; mensaje: string }[] = [
  {
    contiene: 'límite de publicaciones',
    mensaje: 'Alcanzaste el límite de publicaciones por ahora. Probá de nuevo en un rato.',
  },
  {
    contiene: 'muchas pistas',
    mensaje: 'Dejaste muchas pistas por ahora. Probá de nuevo en un rato.',
  },
  {
    contiene: 'row-level security',
    mensaje: 'No tenés permiso para hacer eso.',
  },
  {
    contiene: 'violates foreign key',
    mensaje: 'Ese contenido ya no existe. Volvé atrás y actualizá la pantalla.',
  },
  {
    contiene: 'duplicate key',
    mensaje: 'Eso ya estaba registrado.',
  },
  {
    contiene: 'failed to fetch',
    mensaje: 'No pudimos conectarnos. Revisá tu internet e intentá de nuevo.',
  },
  {
    contiene: 'network',
    mensaje: 'No pudimos conectarnos. Revisá tu internet e intentá de nuevo.',
  },
];

export const MENSAJE_GENERICO_DB = 'Algo no salió bien. Probá de nuevo en un momento.';

// Contexto opcional de la acción que falló. Sirve para darle a un error de
// PERMISO (42501) un texto que se entienda sin revelar el motivo real.
//
// Hoy solo existe 'mensaje', y no es un detalle cosmético: la RLS de la 0022
// rechaza el insert en `messages` con 42501 tanto cuando la otra persona te
// bloqueó a vos como cuando vos la bloqueaste a ella (y también si borró su
// cuenta). El genérico "No tenés permiso para hacer eso" suena a error de la
// app; y cualquier texto más específico ("te bloqueó") sería revelar un dato
// privado de quien bloquea y armar al acosador. Por eso el texto es neutro y
// simétrico: no se puede deducir cuál de los tres casos es.
export type ContextoError = 'mensaje';

const MENSAJE_POR_CONTEXTO: Record<ContextoError, string> = {
  mensaje: 'No se pudo enviar el mensaje a esta persona.',
};

// ¿Es un rechazo de permisos de Postgres/PostgREST? Se mira el código primero
// (`42501` = insufficient_privilege) y, si no viene, el texto: PostgREST a veces
// devuelve la violación de RLS sin código en `code`.
function esPermisoDenegado(codigo: string, crudo: string): boolean {
  if (codigo === '42501') return true;
  const t = crudo.toLowerCase();
  return t.includes('row-level security') || t.includes('permission denied');
}

// ¿El error es "esa columna no existe en la base"?
//
// Sirve para una sola cosa: degradar cuando una migración todavía no está
// aplicada. PostgREST no guarda filas parciales ni devuelve datos parciales —
// si el insert menciona una columna que la base no tiene, rebota la operación
// ENTERA. Sin esto, una columna nueva rompe la función central de la app en
// cualquier base sin migrar (es el hermano del reintento sin `eliminado_en` de
// services/messages.ts).
//
// Se exige que el error hable de ESA columna: si el que falta es otro campo,
// reintentar sin la nuestra no arregla nada y encima esconde el problema real.
// Y se exige un motivo de "no existe", para no confundirlo con un check
// constraint que también lleva el nombre de la columna adentro.
export function esColumnaFaltante(error: unknown, columna: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const crudo = 'message' in error ? String((error as { message: unknown }).message ?? '') : '';
  const normalizado = crudo.toLowerCase();
  if (!normalizado.includes(columna.toLowerCase())) return false;
  const codigo = 'code' in error ? String((error as { code: unknown }).code ?? '') : '';
  // PGRST204 = PostgREST no la encontró en su caché de esquema.
  // 42703     = undefined_column, el error crudo de Postgres.
  if (codigo === 'PGRST204' || codigo === '42703') return true;
  // Algunas respuestas llegan sin `code`: queda el texto.
  return normalizado.includes('does not exist') || normalizado.includes('schema cache');
}

// Errores que escribimos nosotros y que YA están redactados para el usuario
// (por ejemplo "Este reporte ya no está disponible"). Sin esta marca, el
// traductor no los reconocería y los reemplazaría por el mensaje genérico,
// que dice bastante menos.
export class ErrorAmigable extends Error {}

// ¿Este error es "la migración todavía no está aplicada"?
//
// El dueño publica la web antes de correr el SQL, así que toda función nueva
// tiene que saber apagarse sola. Los códigos se comprobaron contra el PostgREST
// del proyecto real (1-ago-2026): una tabla que no existe devuelve 404 con
// PGRST205 ("Could not find the table 'public.x' in the schema cache") y una
// función que no existe, 404 con PGRST202. Desde adentro de la base (sin pasar
// por el schema cache) los códigos crudos son 42P01 y 42883.
//
// Deliberadamente ESTRECHO. Un corte de red, un 42501 de RLS o una COLUMNA que
// falta (42703) NO entran acá: si entraran, la sección desaparecería en
// silencio y nadie se enteraría de que hay algo roto que reintentar.
const CODIGOS_SIN_MIGRACION = new Set(['PGRST205', 'PGRST202', '42P01', '42883']);

export function esMigracionSinAplicar(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const codigo = 'code' in error ? String((error as { code: unknown }).code ?? '') : '';
  return CODIGOS_SIN_MIGRACION.has(codigo);
}

export function mensajeDeErrorDb(error: unknown, contexto?: ContextoError): string {
  if (error instanceof ErrorAmigable) return error.message;

  const crudo =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message ?? '')
        : '';
  const codigo =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code ?? '')
      : '';

  // Permiso denegado CON contexto: gana sobre todo lo demás. Va antes que el
  // barrido por texto para que no lo pise el 'row-level security' genérico.
  if (contexto && esPermisoDenegado(codigo, crudo)) return MENSAJE_POR_CONTEXTO[contexto];

  // Primero por nombre de restricción: es lo más preciso, porque nos deja decir
  // exactamente qué campo se pasó de largo.
  for (const [restriccion, mensaje] of Object.entries(POR_RESTRICCION)) {
    if (crudo.includes(restriccion)) return mensaje;
  }

  const normalizado = crudo.toLowerCase();
  const regla = POR_TEXTO.find((r) => normalizado.includes(r.contiene));
  return regla ? regla.mensaje : MENSAJE_GENERICO_DB;
}

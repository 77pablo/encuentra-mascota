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
  messages_texto_largo: 'El mensaje es muy largo (máximo 2.000 caracteres).',
  profiles_nombre_largo: 'El nombre es muy largo (máximo 60 caracteres).',
  profiles_telefono_largo: 'El teléfono es muy largo.',
  profiles_red_social_largo: 'El enlace de tu red social es muy largo.',
  profiles_foto_largo: 'Hubo un problema con la foto de perfil. Probá subirla de nuevo.',
  alert_zones_radio_rango: 'Ese radio no es válido. Elegí uno de los que ofrece la app.',
  alert_zones_lat_rango: 'La zona no parece válida. Volvé a marcar tu ubicación.',
  alert_zones_lng_rango: 'La zona no parece válida. Volvé a marcar tu ubicación.',
  // Anti-spam (migraciones 0002 y 0012): la clave única de denuncias.
  denuncias_pet_id_reporter_user_key: 'Ya denunciaste este reporte. Lo estamos revisando.',
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

// Errores que escribimos nosotros y que YA están redactados para el usuario
// (por ejemplo "Este reporte ya no está disponible"). Sin esta marca, el
// traductor no los reconocería y los reemplazaría por el mensaje genérico,
// que dice bastante menos.
export class ErrorAmigable extends Error {}

export function mensajeDeErrorDb(error: unknown): string {
  if (error instanceof ErrorAmigable) return error.message;

  const crudo =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message ?? '')
        : '';

  // Primero por nombre de restricción: es lo más preciso, porque nos deja decir
  // exactamente qué campo se pasó de largo.
  for (const [restriccion, mensaje] of Object.entries(POR_RESTRICCION)) {
    if (crudo.includes(restriccion)) return mensaje;
  }

  const normalizado = crudo.toLowerCase();
  const regla = POR_TEXTO.find((r) => normalizado.includes(r.contiene));
  return regla ? regla.mensaje : MENSAJE_GENERICO_DB;
}

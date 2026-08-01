// El "portero" del modo invitado: la app se puede recorrer entera sin cuenta,
// pero las acciones que escriben en la base o hablan con otra persona piden
// registro. Los textos viven acá, en un mapa único, para que todos suenen
// parejos y con el mismo tono cálido de la app.

export type AccionProtegida =
  | 'contactar'
  | 'publicar'
  | 'guardar'
  | 'dejar_pista'
  | 'avistamiento'
  | 'novedad'
  | 'denunciar'
  | 'bloquear'
  | 'reencuentro'
  | 'preguntar_adopcion'
  | 'guardar_busqueda'
  | 'cuadrilla';

export const MENSAJES: Record<AccionProtegida, string> = {
  contactar: 'Creá tu cuenta para escribirle al dueño',
  publicar: 'Creá tu cuenta para publicar un reporte',
  guardar: 'Creá tu cuenta para guardar este reporte',
  dejar_pista: 'Creá tu cuenta para dejar una pista',
  avistamiento: 'Creá tu cuenta para avisar que la viste',
  novedad: 'Creá tu cuenta para contar una novedad',
  denunciar: 'Creá tu cuenta para denunciar este reporte',
  // El bloqueo es una fila con tu id como `bloqueador` (tabla `bloqueos`, 0022):
  // sin cuenta no hay a quién anclarlo. El texto vivía repetido a mano en las
  // pantallas; acá suena parejo con el resto.
  bloquear: 'Creá tu cuenta para bloquear a esta persona',
  reencuentro: 'Creá tu cuenta para marcar el reencuentro',
  preguntar_adopcion: 'Creá tu cuenta para preguntarle a quien la publicó',
  guardar_busqueda: 'Creá tu cuenta para guardar esta búsqueda y recibir avisos',
  // Sumarse a una cuadrilla deja estado compartido: una tarea tomada por
  // "alguien" no se le puede sacar y nadie sabe a quién recordarle. Por eso
  // pide cuenta (ver el comentario largo de la migración 0048).
  cuadrilla: 'Creá tu cuenta para sumarte a buscar',
};

export function mensajeDe(accion: AccionProtegida): string {
  return MENSAJES[accion];
}

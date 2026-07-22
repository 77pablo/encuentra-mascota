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
  | 'reencuentro'
  | 'preguntar_adopcion'
  | 'guardar_busqueda';

export const MENSAJES: Record<AccionProtegida, string> = {
  contactar: 'Creá tu cuenta para escribirle al dueño',
  publicar: 'Creá tu cuenta para publicar un reporte',
  guardar: 'Creá tu cuenta para guardar este reporte',
  dejar_pista: 'Creá tu cuenta para dejar una pista',
  avistamiento: 'Creá tu cuenta para avisar que la viste',
  novedad: 'Creá tu cuenta para contar una novedad',
  denunciar: 'Creá tu cuenta para denunciar este reporte',
  reencuentro: 'Creá tu cuenta para marcar el reencuentro',
  preguntar_adopcion: 'Creá tu cuenta para preguntarle a quien la publicó',
  guardar_busqueda: 'Creá tu cuenta para guardar esta búsqueda y recibir avisos',
};

export function mensajeDe(accion: AccionProtegida): string {
  return MENSAJES[accion];
}

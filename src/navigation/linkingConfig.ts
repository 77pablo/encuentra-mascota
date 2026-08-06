// Rutas publicas alcanzables por link/QR SIN sesion. Viven en su propio
// modulo (y no adentro de RootNavigator) porque ademas del NavigationContainer
// las consume src/lib/deepLinks.ts para saltear el onboarding cuando alguien
// llega por un link: derivar de un unico objeto garantiza que una ruta
// publica nueva quede cubierta sola, sin lista paralela que se desincronice
// (los tests importan ESTE objeto, no una copia).
export const linkingScreens: Record<string, string> = {
  // Link compartido de un reporte.
  MascotaPublica: 'mascota/:id',
  // Pagina publica del collar (Funcion 2). Se abre por el QR de la placa,
  // en modo invitado, igual que MascotaPublica.
  Collar: 'collar/:token',
  // Detalle publico de una publicacion de adopcion, mismo trato que
  // MascotaPublica/Collar: alcanzable por link compartido sin sesion.
  AdopcionDetail: 'adopcion/:id',
  // Invitacion a la cuadrilla (Tanda 10). El link llega por WhatsApp y se
  // abre en modo invitado: la vista previa es anonima a proposito (grant a
  // `anon` en la 0048). Sumarse si pide cuenta.
  Cuadrilla: 'cuadrilla/:token',
};

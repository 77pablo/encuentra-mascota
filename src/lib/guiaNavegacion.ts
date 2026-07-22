// Resuelve cómo navegar desde el CTA de una guía que vive en el stack RAÍZ
// (GuiaPerdida, GuiaEncontrada): los destinos son de dos clases.
//   · TABS anidados dentro de 'App' ('Publicar', 'Explorar'): hace falta
//     navegación anidada ABSOLUTA (`navigate('App', { screen, params })`),
//     porque `navigate(name)` burbujea hacia el padre, nunca hacia los
//     descendientes.
//   · Pantallas del stack RAÍZ ('Ayuda'): son hermanas de 'App', se navegan
//     por nombre pelado (burbujean hasta el raíz donde están registradas).
// Mismo criterio que ya usa GuiaPerdidaScreen; acá queda como función pura y
// testeada para reusarla en GuiaEncontradaScreen sin duplicar la lista.
export const TABS_ANIDADOS = ['Publicar', 'Explorar'] as const;

export interface NavegacionResuelta {
  name: string;
  params?: Record<string, unknown>;
}

export function resolverNavegacionGuia(
  ruta: string,
  params?: Record<string, unknown>,
): NavegacionResuelta {
  if ((TABS_ANIDADOS as readonly string[]).includes(ruta)) {
    return { name: 'App', params: { screen: ruta, params } };
  }
  return { name: ruta, params };
}

import { createNavigationContainerRef } from '@react-navigation/native';
import type { DestinoRuta } from './rutaANavegacion';

// Referencia de navegación fuera de componentes: patrón oficial de React
// Navigation (https://reactnavigation.org/docs/navigating-without-navigation-prop/).
// La usa el listener de push (pushSetup.ts) para navegar cuando se toca una
// notificación, sin depender de estar dentro del árbol de React. Se conecta
// con `ref={navigationRef}` en el `NavigationContainer` de RootNavigator.
export const navigationRef = createNavigationContainerRef();

// Destino pendiente de un push tocado en frío (app cerrada o recién
// arrancando): el listener de notificaciones (pushSetup.ts) se puede disparar
// ANTES de que el NavigationContainer termine de montar y `navigationRef`
// quede listo — de hecho es el caso MÁS común al tocar una notificación,
// porque abre la app desde cero. Antes ese toque se descartaba en silencio.
// En vez de perderlo, se guarda acá (variable de módulo, no estado de React,
// para no depender de ningún componente montado) y RootNavigator lo consume
// en el `onReady` del NavigationContainer.
let destinoPendiente: DestinoRuta | null = null;

export function guardarDestinoPendiente(destino: DestinoRuta): void {
  destinoPendiente = destino;
}

// Devuelve el destino pendiente y lo limpia en el mismo paso (se consume una
// única vez): si no hubiera limpieza, un `onReady` posterior por otro motivo
// (p.ej. remonte al cerrar sesión) volvería a navegar al mismo destino viejo.
export function consumirDestinoPendiente(): DestinoRuta | null {
  const destino = destinoPendiente;
  destinoPendiente = null;
  return destino;
}

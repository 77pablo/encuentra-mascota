import { createNavigationContainerRef } from '@react-navigation/native';

// Referencia de navegación fuera de componentes: patrón oficial de React
// Navigation (https://reactnavigation.org/docs/navigating-without-navigation-prop/).
// La usa el listener de push (pushSetup.ts) para navegar cuando se toca una
// notificación, sin depender de estar dentro del árbol de React. Se conecta
// con `ref={navigationRef}` en el `NavigationContainer` de RootNavigator.
export const navigationRef = createNavigationContainerRef();

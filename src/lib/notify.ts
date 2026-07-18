import { Alert, Platform } from 'react-native';

// Muestra un aviso al usuario. En web usa window.alert (Alert.alert de
// react-native-web no hace nada); en móvil usa Alert.alert nativo.
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

// Pide confirmación al usuario antes de una acción destructiva. Resuelve
// `true` si confirma, `false` si cancela. En web usa window.confirm; en
// móvil usa Alert.alert con dos botones.
export function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

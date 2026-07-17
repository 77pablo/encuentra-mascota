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

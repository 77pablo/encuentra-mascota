// Vuelta después de entrar o registrarse.
//
// El stack raíz monta el TabNavigator siempre, con o sin sesión, y ya no se
// remonta cuando la sesión cambia. Eso permite algo mejor que navegar por
// nombre a la pantalla de origen (que sería frágil: las pantallas viven en
// navegadores anidados que el stack raíz no conoce): basta con sacar la
// pantalla de auth de encima. Debajo quedó, intacta, la pantalla exacta desde
// donde el usuario disparó el portero.
//
// Si no hay nada debajo (alguien abrió la app directo en Login), no hacemos
// nada: la propia desaparición de la pantalla la resuelve quien llama.
export function volverAtras(navigation: { canGoBack: () => boolean; goBack: () => void }): boolean {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return true;
  }
  return false;
}

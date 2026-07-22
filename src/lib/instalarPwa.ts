import { Platform } from 'react-native';

// Todo lo que hace falta para ofrecer "instalar la app" como PWA. Web-only a
// propósito (Platform.OS === 'web'): en nativo (donde la app ya se instala
// desde la tienda) todas las funciones son no-ops que devuelven false, así el
// resto de la UI puede llamarlas sin preguntar antes en qué plataforma está.
//
// Estado interno: el evento 'beforeinstallprompt' que Chrome/Android disparan
// se guarda en este módulo (no se puede volver a pedir una vez usado ni
// recrear a mano), para dispararlo más tarde con el clic del usuario en
// nuestra propia tarjeta en vez del mini-infobar del navegador.
let promptGuardado: any = null;

// Flag para hacer idempotente capturarPromptInstalacion(): evita agregar
// listeners múltiples cuando se llama varias veces.
let capturado = false;

// Handler nombrado para 'beforeinstallprompt', usado por capturarPromptInstalacion.
function manejarBeforeInstallPrompt(evento: any): void {
  // Sin esto el navegador muestra su propio mini-infobar de instalación;
  // preferimos ofrecerlo nosotros, en nuestra propia tarjeta/momento.
  evento.preventDefault?.();
  promptGuardado = evento;
}

// Engancha el listener de 'beforeinstallprompt'. Se llama una sola vez, lo
// antes posible (p. ej. al montar la navegación raíz). No-op fuera de web o
// si el navegador no dispara el evento (iOS/Safari: nunca lo dispara).
// Idempotente: llamadas repetidas no agregan listeners duplicados.
export function capturarPromptInstalacion(): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  if (capturado) return; // Ya se registró el listener.
  capturado = true;
  window.addEventListener('beforeinstallprompt', manejarBeforeInstallPrompt);
}

// (interno) Reset para tests: permite limpiar el estado de captura entre
// ejecuciones de suite sin forzar a resetModules.
export function _resetParaTests(): void {
  promptGuardado = null;
  capturado = false;
}

// true si hay un prompt de instalación listo para mostrarse (Android/Chrome
// con Edge/Opera similares). En iOS siempre es false: ahí no existe este
// evento y la UI debe ofrecer el modal de instrucciones manuales en su lugar.
export function puedeInstalar(): boolean {
  if (Platform.OS !== 'web') return false;
  return promptGuardado !== null;
}

export type ResultadoInstalacion = 'aceptada' | 'rechazada' | 'no-disponible';

// Dispara el prompt nativo guardado. El navegador solo permite usarlo una vez
// por evento capturado, así que se limpia de inmediato (si el usuario quiere
// verlo de nuevo, tendrá que recargar para que el navegador lo vuelva a
// ofrecer, tal cual como pasaría con el mini-infobar nativo).
export async function pedirInstalacion(): Promise<ResultadoInstalacion> {
  if (Platform.OS !== 'web' || !promptGuardado) return 'no-disponible';
  const evento = promptGuardado;
  promptGuardado = null;
  evento.prompt();
  try {
    const eleccion = await evento.userChoice;
    return eleccion?.outcome === 'accepted' ? 'aceptada' : 'rechazada';
  } catch {
    return 'rechazada';
  }
}

// iOS (Safari) no dispara 'beforeinstallprompt': la única forma de instalar
// ahí es Compartir → Agregar a inicio, a mano. Se detecta por userAgent para
// poder ofrecer el modal con esos pasos en vez de un botón que nunca haría
// nada.
export function esIos(): boolean {
  if (Platform.OS !== 'web') return false;
  const ua = window?.navigator?.userAgent ?? '';
  return /iphone|ipad|ipod/i.test(ua);
}

// true si la app YA corre instalada (abierta desde el ícono, en modo
// standalone): ahí no tiene sentido seguir ofreciendo instalarla.
export function estaInstalada(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  const porMatchMedia =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  // Safari/iOS no soporta display-mode ni beforeinstallprompt, pero expone
  // este flag propio cuando la PWA corre agregada a inicio.
  const porIosStandalone = (window.navigator as any)?.standalone === true;
  return !!(porMatchMedia || porIosStandalone);
}

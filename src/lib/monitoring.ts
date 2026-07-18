import { Platform } from 'react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Inicializa Sentry SOLO si hay DSN. Sin DSN es un no-op total (no rompe nada).
// En web, `@sentry/react-native` no se importa: evita romper el bundle web.
export function initMonitoring(): void {
  if (!dsn) return;
  if (Platform.OS === 'web') return;
  try {
    // Import dinámico: en web este código nunca se ejecuta, así que Metro/webpack
    // para web no necesita poder resolver ni empaquetar @sentry/react-native.
    const Sentry = require('@sentry/react-native');
    Sentry.init({ dsn, enableNative: true, tracesSampleRate: 0.2 });
  } catch {
    // Nunca dejar que el monitoreo tumbe la app.
  }
}

export function captureError(e: unknown): void {
  if (!dsn) return;
  if (Platform.OS === 'web') return;
  try {
    const Sentry = require('@sentry/react-native');
    Sentry.captureException(e);
  } catch {
    // Nunca dejar que el monitoreo tumbe la app.
  }
}

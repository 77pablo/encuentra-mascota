// El interruptor "Notificación al teléfono" de Avisos NO apagaba los push del
// chat.
//
// `send-notifications` (la cola de avisos) respeta `notification_prefs` desde la
// 0011, pero `send-push` —la que dispara CADA mensaje del chat— no la leía
// nunca: grep de `notification_prefs` en esa función daba 0. O sea que la
// persona apagaba el interruptor, seguía sonándole el teléfono con cada
// mensaje, y no tenía forma de entender por qué.
//
// La decisión vive en una función pura, fuera del `index.ts` de la Edge
// Function, por la misma razón que `_shared/cors.ts`: las Edge Functions están
// fuera del typecheck y de la suite, y ahí ya se nos coló un bug antes.

import { quierePushDeChat } from '../../supabase/functions/_shared/prefsPush';

describe('quierePushDeChat', () => {
  it('sin fila de preferencias, manda: el default es recibir', () => {
    // Nadie que no tocó nunca la pantalla de Avisos debe quedarse sin avisos.
    expect(quierePushDeChat(null)).toBe(true);
    expect(quierePushDeChat(undefined)).toBe(true);
  });

  it('con el canal push APAGADO, no manda', () => {
    expect(quierePushDeChat({ canal_push: false })).toBe(false);
  });

  it('con el canal push encendido, manda', () => {
    expect(quierePushDeChat({ canal_push: true })).toBe(true);
  });

  it('si la columna viene nula o ausente, manda (mismo default que la ausencia de fila)', () => {
    expect(quierePushDeChat({})).toBe(true);
    expect(quierePushDeChat({ canal_push: null })).toBe(true);
  });

  it('el interruptor de CORREO no tiene nada que ver con el push', () => {
    // Apagar el correo no puede dejarte sin los mensajes del chat.
    expect(quierePushDeChat({ canal_push: true, canal_email: false })).toBe(true);
    expect(quierePushDeChat({ canal_push: false, canal_email: true })).toBe(false);
  });

  it('los interruptores por TIPO de aviso tampoco afectan al chat', () => {
    // 'zona', 'pistas', 'avistamientos' y 'coincidencias' son de la cola de
    // avisos. Un mensaje directo no es ninguno de esos.
    expect(
      quierePushDeChat({ canal_push: true, zona: false, pistas: false, avistamientos: false }),
    ).toBe(true);
  });

  it('solo mira `canal_push`: un valor raro no lo apaga por accidente', () => {
    // Defensivo: si la fila trae algo inesperado, el default sigue siendo
    // mandar. Quedarse sin los mensajes del chat es peor que un push de más.
    expect(quierePushDeChat({ canal_push: 'no' as any })).toBe(true);
  });
});

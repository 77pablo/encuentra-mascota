// ¿El destinatario quiere que le suene el teléfono por un mensaje del chat?
//
// Vive acá, puro y sin dependencias de Deno, por la misma razón que
// `_shared/cors.ts`: las Edge Functions están FUERA del typecheck y de la
// suite, así que la única forma de que esta decisión tenga tests es que no
// dependa del runtime. Se prueba desde jest en
// `__tests__/lib/prefsPushChat.test.ts`.
//
// El agujero que cierra: `send-notifications` respeta `notification_prefs`
// desde la 0011, pero `send-push` —la que dispara CADA mensaje del chat— no la
// leía nunca. La persona apagaba "Notificación al teléfono" en Avisos, le
// seguía sonando con cada mensaje, y no tenía forma de entender por qué.
//
// Solo mira `canal_push`. Los interruptores por TIPO ('zona', 'pistas',
// 'avistamientos', 'coincidencias') son de la cola de avisos: un mensaje
// directo de otra persona no es ninguno de esos, y apagar "correo" tampoco
// tiene por qué dejarte sin los mensajes.

export type FilaPrefs = { canal_push?: unknown; [k: string]: unknown } | null | undefined;

export function quierePushDeChat(fila: FilaPrefs): boolean {
  // Sin fila (nunca abrió la pantalla de Avisos) el default es RECIBIR: quien
  // no eligió nada no puede quedarse sin los mensajes.
  if (!fila) return true;
  // Solo un `false` explícito apaga. Un null, un campo ausente o un valor raro
  // caen del lado de mandar: un push de más es mucho menos grave que perderse
  // un mensaje de alguien que puede tener tu mascota.
  return fila.canal_push === false ? false : true;
}

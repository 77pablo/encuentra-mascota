-- Guarda POR QUÉ falló un aviso.
--
-- Sin esta columna, un aviso que no sale falla en absoluto silencio: la fila
-- queda en 'error' y no hay forma de saber si fue la API key, el remitente sin
-- verificar o una caída de red. Nos pasó al conectar Brevo y tuvimos que
-- desplegar una versión especial de la función solo para ver el mensaje.
--
-- NOTA: esta migración YA ESTÁ APLICADA en producción (18-jul-2026, vía la API
-- de gestión). Se deja el archivo para que el historial del repo refleje el
-- esquema real.
alter table public.notification_events
  add column if not exists error_detalle text;

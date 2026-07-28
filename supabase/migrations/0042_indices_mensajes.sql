-- ============================================================
-- INDICES DE `messages` (Tanda D · pieza 3b)
--
-- Es lo unico que quedaba pendiente de la Tanda D. Las otras tres piezas ya
-- estan hechas: la purga de la cola de avisos (migracion 0023 + docs/purga-avisos.sql),
-- el cron cada 5 minutos (docs/agendar-avisos.sql) y el borrado de fotos en
-- `deletePet` (src/services/pets.ts + src/lib/rutaStorage.ts).
--
-- Ver docs/superpowers/specs/2026-07-19-tanda-d-rendimiento-design.md (pieza 3,
-- seccion "Lo que SI se hace ahora: los indices").
--
-- POR QUE SOLO LOS INDICES, Y NO LA RPC
--
-- La pieza 3 completa —mudar el agrupado de conversaciones al servidor con una
-- RPC `mis_conversaciones()` con `distinct on`, mas reescribir la politica
-- `select` de `messages` como `(select auth.uid())`— esta DIFERIDA a proposito
-- en el spec: es la pieza mas cara de la tanda y la de mayor riesgo de regresion
-- visible (romper la lista de mensajes se ve al instante). El umbral escrito
-- para retomarla es: cuando el usuario mas activo pase de ~2.000 mensajes, o
-- cuando aparezca un caso de uso tipo refugio/rescatista. Se mide asi:
--
--   select max(c) from (select count(*) c from public.messages group by from_user) t;
--
-- Mientras tanto, `listConversations` (src/services/messages.ts) barre la
-- historia PAGINADA y pliega cada pagina, asi que no pierde hilos —el
-- `.limit(500)` que cortaba por recencia de MENSAJE en vez de recencia de
-- CONVERSACION fue rechazado explicitamente por el spec, justo por eso—.
--
-- Estos dos indices son lo barato de esa pieza: dos lineas, reversibles, y son
-- los que esa consulta paginada necesita HOY. Sin ellos el barrido es un seq
-- scan de toda la tabla en cada apertura de la pestana Mensajes.
-- ============================================================

-- `listConversations` filtra `from_user = me OR to_user = me` y ordena por
-- `creado_en desc`. Un OR sobre dos columnas no lo resuelve un indice solo:
-- Postgres arma un BitmapOr con los DOS. Por eso son dos indices simetricos y
-- no uno.
--
-- El `creado_en desc` en el indice es para que el orden de la paginacion salga
-- del indice y no de un sort posterior. (El desempate final por `id desc` que
-- hace el cliente NO esta en el indice: es solo para que el corte entre paginas
-- sea determinista cuando dos mensajes comparten instante, y a esta escala no
-- justifica un tercer nivel en el indice.)
--
-- Aprovechan tambien a `listMessages`, que filtra por los mismos dos campos.
create index if not exists messages_from_creado_idx
  on public.messages (from_user, creado_en desc);

create index if not exists messages_to_creado_idx
  on public.messages (to_user, creado_en desc);

-- NOTA sobre `countUnread` (el globito de sin-leer, que corre en cada render):
-- filtra `to_user = me and leido = false`, y para eso el indice que sirve sigue
-- siendo `messages_to_user_leido_idx (to_user, leido)` de la 0001, que ya
-- existe. `messages_to_creado_idx` NO lo reemplaza —el spec lo daba por
-- acelerado y no es exacto—: se deja el de la 0001 donde esta.

-- NOTA sobre el bloqueo de escritura: `create index` (sin `concurrently`) toma
-- un ShareLock sobre `messages`, que bloquea los INSERT mientras dura. Sobre la
-- tabla de hoy —practicamente vacia— eso son milisegundos. Si alguna vez hay que
-- reponer estos indices con la tabla grande y con trafico real, la forma es
-- `create index concurrently`, que NO puede correr dentro de una transaccion y
-- por lo tanto no puede ir en una migracion como esta: hay que correrlo suelto
-- en el SQL Editor.

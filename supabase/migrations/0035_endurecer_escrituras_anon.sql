-- 0035 · Endurecimiento defensivo: revocar a `anon` los permisos de ESCRITURA
-- sobre las tablas nuevas de la tanda (0031/0032).
--
-- No es una brecha activa: con RLS habilitada y sin política para `anon`,
-- cualquier escritura suya afecta 0 filas (verificado contra la base real con
-- `Prefer: return=representation` → `[]`). Pero la convención de la casa
-- (0018) es cinturón y tiradores: el permiso que no existe no depende de que
-- la política siga correcta en el futuro.
--
-- La LECTURA no se toca: `adoption_questions` es pública a propósito (el
-- detalle /adopcion/:id se ve como invitado) y `busquedas_guardadas` ya
-- devuelve vacío por RLS.

revoke insert, update, delete on public.adoption_questions from anon;
revoke insert, update, delete on public.busquedas_guardadas from anon;

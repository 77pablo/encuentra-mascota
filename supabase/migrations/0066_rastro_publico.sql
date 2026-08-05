-- 0066: el rastro de avistamientos para quien llega por el QR (tanda 14, area C).
--
-- POR QUE: la RLS de `sightings` (0007) es `to authenticated`, asi que quien
-- escanea el afiche —EL CASO DE USO CENTRAL DE TODA LA APP— ve el pin del
-- reporte y ninguna pista. Los datos estan guardados y no se muestran.
--
-- POR QUE ES DEFENDIBLE: las ubicaciones ya salen DIFUMINADAS ~250 m al
-- escribirse (difuminarUbicacion.ts, desplazamiento aleatorio y NO redondeo,
-- justamente porque el redondeo es reversible cruzando reportes). Abrir la
-- lectura no revela una direccion.
--
-- LOS FILTROS SE REPITEN A MANO. Una policy nueva no hereda los de la ficha:
-- sin `activo` y `oculto`, un reporte retirado por moderacion seguiria
-- mostrando su rastro a cualquiera con el link.

create policy "el rastro de un reporte vigente es publico"
  on public.sightings for select to anon
  using (
    exists (
      select 1 from public.pets p
       where p.id = sightings.pet_id
         and p.activo
         and p.oculto = false
    )
  );

-- ============================================================
-- LA POLICY ABRE FILAS, NO COLUMNAS — Y ESO DEANONIMIZABA AL AUTOR.
--
-- `sightings` (0007) no tiene ningun `revoke`/`grant` de columna propio: nacio
-- con el grant de tabla completa que Supabase concede por defecto a `anon` y
-- `authenticated` (la misma `alter default privileges` que documentan la 0058
-- y la 0063). Mientras `anon` no tenia NINGUNA policy de SELECT sobre esta
-- tabla, ese grant de tabla completa era letra muerta: la RLS bloqueaba todo.
-- La policy de arriba le da a `anon` su primera fila legible — y con ella,
-- por el grant de tabla que ya estaba ahi, LAS OCHO COLUMNAS de esa fila,
-- incluidas `user_id` y `foto`.
--
-- LA CADENA DE DEANONIMIZACION, completa: `sightings.user_id` sale a `anon`
-- → `anon` (sin ninguna cuenta, sin login) llama al RPC `perfil_publico(uuid)`
-- (0019, `security definer`, `grant execute ... to anon`) pasandole ese
-- `user_id` → el RPC devuelve `nombre`, `foto_perfil` y `red_social` de quien
-- reporto el avistamiento. Quien solo queria ver "por aca lo vieron" termina
-- pudiendo poner nombre, cara y contacto de red social a la persona detras de
-- CADA pin del rastro. Nada de esto pasa por ningun error: PostgREST no
-- rechaza `select *`, y `perfil_publico` esta pensado para ser publico — el
-- agujero es que `user_id` nunca deberia haber llegado al cliente para
-- alimentarlo.
--
-- LA DECISION SOBRE `foto`: QUEDA AFUERA, incluida la vez que se reviso este
-- grant. `PublicPetScreen` (la pantalla que consume esta policy) no renderiza
-- ninguna foto de avistamiento — solo pin (`lat`/`lng`) y `nota` — asi que
-- concederla seria ensanchar el acceso sin que ninguna pantalla la necesite.
-- Principio de privilegio minimo: se concede lo que se usa, no lo que existe.
-- Si alguna vez una pantalla publica necesita mostrar la foto del avistamiento,
-- eso es una decision de producto nueva y un grant nuevo, no una ampliacion
-- silenciosa de este.
--
-- EL REVOKE ES SOLO PARA `anon`, A PROPOSITO — Y ES SEGURO PORQUE `anon` Y
-- `authenticated` TIENEN GRANTS DIRECTOS, NO VIA `public`: verificado leyendo
-- el comentario de la 0064 (que cita a la 0058) — Supabase concede los grants
-- por defecto a `anon` y `authenticated` como dos GRANT explicitos y
-- SEPARADOS, ninguno de los dos via el pseudo-rol `public`. Por eso un
-- `revoke select on public.sightings from anon` le saca el privilegio SOLO a
-- `anon`: no toca el grant directo de `authenticated`, que sigue viendo la
-- fila completa (incluido `user_id`, que la ficha con sesion SI necesita para
-- que `bloqueos` pueda filtrar por autor — ver `listSightings` en
-- `src/services/sightings.ts`). La policy `"avistamientos visibles para
-- autenticados"` (0007) tampoco se toca: sigue siendo `for select to
-- authenticated using (true)`.
revoke select on public.sightings from anon;
grant  select (id, pet_id, lat, lng, nota, creado_en)
       on public.sightings to anon;

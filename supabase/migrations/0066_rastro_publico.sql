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
-- EL REVOKE NOMBRA `public` ADEMAS DE `anon` — LA LECCION ES DE LA 0018, NO
-- SOLO DE LA 0064. En Postgres el chequeo de privilegio (de columna o de
-- tabla) pasa si CUALQUIERA de los roles del chequeo lo tiene, incluido el
-- pseudo-rol `public`, del que todos los roles heredan. Un `revoke select on
-- public.sightings from anon` a secas (la primera pasada de esta migracion)
-- asume que jamas existio ni existira un `grant select ... to public` sobre
-- esta tabla — pero si alguna vez lo hubiera (un remanente, un cambio manual
-- corrido a mano contra la base real), ese revoke seria un NO-OP SILENCIOSO:
-- se aplicaria sin error, los 9 tests de `migracion0066.test.ts` seguirian en
-- verde (leen el SQL, no la base real), y `anon` seguiria viendo la fila
-- completa via `public` — incluido `user_id`, reabriendo la misma cadena de
-- deanonimizacion de mas arriba. Es EXACTAMENTE la trampa que ya documenta la
-- 0018 (`contacto_privado.sql`, la primera vez que este proyecto se quemo con
-- esto en `profiles`) y que la 0064 repite para `pet_fotos_vector`: nombrar
-- `public` en el `revoke` no es redundante, es lo que hace que el revoke sea
-- fail-closed en vez de depender de que nadie, nunca, haya tocado el grant a
-- mano.
--
-- TAMBIEN SE REVOCA `all`, NO SOLO `select`: `anon` ya tenia INSERT/UPDATE/
-- DELETE sobre esta tabla por el mismo grant de tabla completa que Supabase
-- concede por defecto (la `alter default privileges` de mas arriba). Hoy esos
-- privilegios de escritura son letra muerta porque no existe ninguna policy
-- de INSERT/UPDATE/DELETE para `anon` sobre `sightings` — pero un
-- `revoke select` a secas los deja ahi, sin ningun respaldo mas que "todavia
-- nadie agrego esa policy por error". `revoke all` los cierra tambien a nivel
-- de privilegio de tabla, de modo que una policy de escritura agregada por
-- error el dia de mañana siga sin alcanzar: sin el privilegio de tabla, ni
-- siquiera llega a evaluarse la policy.
--
-- `authenticated` NO SE TOCA — y es seguro porque tiene un grant DIRECTO, no
-- via `public`: verificado leyendo el comentario de la 0064 (que cita a la
-- 0058) — Supabase concede los grants por defecto a `anon` y `authenticated`
-- como dos GRANT explicitos y SEPARADOS, ninguno de los dos via el pseudo-rol
-- `public`. Por eso `revoke all on public.sightings from public, anon` no
-- toca el grant directo de `authenticated`, que sigue viendo la fila completa
-- (incluido `user_id`, que la ficha con sesion SI necesita para que
-- `bloqueos` pueda filtrar por autor — ver `listSightings` en
-- `src/services/sightings.ts`). La policy `"avistamientos visibles para
-- autenticados"` (0007) tampoco se toca: sigue siendo `for select to
-- authenticated using (true)`.
revoke all on public.sightings from public, anon;
grant  select (id, pet_id, lat, lng, nota, creado_en)
       on public.sightings to anon;

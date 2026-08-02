-- ============================================================
-- 0057 — CUENTAS INSTITUCIONALES (veterinarias, refugios, municipios)
--
-- POR QUE. El competidor real en Chile no es otra app de mascotas: es SOSAFE
-- (2,5 millones de usuarios, convenios con ~27 comunas pagados por los
-- municipios). En densidad no les ganamos. Lo que si podemos ser es la
-- infraestructura que las instituciones adoptan porque es gratis y lo suyo
-- esta abandonado: la pagina "Mascotas Perdidas" de la Municipalidad de
-- Santiago tiene 21 avisos, el ultimo de febrero de 2024. Es tambien como la
-- app lider del rubro (Petco Love Lost) consiguio escala.
--
-- QUE AGREGA. Un perfil puede ser una organizacion: tipo (veterinaria /
-- refugio / municipio), nombre publico, comuna y un dato de contacto. Nada de
-- eso es un privilegio de escritura nuevo para el usuario: es una ETIQUETA que
-- otorga la moderacion.
--
-- ------------------------------------------------------------------
-- EL HALLAZGO QUE OBLIGO A ESTA MIGRACION A HACER MAS DE LO PEDIDO
-- ------------------------------------------------------------------
-- La 0018 cerro el SELECT de `profiles` por columna y dejo escrito, textual,
-- "«update» no se toca: editar el perfil propio sigue funcionando". Con el
-- grant por defecto de Supabase (`grant all on all tables in schema public to
-- anon, authenticated`) y la policy de la 0001 —`for update to authenticated
-- using (auth.uid() = id)`, sin `with check` propio— eso significa que
-- cualquier cuenta puede escribir CUALQUIER columna de SU PROPIA fila.
--
-- Hoy esas columnas incluyen:
--   · `es_admin`      (0036) → un `update profiles set es_admin = true` desde
--                              el cliente entrega el panel de moderacion
--                              entero: bandeja de denuncias, retirar
--                              contenido, suspender cuentas.
--   · `suspendido_en` (0036) → un suspendido se auto-levanta la suspension.
--
-- Todo el diseño de la 0036/0040 (RPC security definer que chequean
-- `es_admin()` por dentro, "el privilegio NO se abre con RLS ancha") depende
-- de que `es_admin` no se pueda escribir desde afuera, y esa pieza nunca se
-- puso. Agregar `institucion_verificada_en` sin cerrar esto habria sido
-- regalarle la insignia de "Municipalidad de Ñuñoa" a quien la pidiera.
--
-- Por eso esta migracion revoca el UPDATE ancho y lo vuelve a conceder por
-- COLUMNA, con la misma tecnica fail-closed de la 0018 para el select.
--
-- ------------------------------------------------------------------
-- SEGURIDAD DE APLICACION
-- ------------------------------------------------------------------
-- Aditiva: agrega columnas (nullables), dos constraints, dos RPC nuevas y
-- recrea dos funciones existentes. No borra datos, no toca tablas de
-- contenido, no toca ninguna policy. La app funciona SIN esta migracion
-- aplicada: las RPC viejas no devuelven las columnas nuevas, `institucionDe`
-- (src/lib/institucion.ts) no encuentra `institucion_verificada_en` y devuelve
-- null, o sea "no es una institucion" — que es exactamente el estado de todo
-- el mundo antes de aplicarla.
--
-- LAS DOS FUNCIONES QUE RECREA SE PARTEN DE SU VERSION MAS NUEVA:
--   · `perfil_publico` → de la 0053 (que sumo la vigencia de adopciones sobre
--                        la 0052, que a su vez habia sumado la columna
--                        `adopciones`). Recrear desde la 0019 borraria las dos
--                        cosas sin que nada se pusiera rojo.
--   · `mi_perfil`      → de la 0036c (que sumo `es_admin` sobre la 0024, que
--                        habia sumado `fecha_nacimiento`).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) Columnas. Todas nullables: una cuenta normal las tiene en null y eso es
--    lo que significa "no soy una institucion".
-- ------------------------------------------------------------------
alter table public.profiles add column if not exists institucion_tipo text;
alter table public.profiles add column if not exists institucion_nombre text;
alter table public.profiles add column if not exists institucion_comuna text;
alter table public.profiles add column if not exists institucion_contacto text;
-- LA COLUMNA QUE MANDA. Mientras sea null no hay insignia, pase lo que pase con
-- las otras cuatro. Es el unico dato que enciende la verificacion en la app
-- (ver `institucionDe` en src/lib/institucion.ts) y solo la escribe un admin.
alter table public.profiles add column if not exists institucion_verificada_en timestamptz;
-- Quien la verifico. Dato interno de moderacion: NO se concede a nadie en el
-- grant de abajo. Sirve para auditar despues quien firmo que tal cuenta es la
-- Municipalidad de Maipu.
alter table public.profiles add column if not exists institucion_verificada_por uuid
  references public.profiles(id) on delete set null;

-- Postgres no tiene `add constraint if not exists`: sin el drop previo, el
-- segundo `supabase db push` revienta a la mitad.
alter table public.profiles drop constraint if exists profiles_institucion_tipo_valido;
alter table public.profiles add constraint profiles_institucion_tipo_valido
  check (institucion_tipo is null or institucion_tipo in ('veterinaria', 'refugio', 'municipio'));

-- Una institucion verificada SIN nombre publico no dice nada, y sin tipo la app
-- no sabe que dibujar. Lo impide la base, no solo el cliente — que es lo unico
-- que un municipio no controla.
alter table public.profiles drop constraint if exists profiles_institucion_completa;
alter table public.profiles add constraint profiles_institucion_completa
  check (
    institucion_verificada_en is null
    or (institucion_tipo is not null and nullif(btrim(institucion_nombre), '') is not null)
  );

-- ------------------------------------------------------------------
-- 2) Lectura. La 0018 avisa: "este esquema de permisos es fail-closed. El
--    `grant select` es una lista explicita de columnas, asi que una columna
--    nueva NO queda legible por herencia ni por defecto — hay que agregarla a
--    mano. Si se olvida, la app va a fallar EN SILENCIO."
--
--    Lo de la institucion es publico A PROPOSITO, incluido el contacto: el
--    telefono de una veterinaria es su cartel en la vereda, no el dato privado
--    de una persona que cerro la 0018. Ese contacto lo escribe la moderacion al
--    verificar, no el usuario.
-- ------------------------------------------------------------------
grant select (institucion_tipo, institucion_nombre, institucion_comuna,
              institucion_contacto, institucion_verificada_en)
       on public.profiles to anon, authenticated;

-- ------------------------------------------------------------------
-- 3) ESCRITURA — el cierre del agujero descrito arriba.
--
--    El `revoke` incluye a `public` a proposito (misma razon que la 0018): en
--    Postgres el chequeo pasa si CUALQUIERA de los roles del chequeo tiene el
--    permiso, incluido el pseudo-rol `public` del que todos heredan. Dejarlo
--    afuera haria que todo esto fuera un no-op silencioso.
--
--    La lista que se vuelve a conceder es exactamente lo que manda
--    `updateMyProfile` (src/services/profile.ts) mas `fecha_nacimiento`, que es
--    un dato del dueño (0024). Todo lo demas queda cerrado: `es_admin`,
--    `suspendido_en`, `eliminado_en`, `creado_en`, `id` y las seis columnas
--    `institucion_*`.
--
--    Las funciones `security definer` (anonimizar_mi_cuenta, moderar_suspender,
--    moderar_reactivar, handle_new_user, las dos de abajo) NO se ven afectadas:
--    corren con el rol del owner, que conserva todos sus privilegios.
--
--    ADVERTENCIA para la proxima migracion que agregue una columna EDITABLE a
--    `profiles`: hay que sumarla a este grant. Si se olvida, guardar el perfil
--    va a fallar con 42501 (o peor, dejar de guardar ese campo en silencio).
-- ------------------------------------------------------------------
revoke update on public.profiles from public, anon, authenticated;
grant update (nombre, foto_perfil, telefono, red_social, fecha_nacimiento)
       on public.profiles to authenticated;

-- ------------------------------------------------------------------
-- 4) Otorgar y revocar la condicion institucional.
--
--    MISMO PATRON QUE LA MODERACION (0040): RPC `security definer` que abortan
--    si el llamador no es admin. Se conceden a `authenticated` porque el gate
--    real esta adentro; un no-admin nunca llega al cuerpo.
--
--    NO HAY PANTALLA PARA ESTO Y ESTA BIEN. Al principio la verificacion se
--    hace a mano: alguien de moderacion mira el RUT / la patente / el correo
--    institucional y corre la RPC desde el SQL editor. Automatizarlo antes de
--    tener la primera veterinaria adentro seria construir para nadie. La RPC
--    existe (y no un `update` a mano) para que el dia que haya panel no haga
--    falta otra migracion, y para que quede registro de quien firmo.
-- ------------------------------------------------------------------
create or replace function public.institucion_otorgar(
  p_user_id uuid,
  p_tipo text,
  p_nombre text,
  p_comuna text default null,
  p_contacto text default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  if p_tipo is null or p_tipo not in ('veterinaria', 'refugio', 'municipio') then
    raise exception 'tipo de institucion invalido: %', coalesce(p_tipo, '(null)');
  end if;
  if v_nombre is null then
    raise exception 'la institucion necesita un nombre publico';
  end if;

  update public.profiles set
    institucion_tipo = p_tipo,
    institucion_nombre = v_nombre,
    institucion_comuna = nullif(btrim(coalesce(p_comuna, '')), ''),
    institucion_contacto = nullif(btrim(coalesce(p_contacto, '')), ''),
    -- `coalesce` para no reescribir la fecha original al corregir un dato: la
    -- antiguedad de la verificacion es parte de la confianza.
    institucion_verificada_en = coalesce(institucion_verificada_en, now()),
    institucion_verificada_por = auth.uid()
  where id = p_user_id and eliminado_en is null;

  -- Un "listo" sobre una cuenta que no existe (o que es una lapida) es peor que
  -- un error a la vista: es el mismo criterio que `moderar_reactivar` (0045).
  if not found then raise exception 'no existe esa cuenta, o esta eliminada'; end if;
end;
$$;
revoke all on function public.institucion_otorgar(uuid, text, text, text, text) from public, anon;
grant execute on function public.institucion_otorgar(uuid, text, text, text, text) to authenticated;

create or replace function public.institucion_revocar(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then raise exception 'no autorizado'; end if;
  -- Se limpia TODO, no solo la fecha: dejar el nombre y el tipo puestos con la
  -- verificacion quitada es exactamente el estado "media insignia" que el
  -- constraint y `institucionDe` estan evitando.
  update public.profiles set
    institucion_tipo = null,
    institucion_nombre = null,
    institucion_comuna = null,
    institucion_contacto = null,
    institucion_verificada_en = null,
    institucion_verificada_por = null
  where id = p_user_id;
  if not found then raise exception 'no existe esa cuenta'; end if;
end;
$$;
revoke all on function public.institucion_revocar(uuid) from public, anon;
grant execute on function public.institucion_revocar(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 5) `perfil_publico` — se parte de la 0053 (la version mas nueva).
--
--    Cambia el TIPO DE RETORNO (suma cinco columnas), y `create or replace` no
--    puede cambiarlo: hace falta `drop` primero. Es la misma trampa que
--    documentan la 0017, la 0018 y la 0036c.
--
--    La linea de vigencia de `adopciones` se copia TAL CUAL de la 0053, que a
--    su vez la copio de `buscar_adopciones` (0052). Tiene que seguir siendo
--    identica a la del feed: mismo coalesce, mismo intervalo. Si una cambia sin
--    la otra, el perfil de un refugio vuelve a prometer publicaciones que el
--    feed no muestra. Hay un test que compara las dos expresiones ENTRE SI.
-- ------------------------------------------------------------------
drop function if exists public.perfil_publico(uuid);
create function public.perfil_publico(p_user_id uuid)
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  red_social text,
  creado_en timestamptz,
  reencuentros bigint,
  reportes bigint,
  aportes bigint,
  adopciones bigint,
  institucion_tipo text,
  institucion_nombre text,
  institucion_comuna text,
  institucion_contacto text,
  institucion_verificada_en timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.id, p.nombre, p.foto_perfil, p.red_social, p.creado_en,
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.reunida_en is not null and pe.oculto = false),
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.oculto = false),
    (select count(*) from public.sightings s where s.user_id = p.id)
      + (select count(*) from public.pet_tips t where t.user_id = p.id),
    (select count(*) from public.adoptions ad
       where ad.user_id = p.id and ad.activo = true and ad.oculto = false
         and ad.adoptada_en is null
         -- IDENTICA a la de `buscar_adopciones` (0052) y a la de la 0053.
         and coalesce(ad.renovado_en, ad.creado_en) >= now() - interval '90 days'),
    p.institucion_tipo,
    p.institucion_nombre,
    p.institucion_comuna,
    p.institucion_contacto,
    p.institucion_verificada_en
  from public.profiles p
  where p.id = p_user_id
    -- Las cuentas borradas (lapidas) no exponen perfil publico -> cero filas.
    and p.eliminado_en is null;
$$;

revoke all on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to anon;
grant execute on function public.perfil_publico(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 6) `mi_perfil` — se parte de la 0036c (la version mas nueva).
--
--    Su firma vigente NO es la de la 0018 ni la de la 0024: la 0024 sumo
--    `fecha_nacimiento` y la 0036c sumo `es_admin`. Recrear con una firma vieja
--    borraria esas columnas del RPC EN SILENCIO — un select que ya no trae una
--    columna no tira error, el dato simplemente deja de llegar. Se conservan
--    las ocho y se suman las de institucion al final.
--
--    El dueño necesita ver su propio estado institucional: es lo que habilita
--    la carga en lote en Publicar y lo que le confirma que la verificacion
--    quedo hecha.
-- ------------------------------------------------------------------
drop function if exists public.mi_perfil();
create function public.mi_perfil()
returns table (
  id uuid, nombre text, foto_perfil text, telefono text, red_social text,
  fecha_nacimiento date, creado_en timestamptz, es_admin boolean,
  institucion_tipo text, institucion_nombre text, institucion_comuna text,
  institucion_contacto text, institucion_verificada_en timestamptz
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select p.id, p.nombre, p.foto_perfil, p.telefono, p.red_social,
         p.fecha_nacimiento, p.creado_en, p.es_admin,
         p.institucion_tipo, p.institucion_nombre, p.institucion_comuna,
         p.institucion_contacto, p.institucion_verificada_en
  from public.profiles p
  where p.id = auth.uid()
$$;
revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;

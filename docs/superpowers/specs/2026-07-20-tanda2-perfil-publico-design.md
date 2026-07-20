# Tanda 2 — Perfil público e interactivo

Fecha: 2026-07-20 · Rama: `feat/mvp-encuentra-mascota`

## Objetivo

Que **otras personas puedan ver el perfil de un usuario** (hoy nadie lo ve), con un
sentido de comunidad y reputación: cuántos reencuentros logró, cuántos reportes
publicó, cuánto ayudó al barrio, desde cuándo es miembro, insignias, y un link
tocable a su red social. Es la base de "que la gente me busque" que pidió el usuario.

Depende de la **Tanda 1** (el link de red social se guarda como URL en `red_social`
y se interpreta con `src/lib/redSocial.ts`).

## No-objetivos (YAGNI)

- Seguir usuarios / "amigos".
- Mensajería nueva (se reusa el chat existente).
- Mostrar el **teléfono** a terceros (decisión explícita: sigue privado, coherente
  con la migración `0018`).
- Listar públicamente las pistas/avistamientos de una persona (solo se muestra el
  **conteo** de aportes, no la lista).

## Decisiones tomadas (con el usuario)

- **Stats visibles:** reencuentros, reportes publicados, aportes al barrio, miembro desde. (todas)
- **Entradas:** nombre en un reporte, autor de pista/avistamiento, y desde el chat. (todas)
- **Interactivo:** insignias/logros, estadísticas tocables, y portada con diseño lindo. (todas)
- **Privacidad:** teléfono **NO**; sí nombre, foto, stats, red social (link) y reportes activos.

## 1. Backend — migración `0019_perfil_publico.sql`

RPC `perfil_publico(p_user_id uuid)`, `SECURITY DEFINER`, análogo a `mi_perfil()`
pero **público** y **con destinatario** (es información pública, a diferencia del
teléfono). Devuelve **una fila** o **cero filas** (cuenta borrada → la pantalla
muestra "Perfil no disponible").

```sql
create or replace function public.perfil_publico(p_user_id uuid)
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  red_social text,
  creado_en timestamptz,
  reencuentros bigint,
  reportes bigint,
  aportes bigint
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
      + (select count(*) from public.pet_tips t where t.user_id = p.id)
  from public.profiles p
  where p.id = p_user_id
    and p.eliminado_en is null;
$$;

revoke all on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to anon, authenticated;
```

**Política aditiva para reencuentros visibles al invitado.** La RLS de `pets`
para `anon` (mig `0004`) solo deja leer `activo = true`, así que un **invitado no
puede leer reportes reunidos** (`activo = false`) → la sección "Reencuentros 🎉"
del perfil le saldría vacía (y ya le pasa hoy a la tira "Finales felices" de
Inicio). El **conteo** viene del RPC (que saltea RLS) y es correcto para todos,
pero la **lista** no. Se agrega una política aditiva (las políticas se combinan con
OR, no reemplaza nada) para que el invitado también vea los reencuentros:

```sql
create policy "reencuentros visibles publicamente"
  on public.pets for select to anon
  using (activo = false and reunida_en is not null and oculto = false);
```

Es seguro: un reencuentro es información para celebrarse en público y no agrega
ningún campo sensible nuevo (los reportes reunidos ya son visibles para usuarios
con sesión). Beneficio extra: arregla la tira "Finales felices" de Inicio para
invitados.

**Seguridad:**
- La función selecciona **solo columnas seguras**; el `telefono` no aparece →
  imposible de filtrar por esta vía, aunque el llamador pase cualquier `user_id`.
- `eliminado_en is null` en el `where`: las cuentas borradas (lápidas) **no**
  exponen perfil público → cero filas.
- `security definer` + `search_path` fijo (mismo blindaje que `mi_perfil()` y
  `anonimizar_mi_cuenta()`).
- `grant` a `anon` también: el **modo invitado** puede ver perfiles.

**Nota de despliegue:** la migración la aplica el usuario en Supabase (no hay token
en el repo). La app se diseña **fail-closed**: si la RPC todavía no existe
(`PGRST202`), la pantalla muestra "Perfil no disponible", no rompe.

## 2. Servicio — `src/services/perfilPublico.ts`

```ts
export interface PerfilPublico {
  id: string; nombre: string; foto_perfil: string | null;
  red_social: string | null; creado_en: string;
  reencuentros: number; reportes: number; aportes: number;
}
getPerfilPublico(userId): Promise<PerfilPublico | null>   // RPC; null si borrado/inexistente
listReportesPublicos(userId): Promise<Pet[]>              // activos, no ocultos, recientes
listReencuentrosPublicos(userId): Promise<Pet[]>          // reunida_en not null, recientes
```

Las dos listas usan la tabla `pets` directo: los **activos** son legibles por
`authenticated` (política `using (true)`) y por `anon` (mig `0004`); los
**reencuentros** (`activo=false`) los ve `authenticated`, y `anon` gracias a la
política aditiva de esta migración (ver §1). Si `getPerfilPublico` recibe
`PGRST202`, devuelve `null` (fail-closed).

## 3. Insignias — `src/lib/insignias.ts` (lógica pura, TDD)

```ts
export interface StatsPerfil { reencuentros: number; reportes: number; aportes: number; }
export interface Insignia { clave: string; emoji: string; titulo: string; descripcion: string; }
export function insigniasDe(stats: StatsPerfil): Insignia[]
```

Reglas (se muestra el **escalón más alto** alcanzado por familia):
- Reencuentros: `>=3` → 🦸 **Héroe del barrio**; si no, `>=1` → 🏠 **Reencuentro logrado**.
- Reportes: `>=1` → 📣 **Primer reporte**.
- Aportes: `>=15` → 🌟 **Súper vecino**; si no, `>=5` → 🤝 **Vecino activo**.

Devuelve `[]` si no alcanza ninguna. Orden: reencuentros, reportes, aportes.

## 4. Pantalla — `src/screens/PublicProfileScreen.tsx`

Param de ruta: `{ userId: string }`. La puede ver cualquiera (incluido invitado).

- **Portada:** foto grande (o inicial), nombre, "Miembro desde <mes año>".
- **3 tiles de stats tocables:** Reencuentros (la estrella), Reportes, Aportes.
  - Reportes / Reencuentros → hacen scroll a su sección de abajo.
  - Aportes → muestra una explicación corta (`notify`), no hay lista pública.
- **Fila de insignias** (de `insigniasDe`).
- **Red social:** link tocable, reusando `parseRedSocial` + `iconoRedSocial` de la Tanda 1.
- **Secciones:** "Reportes activos" (tocables → `PetDetail`) y "Reencuentros 🎉".
- **Estados:** loading; "Perfil no disponible" (null: borrado o RPC ausente); vacíos amables.

## 5. Entradas (nombres tocables)

- **Reporte (`PetDetailScreen`):** nueva fila "Publicado por **[nombre]** →" tocable.
  El nombre se obtiene con una consulta liviana a `profiles(nombre)` (columna pública)
  por `pet.user_id`. Tocarla → `PublicProfile`.
- **Pista / avistamiento (`PetDetailScreen`):** el nombre del autor (ya visible) se
  vuelve tocable con `user_id`. **Excepción:** si viene anonimizado ("Un vecino",
  cuenta borrada) **no** se hace tocable.
- **Chat (`ChatScreen`) y `ConversationsScreen`:** el nombre de la otra persona,
  tocable → `PublicProfile`. Si la cuenta está borrada ("Cuenta eliminada"), no tocable.
- **Navegación:** registrar `PublicProfile` en los 5 stacks (Inicio, Mapa, Lista,
  Mensajes, Perfil), mismo patrón que `PetDetail`/`Chat`.

## 6. Privacidad

El `telefono` **nunca** entra a la RPC ni a la pantalla. El contacto entre vecinos
sigue siendo el chat interno o la red social. Consistente con `0018` y con la
decisión de producto de la sesión anterior.

## Plan de pruebas

- **`insignias.ts`:** TDD, tests de cada escalón y de los bordes (0, 1, 3, 5, 15).
- **RPC `perfil_publico`:** verificar contra la base real después de aplicar
  (como las tandas anteriores): (a) devuelve stats correctas; (b) **no** trae
  `telefono` ni con cualquier `user_id`; (c) cuenta borrada → 0 filas; (d) sin
  sesión (anon) también responde.
- **Política aditiva de reencuentros:** como `anon`, leer un reporte reunido
  (`activo=false, reunida_en not null`) debe devolver la fila; un reporte cerrado
  **sin** reencuentro (`activo=false, reunida_en null`) debe seguir **oculto** a `anon`.
- **Pantalla y entradas:** verificación visual en el navegador con la cuenta de prueba.
- Mantener verde `tsc` y toda la suite.

## Orden de implementación sugerido

1. `insignias.ts` (TDD).
2. Migración `0019` + `services/perfilPublico.ts`.
3. `PublicProfileScreen`.
4. Cableado de entradas + registro en los 5 stacks.
5. Verificación (tests + tsc; navegador; RPC contra la base tras aplicar).

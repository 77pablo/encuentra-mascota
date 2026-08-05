# Tanda 14 — difusión con registro · coincidencia por foto · mapa en la web · pulido

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la difusión de un reporte deje registro, que la foto sume al matching, que la web
tenga por fin un mapa de verdad, y que la deuda triada de la tanda 13 quede saldada.

**Architecture:** Cuatro áreas independientes sobre `feat/t13`. Toda la lógica decidible vive en
módulos puros de `src/lib/` probados con jest; el acceso a datos en `src/services/` con el patrón
`esMigracionSinAplicar`; las Edge Functions replican su lógica desde `_shared/` carácter por
carácter. Ninguna tabla nueva toca `pets`.

**Tech Stack:** React Native 0.86 + Expo 57 + React 19 (web vía Metro), Supabase (Postgres +
PostGIS + pgvector 0.8.2 + Edge Functions en Deno), Leaflet 1.9 con teselas de OpenStreetMap,
`@huggingface/transformers` (CLIP ViT-B/32), jest 206 suites.

## Global Constraints

Estas reglas valen para TODAS las tareas. Copiadas del spec
`docs/superpowers/specs/2026-08-03-tanda-14-difusion-foto-mapa-design.md`.

- **`pets` NO suma columnas.** Media app la lee con `select('*')`; una columna que falte rompe la
  ficha entera. Todo lo nuevo va en tablas propias.
- **Lo que falta nunca descarta.** Un reporte sin foto, sin señas o sin vector tiene que seguir
  encontrando coincidencias. Los datos nuevos SÓLO suman puntos.
- **Nada bloquea publicar.** Vector, semilla y tablero son best-effort.
- **Toda escritura pide `.select(...)` y mira `data.length === 0`.** La RLS de PostgREST rechaza en
  silencio (200 + 0 filas). Los tests **NO** deben mockear `42501`: ésa es justo la respuesta que la
  RLS **no** da. Es la quinta aparición de este silencio en el proyecto.
- **Tono:** no gamificar, no sonar a "nadie te ayudó", `miembros <= 1 → 'Tu cuadrilla'`. Reglas ya
  escritas en `src/lib/cuadrilla.ts:10-15`, `CuadrillaScreen.tsx:57-63`, `PlanBusqueda.tsx:26-29`.
- **Registro chileno, tú-form.** "Avisale", "pegá", "mirá". Nunca "usted" ni "tú puedes".
- **El número de chip NUNCA sale de la base.** Ni por RPC, ni por push, ni por la cola.
- **Atribución ODbL obligatoria y VISIBLE** en toda pantalla que muestre datos de OpenStreetMap
  (lugares del área A, teselas del área C): `© colaboradores de OpenStreetMap`.
- **Migraciones `0063`–`0066`, en ese orden.** El guardián `__tests__/db/ultimaMigracion.test.ts`
  hoy afirma `0062` y **se mueve con CADA migración** (63 en A1, 64 en B2, 65 en B4, 66 en C3), no
  de una vez al final: ponerlo en 66 desde el principio lo dejaría rojo toda la tanda, y un rojo
  conocido y tolerado es como se cuelan los rojos nuevos. **MOVERLO, no duplicarlo** (en la tanda 10
  tres agentes lo copiaron y quedaron tres copias afirmando números distintos).
- **Las Edge Functions están fuera del typecheck y de la suite.** La lógica decidible va en
  `supabase/functions/_shared/` y se prueba desde jest; el espejo en `src/lib/` se copia **carácter
  por carácter, comentarios incluidos** (lección de la tarea C2 de la tanda 13).
- **Verificación real:** `npx tsc --noEmit && npx jest` con `exit 0` comprobado de verdad, **nunca
  encadenado a un `tail`** que se come el código de salida.

## Orden de las áreas

Pablo aprobó el orden **A → B → C → D** (se le ofreció "el mapa primero" y eligió no reordenar).

⚠️ **Por eso el área A NO puede depender del área C.** El tablero muestra los lugares como
**lista** con dirección y botón "abrir en Maps"; el pin en el mapa es un agregado que llega recién
con C y su ausencia no debe romper ni vaciar la pantalla.

## File Structure

**Área A — tablero de difusión**
- `supabase/migrations/0063_difusion_y_lugares.sql` — tablas `lugares` y `difusion_destinos`, RLS,
  RPC `lugares_cerca`.
- `src/lib/difusion.ts` — puro: tipos, validación de etiqueta, agrupado, resumen sin gamificar.
- `src/services/difusion.ts` — acceso a datos, degradación por migración sin aplicar.
- `src/components/TableroDifusion.tsx` — la UI del tablero.
- `scripts/semilla-lugares.js` — pobla `lugares` desde Overpass. Mantenimiento, no migración.
- Modifica: `src/screens/PetDetailScreen.tsx` (montar), `src/screens/CuadrillaScreen.tsx` (afiche
  alcanzable), `src/components/PlanBusqueda.tsx` (enlazar en vez de duplicar).

**Área B — coincidencia por foto**
- `supabase/migrations/0064_vectores_de_foto.sql` — `create extension vector`, `pet_fotos_vector`.
- `supabase/migrations/0065_coincidencias_con_foto.sql` — `buscar_coincidencias` con término de foto
  y desglose.
- `src/lib/vectorFoto.ts` — puro: normalización, coseno y validación.
- `src/services/vectorFoto.ts` — carga el modelo y escribe el vector. **Sólo web** (ver Task B1).
- `src/lib/porQueCoincide.ts` — puro: arma el desglose legible.
- Modifica: `src/services/busqueda.ts` (tipos nuevos), `src/services/pets.ts` (disparo best-effort),
  `src/screens/PetDetailScreen.tsx` (mostrar puntaje y desglose).

**Área C — mapa en la web**
- `src/components/PlatformMap.web.tsx` — reescrito con Leaflet, MISMA interfaz.
- `src/lib/mapaWeb.ts` — puro: `iconoHtml`, `regionABounds`, orden del rastro.
- `supabase/migrations/0066_rastro_publico.sql` — policy de `sightings` para `anon`.
- Modifica: `src/screens/PublicPetScreen.tsx` (mostrar el rastro), `src/services/sightings.ts`.

**Área D — pulido**
- Modifica nueve pantallas para `radiogroup`, más los minors listados en la tarea D2.
- `supabase/migrations/0067_limpieza_seguimientos.sql` — sólo si D3 confirma que hace falta.

---

# Task 0: Reservar la numeración y fijar el protocolo del guardián

**Files:**
- Modify: `__tests__/db/ultimaMigracion.test.ts` (sólo el comentario de cabecera)

**Interfaces:**
- Consumes: nada.
- Produces: la convicción de que `0063`–`0066` están libres, y el protocolo escrito de cómo se mueve
  el guardián.

⚠️ **EL GUARDIÁN SE MUEVE CON CADA MIGRACIÓN, NO DE UNA VEZ.** Su propio comentario ya lo dice:
*"viaja SIEMPRE con la migración más nueva del repo"*. Si acá lo pusiéramos en `0066`, el test
quedaría **rojo durante toda la tanda** y los pasos de "suite completa en verde" de A4, B5 y C1
serían imposibles de cumplir — o peor, el implementador se acostumbraría a un rojo conocido y
dejaría de mirar los rojos nuevos.

Protocolo, entonces:

| Tarea que crea la migración | El guardián pasa a esperar |
|---|---|
| A1 (`0063`) | 63 |
| B2 (`0064`) | 64 |
| B4 (`0065`) | 65 |
| C3 (`0066`) | 66 |

Cada una de esas tareas tiene su propio paso para moverlo. **Moverlo, no duplicarlo:** en la tanda
10 tres agentes lo copiaron a la vez y quedaron tres copias afirmando números distintos, dos de
ellas rojas para siempre.

- [ ] **Step 1: Comprobar que los números están libres**

Run: `ls supabase/migrations/ | tail -6`
Expected: la última es `0062_foto_aviso_anonimo.sql`. Si aparece una `0063`, PARAR y avisar: el
plan entero asume esa numeración.

- [ ] **Step 2: Dejar el protocolo escrito donde se va a leer**

En `__tests__/db/ultimaMigracion.test.ts`, **sin tocar el número esperado (sigue en 62)**, agregar
al comentario de cabecera:

```
// TANDA 14: este guardian se mueve CON CADA migracion nueva, no de una vez al
// final: 0063 (A1) -> 0064 (B2) -> 0065 (B4) -> 0066 (C3). Ponerlo en 66 desde
// el principio lo dejaria rojo toda la tanda, y un rojo conocido y tolerado es
// como se cuelan los rojos nuevos.
```

- [ ] **Step 3: Correr el test y verlo pasar**

Run: `npx jest __tests__/db/ultimaMigracion.test.ts`
Expected: PASS. La suite arranca la tanda en verde, como corresponde.

- [ ] **Step 4: Commit**

```bash
git add __tests__/db/ultimaMigracion.test.ts
git commit -m "t14-0: protocolo del guardian de migraciones para la tanda"
```

---

# Task A1: Migración 0063 — `lugares` y `difusion_destinos`

**Files:**
- Create: `supabase/migrations/0063_difusion_y_lugares.sql`
- Test: `__tests__/db/migracion0063.test.ts`

**Interfaces:**
- Produces:
  - tabla `public.lugares(id uuid, osm_tipo text, osm_id bigint, nombre text, categoria text, lat double precision, lng double precision, direccion text, comuna text, actualizado_en timestamptz)` con `unique (osm_tipo, osm_id)`
  - tabla `public.difusion_destinos(id uuid, pet_id uuid, tipo text, etiqueta text, lugar_id uuid, institucion_id uuid, estado text, avisado_en timestamptz, creado_en timestamptz)`
  - `public.lugares_cerca(p_pet_id uuid, p_radio_km double precision default 5) returns table (id uuid, nombre text, categoria text, lat double precision, lng double precision, direccion text, comuna text, distancia_km double precision)`

- [ ] **Step 1: Escribir el test estático que falla**

Crear `__tests__/db/migracion0063.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0063_difusion_y_lugares.sql'),
  'utf8',
);

describe('0063: tablero de difusion y semilla de lugares', () => {
  it('NO agrega columnas a pets (media app la lee con select(*))', () => {
    expect(sql).not.toMatch(/alter table public\.pets add column/);
  });

  it('lugares es reimportable: unique por identidad de OSM', () => {
    expect(sql).toMatch(/create table public\.lugares/);
    expect(sql).toMatch(/unique \(osm_tipo, osm_id\)/);
  });

  it('lugares se lee publico y NO lo escribe nadie desde la app', () => {
    expect(sql).toMatch(/grant select on public\.lugares to anon/);
    expect(sql).toMatch(/grant select on public\.lugares to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*public\.lugares to (anon|authenticated)/);
  });

  it('los destinos son del dueño del reporte y de nadie mas', () => {
    expect(sql).toMatch(/create table public\.difusion_destinos/);
    expect(sql).toMatch(/references public\.pets\(id\) on delete cascade/);
    expect(sql).toMatch(/alter table public\.difusion_destinos enable row level security/);
    expect(sql).toMatch(/p\.user_id = auth\.uid\(\)/);
  });

  it('el tipo y el estado son listas cerradas', () => {
    expect(sql).toMatch(/tipo in \('persona', 'lugar', 'institucion'\)/);
    expect(sql).toMatch(/estado in \('pendiente', 'avisado'\)/);
  });

  it('un destino persona no puede colgar de un lugar ni de una institucion', () => {
    expect(sql).toMatch(/difusion_destinos_puntero_por_tipo/);
  });

  it('lugares_cerca tiene tope de radio (leccion de la 0058)', () => {
    expect(sql).toMatch(/least\(coalesce\(p_radio_km, 5\), 50\)/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/db/migracion0063.test.ts`
Expected: FAIL — `ENOENT: no such file or directory ... 0063_difusion_y_lugares.sql`

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/0063_difusion_y_lugares.sql`:

```sql
-- 0063: el tablero de "a quien le avise" y la semilla de lugares (tanda 14, area A).
--
-- POR QUE EXISTE: hay CUATRO caminos de salida hacia afuera de la app (texto a
-- WhatsApp, tarjeta PNG, afiche imprimible, placa de collar) y NINGUNO deja
-- registro. `compartirTarjeta` incluso devuelve un ResultadoCompartir que ningun
-- llamador lee. Se comparte y se olvida.
--
-- NO SE MANDA NINGUN AVISO AUTOMATICO A UN LUGAR DE LA SEMILLA. Una veterinaria
-- que nunca se registro no recibe correo ni push: la lista es una ayuda para que
-- LA PERSONA avise. Decision de Pablo (3-ago) y ademas evita el problema de spam
-- y de la Ley 21.719. El aviso automatico sigue existiendo solo para las
-- instituciones registradas de la 0057, que lo aceptaron.
--
-- MEDICION QUE ORDENO EL DISENO (Overpass, RM, 3-ago-2026): 332 veterinarias y
-- refugios; 91% con nombre, 8% con TELEFONO, 12% con algun contacto, 66% con
-- calle, y UN SOLO refugio en toda la region. Por eso la pantalla promete un
-- RECORRIDO ("estas estan cerca") y no una lista de llamados. La columna de
-- telefono no existe a proposito: prometer menos de lo que se cumple.

-- ── La semilla de lugares ────────────────────────────────────────────────
-- Foto de los datos de OSM en nuestra base. NO se consulta Overpass en vivo:
-- es lento, tiene limites de uso y no esta pensado para trafico de app.
-- Se pobla con scripts/semilla-lugares.js, no desde una migracion: los datos
-- cambian y una migracion los congelaria.
--
-- LICENCIA: los datos son de OpenStreetMap bajo ODbL, que OBLIGA a atribuir.
-- El credito va visible en la pantalla, no escondido en un about.
create table public.lugares (
  id uuid primary key default gen_random_uuid(),
  osm_tipo text not null,
  osm_id bigint not null,
  nombre text not null,
  categoria text not null,
  lat double precision not null,
  lng double precision not null,
  direccion text,
  comuna text,
  actualizado_en timestamptz not null default now(),
  -- Reimportable: volver a correr la semilla ACTUALIZA en vez de duplicar.
  unique (osm_tipo, osm_id)
);

alter table public.lugares drop constraint if exists lugares_categoria_valida;
alter table public.lugares
  add constraint lugares_categoria_valida
  check (categoria in ('veterinaria', 'refugio'));

create index lugares_punto_idx on public.lugares
  using gist (st_setsrid(st_makepoint(lng, lat), 4326)::geography);

alter table public.lugares enable row level security;
create policy "los lugares son publicos"
  on public.lugares for select to anon, authenticated using (true);

-- Lectura para todos, escritura para NADIE desde la app: la semilla entra por
-- el script de mantenimiento (service_role). Sin esto, cualquiera podria
-- inventar una "veterinaria" y aparecer en el recorrido de un caso real.
grant select on public.lugares to anon;
grant select on public.lugares to authenticated;
revoke insert, update, delete on public.lugares from anon, authenticated;

-- ── El tablero ───────────────────────────────────────────────────────────
create table public.difusion_destinos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  tipo text not null,
  -- Un destino 'persona' guarda su texto aca y deja los dos punteros en null.
  etiqueta text,
  lugar_id uuid references public.lugares(id) on delete set null,
  institucion_id uuid references public.profiles(id) on delete set null,
  estado text not null default 'pendiente',
  avisado_en timestamptz,
  creado_en timestamptz not null default now()
);

alter table public.difusion_destinos
  add constraint difusion_destinos_tipo_valido
  check (tipo in ('persona', 'lugar', 'institucion'));
alter table public.difusion_destinos
  add constraint difusion_destinos_estado_valido
  check (estado in ('pendiente', 'avisado'));
-- Coherencia estado/fecha, del mismo modo que la 0048 ata estado y tomada_por.
alter table public.difusion_destinos
  add constraint difusion_destinos_avisado_coherente
  check ((estado = 'avisado') = (avisado_en is not null));
-- Cada tipo cuelga de lo suyo y de nada mas.
alter table public.difusion_destinos
  add constraint difusion_destinos_puntero_por_tipo
  check (
    (tipo = 'persona' and lugar_id is null and institucion_id is null
       and length(btrim(coalesce(etiqueta, ''))) between 1 and 80)
    or (tipo = 'lugar' and lugar_id is not null and institucion_id is null)
    or (tipo = 'institucion' and institucion_id is not null and lugar_id is null)
  );
-- Un mismo lugar no se agrega dos veces al mismo reporte.
create unique index difusion_destinos_lugar_unico
  on public.difusion_destinos (pet_id, lugar_id) where lugar_id is not null;
create index difusion_destinos_pet_idx on public.difusion_destinos (pet_id);

alter table public.difusion_destinos enable row level security;

-- El tablero es del dueño del reporte y de nadie mas: dice a quien le aviso,
-- que es informacion sobre SU red de contactos.
create policy "el tablero es del dueño del reporte"
  on public.difusion_destinos for all to authenticated
  using (exists (select 1 from public.pets p
                  where p.id = difusion_destinos.pet_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.pets p
                       where p.id = difusion_destinos.pet_id and p.user_id = auth.uid()));

-- ── Los lugares cerca de un reporte ──────────────────────────────────────
-- `security definer` para poder leer pets.lat/lng sin exponer la fila entera.
-- El TOPE DE RADIO es la leccion de la 0058: sin el, un p_radio_km de 99.999
-- barre el pais en una funcion concedida a anon.
create or replace function public.lugares_cerca(
  p_pet_id uuid,
  p_radio_km double precision default 5
)
returns table (
  id uuid, nombre text, categoria text, lat double precision,
  lng double precision, direccion text, comuna text, distancia_km double precision
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select l.id, l.nombre, l.categoria, l.lat, l.lng, l.direccion, l.comuna,
         st_distance(
           st_setsrid(st_makepoint(l.lng, l.lat), 4326)::geography,
           st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geography
         ) / 1000 as distancia_km
    from public.pets b
    join public.lugares l
      on st_dwithin(
           st_setsrid(st_makepoint(l.lng, l.lat), 4326)::geography,
           st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geography,
           least(coalesce(p_radio_km, 5), 50) * 1000
         )
   where b.id = p_pet_id
     and b.oculto = false
   order by distancia_km asc, l.id
   limit 60;
$$;

revoke all on function public.lugares_cerca(uuid, double precision) from public;
grant execute on function public.lugares_cerca(uuid, double precision) to authenticated;
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npx jest __tests__/db/migracion0063.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Ensayar contra la base real dentro de `begin … rollback`**

⚠️ NO aplicar todavía. Sólo ensayar. Usar el helper de la sesión anterior
(`scratchpad/q.sh`) o el SQL editor. El SQL a correr es `begin;` + la migración +
estas comprobaciones + `rollback;`:

```sql
create temp table r (n int, caso text, resultado text);
grant all on r to authenticated, anon;
select set_config('mi.pet', (select id::text from public.pets
                              where activo = true and oculto = false limit 1), true);
select set_config('mi.dueno', (select user_id::text from public.pets
                              where id = current_setting('mi.pet')::uuid), true);

-- Un lugar de prueba a 300 m del reporte
insert into public.lugares (osm_tipo, osm_id, nombre, categoria, lat, lng)
select 'node', 999999999, 'Veterinaria de Prueba', 'veterinaria', b.lat + 0.0027, b.lng
  from public.pets b where b.id = current_setting('mi.pet')::uuid;

insert into r select 1, 'lugares_cerca encuentra el de 300 m',
  'filas=' || count(*) || ' distancia_km=' || round(max(distancia_km)::numeric, 2)
  from public.lugares_cerca(current_setting('mi.pet')::uuid, 5);

-- El tope de radio: 99.999 km NO debe barrer el pais
insert into r select 2, 'tope de radio',
  'con 99999 km sigue acotado a 50: filas=' || count(*)
  from public.lugares_cerca(current_setting('mi.pet')::uuid, 99999);

-- El CHECK del puntero por tipo
do $$
begin
  insert into public.difusion_destinos (pet_id, tipo, etiqueta, lugar_id)
  values (current_setting('mi.pet')::uuid, 'persona', 'grupo del edificio',
          (select id from public.lugares limit 1));
  insert into r values (3, 'persona CON puntero a lugar', 'AGUJERO: lo acepto');
exception when check_violation then
  insert into r values (3, 'persona CON puntero a lugar', 'RECHAZADO 23514');
end $$;

-- Coherencia estado/fecha
do $$
begin
  insert into public.difusion_destinos (pet_id, tipo, etiqueta, estado)
  values (current_setting('mi.pet')::uuid, 'persona', 'x', 'avisado');
  insert into r values (4, 'avisado sin fecha', 'AGUJERO: lo acepto');
exception when check_violation then
  insert into r values (4, 'avisado sin fecha', 'RECHAZADO 23514');
end $$;

-- ATAQUE: un tercero lee el tablero ajeno. CON CONTROL: primero sembramos.
insert into public.difusion_destinos (pet_id, tipo, etiqueta)
values (current_setting('mi.pet')::uuid, 'persona', 'la junta de vecinos');
insert into r select 50, 'CONTROL: el destino sembrado existe',
  'filas como postgres=' || count(*) from public.difusion_destinos;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id::text from public.profiles
           where id <> current_setting('mi.dueno')::uuid and eliminado_en is null limit 1),
  'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.difusion_destinos;
  insert into r values (51, 'un TERCERO lee el tablero ajeno',
    'filas visibles=' || n || ' (esperado 0)');
exception when insufficient_privilege then
  insert into r values (51, 'un TERCERO lee el tablero ajeno', 'RECHAZADO 42501');
end $$;
reset role;

-- Y el dueño SI lo ve (sin este control, el 0 de arriba se lee como tabla vacia)
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('mi.dueno'), 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.difusion_destinos;
  insert into r values (52, 'el DUEÑO ve su tablero', 'filas visibles=' || n || ' (esperado 1)');
exception when insufficient_privilege then
  insert into r values (52, 'el DUEÑO ve su tablero', 'RECHAZADO 42501 (ROTO)');
end $$;
reset role;

select n, caso, resultado from r order by n;
```

Expected: caso 1 `filas=1 distancia_km≈0.30`; caso 2 acotado; casos 3 y 4 `RECHAZADO 23514`;
caso 50 `filas=1`; caso 51 `filas visibles=0`; caso 52 `filas visibles=1`.

⚠️ Si el caso 52 diera 0, la policy está de más y el tablero no le funcionaría a nadie: es el
control que evita leer un `revoke` de más como "todo seguro".

- [ ] **Step 6: Mover el guardián de última migración a 63**

En `__tests__/db/ultimaMigracion.test.ts`: `toBe(62)` → `toBe(63)`, el `describe` a
`'0063 es la ultima migracion del repo'`, y la línea de procedencia a `Venia de 0062 (tanda 13).`
**Moverlo, no duplicarlo.**

Run: `npx jest __tests__/db/ultimaMigracion.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0063_difusion_y_lugares.sql __tests__/db/migracion0063.test.ts \
        __tests__/db/ultimaMigracion.test.ts
git commit -m "t14-A1: tablero de difusion y semilla de lugares (0063, ensayada en begin/rollback)"
```

---

# Task A2: `src/lib/difusion.ts` — la lógica pura

**Files:**
- Create: `src/lib/difusion.ts`
- Test: `__tests__/lib/difusion.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sin red).
- Produces:
  - `export const ETIQUETA_MAX = 80`
  - `export type TipoDestino = 'persona' | 'lugar' | 'institucion'`
  - `export type EstadoDestino = 'pendiente' | 'avisado'`
  - `export type Destino = { id: string; petId: string; tipo: TipoDestino; etiqueta: string | null; lugarId: string | null; institucionId: string | null; estado: EstadoDestino; avisadoEn: string | null; creadoEn: string }`
  - `export function validarEtiqueta(texto: string): { ok: boolean; motivo?: string }`
  - `export function agruparDestinos(ds: Destino[]): { pendientes: Destino[]; avisados: Destino[] }`
  - `export function resumenDifusion(ds: Destino[]): string`
  - `export function sugerenciasDePersonas(pet: { comuna?: string | null }): string[]`

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/lib/difusion.test.ts`:

```ts
import {
  agruparDestinos,
  Destino,
  ETIQUETA_MAX,
  resumenDifusion,
  sugerenciasDePersonas,
  validarEtiqueta,
} from '../../src/lib/difusion';

function destino(over: Partial<Destino> = {}): Destino {
  return {
    id: 'd1', petId: 'p1', tipo: 'persona', etiqueta: 'grupo del edificio',
    lugarId: null, institucionId: null, estado: 'pendiente',
    avisadoEn: null, creadoEn: '2026-08-03T10:00:00Z', ...over,
  };
}

describe('validarEtiqueta', () => {
  it('rechaza vacio y solo espacios', () => {
    expect(validarEtiqueta('').ok).toBe(false);
    expect(validarEtiqueta('   ').ok).toBe(false);
  });

  it('rechaza mas largo que el CHECK de la base', () => {
    expect(validarEtiqueta('a'.repeat(ETIQUETA_MAX + 1)).ok).toBe(false);
  });

  it('acepta el largo exacto del tope', () => {
    expect(validarEtiqueta('a'.repeat(ETIQUETA_MAX)).ok).toBe(true);
  });

  it('acepta un caso real', () => {
    expect(validarEtiqueta('el grupo de la junta de vecinos').ok).toBe(true);
  });
});

describe('agruparDestinos', () => {
  it('separa pendientes de avisados sin perder ninguno', () => {
    const ds = [
      destino({ id: 'a' }),
      destino({ id: 'b', estado: 'avisado', avisadoEn: '2026-08-03T11:00:00Z' }),
      destino({ id: 'c' }),
    ];
    const g = agruparDestinos(ds);
    expect(g.pendientes.map((d) => d.id)).toEqual(['a', 'c']);
    expect(g.avisados.map((d) => d.id)).toEqual(['b']);
    expect(g.pendientes.length + g.avisados.length).toBe(ds.length);
  });
});

describe('resumenDifusion — el tono importa', () => {
  it('sin destinos NO reprocha', () => {
    const t = resumenDifusion([]);
    expect(t).not.toMatch(/nadie|todavía no avisaste|deberías/i);
  });

  it('no gamifica: sin porcentajes, sin puntajes, sin felicitaciones', () => {
    const ds = [destino({ id: 'a' }), destino({ id: 'b', estado: 'avisado', avisadoEn: 'x' })];
    const t = resumenDifusion(ds);
    expect(t).not.toMatch(/%|puntos|nivel|felicit|¡bien|racha/i);
  });

  it('cuenta bien en singular y en plural (regla del español: n === 1)', () => {
    const uno = resumenDifusion([destino({ estado: 'avisado', avisadoEn: 'x' })]);
    expect(uno).toMatch(/1 (aviso|contacto|destino)/);
    expect(uno).not.toMatch(/1 avisos/);
    const cero = resumenDifusion([destino()]);
    expect(cero).not.toMatch(/1 avisos?/);
  });
});

describe('sugerenciasDePersonas', () => {
  it('nombra la comuna cuando la hay', () => {
    const s = sugerenciasDePersonas({ comuna: 'Ñuñoa' });
    expect(s.join(' ')).toContain('Ñuñoa');
  });

  it('sin comuna no deja un hueco ni dice "undefined"', () => {
    const s = sugerenciasDePersonas({ comuna: null });
    expect(s.join(' ')).not.toMatch(/undefined|null|\s{2,}/);
    expect(s.length).toBeGreaterThan(0);
  });

  it('ninguna sugerencia pasa el tope de la base', () => {
    for (const s of sugerenciasDePersonas({ comuna: 'Pedro Aguirre Cerda' })) {
      expect(s.length).toBeLessThanOrEqual(ETIQUETA_MAX);
    }
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/lib/difusion.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/difusion'`

- [ ] **Step 3: Escribir el módulo**

Crear `src/lib/difusion.ts`:

```ts
// DIFUSION — la logica pura del tablero de "a quien le avise" (migracion 0063).
// Sin red y sin `new Date()` adentro: todo lo que dependa del reloj se recibe.
//
// TONO (misma regla que cuadrilla.ts y PlanBusqueda.tsx): no gamificar y no
// sonar a "nadie te ayudo". Quien esta buscando a su animal no necesita que le
// midan el esfuerzo; necesita saber que le queda por hacer.

// OJO: el modulo exporta `pluralizar`, no `plural`.
import { pluralizar } from './plural';

export const ETIQUETA_MAX = 80;

export type TipoDestino = 'persona' | 'lugar' | 'institucion';
export type EstadoDestino = 'pendiente' | 'avisado';

export type Destino = {
  id: string;
  petId: string;
  tipo: TipoDestino;
  etiqueta: string | null;
  lugarId: string | null;
  institucionId: string | null;
  estado: EstadoDestino;
  avisadoEn: string | null;
  creadoEn: string;
};

export function validarEtiqueta(texto: string): { ok: boolean; motivo?: string } {
  const limpio = texto.trim();
  if (limpio.length === 0) return { ok: false, motivo: 'Escribí a quién le vas a avisar.' };
  if (limpio.length > ETIQUETA_MAX) {
    return { ok: false, motivo: `Máximo ${ETIQUETA_MAX} caracteres.` };
  }
  return { ok: true };
}

export function agruparDestinos(ds: Destino[]): { pendientes: Destino[]; avisados: Destino[] } {
  return {
    pendientes: ds.filter((d) => d.estado === 'pendiente'),
    avisados: ds.filter((d) => d.estado === 'avisado'),
  };
}

export function resumenDifusion(ds: Destino[]): string {
  const { avisados } = agruparDestinos(ds);
  if (ds.length === 0) return 'Anotá a quién le vas a avisar para no repetirte ni olvidarte.';
  if (avisados.length === 0) return 'Todavía no marcaste ninguno como avisado.';
  // `pluralizar` existe desde el pulido de la tanda 9: la regla en español es
  // n === 1, no n > 1 (con cero va el plural).
  return `Marcaste ${avisados.length} ${pluralizar(avisados.length, 'aviso', 'avisos')}.`;
}

export function sugerenciasDePersonas(pet: { comuna?: string | null }): string[] {
  const comuna = pet.comuna?.trim();
  const base = [
    'El grupo de WhatsApp del edificio o del pasaje',
    'La junta de vecinos',
    'El kiosco, la panadería y el almacén de la cuadra',
    'Los que pasean perros a la misma hora',
  ];
  if (comuna) base.push(`El grupo de compra y venta de ${comuna}`);
  return base.map((s) => s.slice(0, ETIQUETA_MAX));
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/lib/difusion.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Confirmar la firma de `pluralizar`**

Run: `grep -n "export function pluralizar" -A 3 src/lib/plural.ts`
Expected exacto (verificado el 3-ago-2026):

```ts
export function pluralizar(n: number, singular: string, plural: string): string {
  return Math.abs(n) === 1 ? singular : plural;
}
```

Si difiere, adaptar la llamada en `resumenDifusion` — **NO** cambiar `plural.ts`, que ya tiene sus
propios tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/difusion.ts __tests__/lib/difusion.test.ts
git commit -m "t14-A2: logica pura del tablero de difusion, con el tono atado por tests"
```

---

# Task A3: `src/services/difusion.ts` — el acceso a datos

**Files:**
- Create: `src/services/difusion.ts`
- Test: `__tests__/services/difusion.test.ts`

**Interfaces:**
- Consumes: `Destino`, `TipoDestino` de `src/lib/difusion.ts`; `esMigracionSinAplicar` de `src/lib/dbErrors.ts`.
- Produces:
  - `export type EstadoTablero = { tipo: 'no-disponible' } | { tipo: 'listo'; destinos: Destino[] }`
  - `export type LugarCerca = { id: string; nombre: string; categoria: 'veterinaria' | 'refugio'; lat: number; lng: number; direccion: string | null; comuna: string | null; distanciaKm: number }`
  - `export async function listarDestinos(petId: string): Promise<EstadoTablero>`
  - `export async function lugaresCerca(petId: string, radioKm: number): Promise<LugarCerca[]>`
  - `export async function agregarPersona(petId: string, etiqueta: string): Promise<Destino>`
  - `export async function agregarLugar(petId: string, lugarId: string): Promise<Destino | null>`
  - `export async function marcarAvisado(id: string, avisado: boolean): Promise<void>`
  - `export async function borrarDestino(id: string): Promise<void>`

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/services/difusion.test.ts`. Mockea `../../src/lib/supabase`:

```ts
jest.mock('../../src/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { supabase } from '../../src/lib/supabase';
import { listarDestinos, marcarAvisado } from '../../src/services/difusion';

const mockFrom = supabase.from as jest.Mock;

describe('listarDestinos', () => {
  it('degrada a no-disponible si la migracion no esta aplicada (PGRST205)', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'not found' } }),
        }),
      }),
    });
    await expect(listarDestinos('p1')).resolves.toEqual({ tipo: 'no-disponible' });
  });

  it('un corte de red NO se disfraza de no-disponible: se propaga', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({ data: null, error: { code: '08006', message: 'network' } }),
        }),
      }),
    });
    await expect(listarDestinos('p1')).rejects.toBeDefined();
  });
});

describe('marcarAvisado — el silencio de la RLS', () => {
  it('lanza si el update no devuelve fila (200 + 0 filas, NO 42501)', async () => {
    // Ojo: la RLS de PostgREST rechaza en silencio. Este test NO mockea 42501
    // a proposito: esa es justo la respuesta que la RLS no da.
    mockFrom.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
    });
    await expect(marcarAvisado('d1', true)).rejects.toBeDefined();
  });

  it('no lanza cuando volvio la fila', async () => {
    mockFrom.mockReturnValue({
      update: () => ({
        eq: () => ({ select: () => Promise.resolve({ data: [{ id: 'd1' }], error: null }) }),
      }),
    });
    await expect(marcarAvisado('d1', true)).resolves.toBeUndefined();
  });

  it('desmarcar manda avisado_en en null, para no romper el CHECK de coherencia', async () => {
    let enviado: any = null;
    mockFrom.mockReturnValue({
      update: (v: any) => {
        enviado = v;
        return { eq: () => ({ select: () => Promise.resolve({ data: [{ id: 'd1' }], error: null }) }) };
      },
    });
    await marcarAvisado('d1', false);
    expect(enviado).toEqual({ estado: 'pendiente', avisado_en: null });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/services/difusion.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/difusion'`

- [ ] **Step 3: Escribir el servicio**

Crear `src/services/difusion.ts`:

```ts
import { supabase } from '../lib/supabase';
import { esMigracionSinAplicar } from '../lib/dbErrors';
import { Destino, TipoDestino } from '../lib/difusion';

// DIFUSION — acceso a `difusion_destinos` y `lugares` (migracion 0063).
// La logica pura vive en `src/lib/difusion.ts`.
//
// DOS COSAS QUE ESTE ARCHIVO TIENE QUE HACER BIEN, SI O SI (mismo criterio que
// services/cuadrilla.ts):
//
// 1. LA MIGRACION PUEDE NO ESTAR APLICADA. PostgREST devuelve 404 + PGRST205
//    (tabla) o PGRST202 (funcion) y la app tiene que seguir funcionando IGUAL,
//    con la seccion simplemente ausente. Un corte de red NO es lo mismo: se
//    propaga, para que haya algo que reintentar.
// 2. LA RLS RECHAZA EN SILENCIO: 200 con 0 filas, no 42501. Por eso toda
//    escritura pide `.select(...)` y mira `data.length === 0`. Es la QUINTA
//    aparicion de este silencio en el proyecto.

export type EstadoTablero = { tipo: 'no-disponible' } | { tipo: 'listo'; destinos: Destino[] };

export type LugarCerca = {
  id: string;
  nombre: string;
  categoria: 'veterinaria' | 'refugio';
  lat: number;
  lng: number;
  direccion: string | null;
  comuna: string | null;
  distanciaKm: number;
};

function aDestino(row: any): Destino {
  return {
    id: row.id,
    petId: row.pet_id,
    tipo: row.tipo as TipoDestino,
    etiqueta: row.etiqueta ?? null,
    lugarId: row.lugar_id ?? null,
    institucionId: row.institucion_id ?? null,
    estado: row.estado,
    avisadoEn: row.avisado_en ?? null,
    creadoEn: row.creado_en,
  };
}

export async function listarDestinos(petId: string): Promise<EstadoTablero> {
  const { data, error } = await supabase
    .from('difusion_destinos')
    .select('*')
    .eq('pet_id', petId)
    .order('creado_en', { ascending: true });

  if (error) {
    if (esMigracionSinAplicar(error)) return { tipo: 'no-disponible' };
    throw error;
  }
  return { tipo: 'listo', destinos: (data ?? []).map(aDestino) };
}

export async function lugaresCerca(petId: string, radioKm: number): Promise<LugarCerca[]> {
  const { data, error } = await supabase.rpc('lugares_cerca', {
    p_pet_id: petId,
    p_radio_km: radioKm,
  });
  if (error) {
    // Sin lugares la pantalla lo dice y ofrece agregar a mano; no es un error
    // que valga tapar el tablero entero.
    if (esMigracionSinAplicar(error)) return [];
    throw error;
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    lat: r.lat,
    lng: r.lng,
    direccion: r.direccion ?? null,
    comuna: r.comuna ?? null,
    distanciaKm: r.distancia_km,
  }));
}

export async function agregarPersona(petId: string, etiqueta: string): Promise<Destino> {
  const { data, error } = await supabase
    .from('difusion_destinos')
    .insert({ pet_id: petId, tipo: 'persona', etiqueta: etiqueta.trim() })
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo agregar el destino.');
  return aDestino(data[0]);
}

export async function agregarLugar(petId: string, lugarId: string): Promise<Destino | null> {
  const { data, error } = await supabase
    .from('difusion_destinos')
    .insert({ pet_id: petId, tipo: 'lugar', lugar_id: lugarId })
    .select();
  // El indice unico (pet_id, lugar_id) hace que agregar dos veces el mismo
  // lugar sea un no-op silencioso, no un error que asuste.
  if (error) {
    if ((error as any).code === '23505') return null;
    throw error;
  }
  if (!data || data.length === 0) throw new Error('No se pudo agregar el lugar.');
  return aDestino(data[0]);
}

export async function marcarAvisado(id: string, avisado: boolean): Promise<void> {
  // `avisado_en` va en null al desmarcar o el CHECK de coherencia de la 0063
  // rechaza la fila.
  const cambio = avisado
    ? { estado: 'avisado', avisado_en: new Date().toISOString() }
    : { estado: 'pendiente', avisado_en: null };
  const { data, error } = await supabase
    .from('difusion_destinos')
    .update(cambio)
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo actualizar el destino.');
}

export async function borrarDestino(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('difusion_destinos')
    .delete()
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo borrar el destino.');
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/services/difusion.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/services/difusion.ts __tests__/services/difusion.test.ts
git commit -m "t14-A3: servicio del tablero, con degradacion y el silencio de la RLS cubiertos"
```

---

# Task A4: `TableroDifusion` y sus tres puntos de montaje

**Files:**
- Create: `src/components/TableroDifusion.tsx`
- Test: `__tests__/components/tableroDifusion.test.tsx`
- Modify: `src/screens/PetDetailScreen.tsx`, `src/screens/CuadrillaScreen.tsx`,
  `src/components/PlanBusqueda.tsx`

**Interfaces:**
- Consumes: todo lo de A2 y A3; `armarNombreArchivo` y `AficheGenerator` ya existentes;
  `radioSugerido` de `src/lib/radioSugerido.ts`.
- Produces: `export function TableroDifusion(props: { pet: Pick<Pet, 'id'|'especie'|'comuna'|'creado_en'|'ambito'>; onAfiche?: () => void }): JSX.Element | null`

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/components/tableroDifusion.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('../../src/services/difusion', () => ({
  listarDestinos: jest.fn(),
  lugaresCerca: jest.fn(),
  agregarPersona: jest.fn(),
  agregarLugar: jest.fn(),
  marcarAvisado: jest.fn(),
  borrarDestino: jest.fn(),
}));

import { listarDestinos, lugaresCerca } from '../../src/services/difusion';
import { TableroDifusion } from '../../src/components/TableroDifusion';

const pet = {
  id: 'p1', especie: 'perro' as const, comuna: 'Ñuñoa',
  creado_en: '2026-08-01T10:00:00Z', ambito: null,
};

beforeEach(() => {
  (lugaresCerca as jest.Mock).mockResolvedValue([]);
});

it('con la migracion sin aplicar no renderiza nada (la ficha sigue igual)', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'no-disponible' });
  const { toJSON } = render(<TableroDifusion pet={pet} />);
  await waitFor(() => expect(listarDestinos).toHaveBeenCalled());
  expect(toJSON()).toBeNull();
});

it('atribuye a OpenStreetMap cuando muestra lugares (ODbL lo obliga)', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'listo', destinos: [] });
  (lugaresCerca as jest.Mock).mockResolvedValue([
    { id: 'l1', nombre: 'Vet Central', categoria: 'veterinaria', lat: -33.4, lng: -70.6,
      direccion: 'Irarrázaval 100', comuna: 'Ñuñoa', distanciaKm: 0.4 },
  ]);
  const { findByText } = render(<TableroDifusion pet={pet} />);
  expect(await findByText(/colaboradores de OpenStreetMap/i)).toBeTruthy();
});

it('NO promete telefono: no dice "llamá a" ni muestra un numero inventado', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'listo', destinos: [] });
  (lugaresCerca as jest.Mock).mockResolvedValue([
    { id: 'l1', nombre: 'Vet Central', categoria: 'veterinaria', lat: -33.4, lng: -70.6,
      direccion: null, comuna: 'Ñuñoa', distanciaKm: 0.4 },
  ]);
  const { queryByText, toJSON } = render(<TableroDifusion pet={pet} />);
  await waitFor(() => expect(lugaresCerca).toHaveBeenCalled());
  expect(queryByText(/llamá a|llamar a|teléfono:/i)).toBeNull();
  expect(JSON.stringify(toJSON())).not.toMatch(/\+56\s?9/);
});

it('el radio de los lugares sale de radioSugerido, no de un numero escrito a mano', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'listo', destinos: [] });
  // Reloj fijo: el radio se amplia con los dias, asi que sin fijarlo el test
  // se pondria rojo solo con el paso del tiempo.
  jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00Z'));
  const { radioSugerido } = require('../../src/lib/radioSugerido');
  const esperado = radioSugerido({ especie: 'perro', ambito: undefined, dias: 2 }).km;

  render(<TableroDifusion pet={pet} />);
  await waitFor(() => expect(lugaresCerca).toHaveBeenCalled());

  const radioUsado = (lugaresCerca as jest.Mock).mock.calls[0][1];
  expect(typeof radioUsado).toBe('number');   // NO el objeto entero
  expect(radioUsado).toBe(esperado);
  jest.useRealTimers();
});

it('el componente NO tiene un radio escrito a mano', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'TableroDifusion.tsx'), 'utf8');
  expect(fuente).toMatch(/radioSugerido/);
  // Un literal de km suelto seria la segunda fuente de verdad que el
  // Critical #4 de la tanda 10 vino a matar.
  expect(fuente).not.toMatch(/lugaresCerca\([^,]+,\s*\d/);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/components/tableroDifusion.test.tsx`
Expected: FAIL — `Cannot find module '../../src/components/TableroDifusion'`

- [ ] **Step 3: Confirmar la firma de `radioSugerido`**

Run: `grep -n "export function radioSugerido" -A 3 src/lib/radioSugerido.ts`
Expected exacto (verificado el 3-ago-2026):

```ts
export function radioSugerido({ especie, ambito, dias }: EntradaRadio): RadioSugerido
```

⚠️ **Devuelve un OBJETO `{ km, inicialKm, topeKm, enElTope, motivo }`, no un número.** Hay que leer
`.km`. Pasarle el objeto entero a `lugaresCerca` mandaría `p_radio_km` como objeto y la RPC
devolvería 0 lugares en silencio.

**NO inventar un radio nuevo en el componente**: sería una segunda fuente de verdad para lo mismo,
que es exactamente el Critical #4 de la tanda 10 (la tarjeta decía "buscá 1 km" y el plan, veinte
píxeles más abajo, "no se fue lejos").

- [ ] **Step 4: Escribir el componente**

Crear `src/components/TableroDifusion.tsx`. Estructura obligatoria (el detalle visual sigue los
componentes del repo: `Card`, `AppText`, `Title`, `Button`, `Input`):

```tsx
// TABLERO DE DIFUSION — "¿a quién le avisé?" (migracion 0063).
//
// POR QUE EXISTE: hay cuatro caminos de salida (texto, tarjeta, afiche, placa)
// y ninguno dejaba registro. Quien busca a su animal termina sin saber a quien
// ya le aviso, y repite o se olvida.
//
// LO QUE ESTE COMPONENTE NO HACE: no manda nada. Ningun lugar de la semilla
// recibe un correo ni un push. La lista es para que LA PERSONA avise.
//
// ATRIBUCION: los lugares son datos de OpenStreetMap bajo ODbL, que OBLIGA a
// atribuir. El credito va visible acá abajo, no escondido en un about.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
// ... imports del repo (Card, AppText, Title, Button, Input, Ionicons, colors)
import { radioSugerido } from '../lib/radioSugerido';
import { urlBusquedaMapa, abrirEnlace } from '../lib/mapas';
import {
  agruparDestinos, Destino, resumenDifusion, sugerenciasDePersonas, validarEtiqueta,
} from '../lib/difusion';
import {
  agregarLugar, agregarPersona, borrarDestino, listarDestinos, LugarCerca, lugaresCerca,
  marcarAvisado,
} from '../services/difusion';

export function TableroDifusion({ pet, onAfiche }: Props) {
  const [estado, setEstado] = useState<'cargando' | 'no-disponible' | 'listo'>('cargando');
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [lugares, setLugares] = useState<LugarCerca[]>([]);

  // El radio sale de radioSugerido (tanda 10), que ya calibra por especie,
  // ambito y dias transcurridos. Un numero nuevo aca seria una SEGUNDA fuente
  // de verdad para lo mismo (Critical #4 de la tanda 10).
  // OJO: devuelve un OBJETO. Hay que leer `.km`.
  const radioKm = useMemo(() => {
    const dias = Math.max(
      0,
      Math.floor((Date.now() - new Date(pet.creado_en).getTime()) / 86_400_000),
    );
    return radioSugerido({ especie: pet.especie, ambito: pet.ambito ?? undefined, dias }).km;
  }, [pet.especie, pet.ambito, pet.creado_en]);

  const cargar = useCallback(async () => {
    const t = await listarDestinos(pet.id);
    if (t.tipo === 'no-disponible') {
      setEstado('no-disponible');
      return;
    }
    setDestinos(t.destinos);
    // Los lugares son un agregado: si fallan, el tablero se muestra igual con
    // los destinos que el dueño escribio a mano.
    setLugares(await lugaresCerca(pet.id, radioKm).catch(() => []));
    setEstado('listo');
  }, [pet.id, radioKm]);

  useEffect(() => { void cargar(); }, [cargar]);

  // La ficha tiene que quedar EXACTAMENTE como hoy si la migracion no esta.
  if (estado === 'no-disponible') return null;
  if (estado === 'cargando') return null;

  const { pendientes, avisados } = agruparDestinos(destinos);
  // ... render: resumenDifusion(destinos), la lista de pendientes con su
  // casilla accesible, los lugares con "Buscar en Maps", el input para agregar
  // una persona con validarEtiqueta, y AL FINAL la atribucion obligatoria.
}
```

Requisitos que los tests fijan y que la implementación debe cumplir:
- `estado === 'no-disponible'` ⇒ `return null`.
- Si hay lugares, se renderiza el texto literal `© colaboradores de OpenStreetMap`.
- Un `lugar` muestra nombre, categoría, distancia y dirección **si la hay**; y un botón
  "Buscar en Maps" que llama `abrirEnlace(urlBusquedaMapa(nombre + ' ' + (comuna ?? '')))`.
  **Nunca** un teléfono ni el verbo "llamá".
- Cada destino tiene una casilla accesible para marcar avisado: `accessibilityRole="checkbox"` y
  `accessibilityState={{ checked }}` (el guardián `casillasAccesibles.test.ts` ya existe y lo exige).
- El botón "Crear el afiche" llama `onAfiche` cuando viene, para no duplicar `AficheGenerator`.

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `npx jest __tests__/components/tableroDifusion.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Montar en `PetDetailScreen`**

En `src/screens/PetDetailScreen.tsx`, montar `<TableroDifusion pet={pet} onAfiche={...} />`
reusando el `onAfiche` que ya alimenta `AficheGenerator`. Gate: `esMio && !reunida && pet.estado === 'perdida'`, el mismo que ya usa `PlanBusqueda` (línea ~751).

⚠️ **Orden en la ficha:** va **arriba** del plan de búsqueda, no debajo. La deuda anotada de la
tanda 10 dice que la cuadrilla —lo que más reencuentros consigue— quedó después de scrollear el
plan entero; no repetir el error con el tablero.

- [ ] **Step 7: Hacer el afiche alcanzable desde `CuadrillaScreen`**

En `src/screens/CuadrillaScreen.tsx`, montar `AficheGenerator` con el mismo patrón que
`PetDetailScreen.tsx:1321`, **sin** el gate `esMio`: un vecino que tomó "pegar 10 carteles" tiene
que poder bajar el PNG desde donde tomó la tarea. Hoy los dos módulos comparten intención y no
comparten ni un import.

Test que lo ata, en el mismo archivo de tests del tablero:

```tsx
it('CuadrillaScreen puede generar el afiche sin ser el dueño', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'screens', 'CuadrillaScreen.tsx'), 'utf8');
  expect(fuente).toMatch(/AficheGenerator/);
  // el gate de propiedad no debe envolver al generador
  expect(fuente).not.toMatch(/esMio\s*&&\s*<AficheGenerator/);
});
```

- [ ] **Step 8: Enlazar el plan al tablero en vez de duplicarlo**

En `src/components/PlanBusqueda.tsx`, el paso `avisa-a-tu-barrio` y el paso
`llama-veterinarias-y-refugios` pasan a ofrecer "Abrir el tablero" en vez de repetir el texto.
NO se borra ningún paso (romper `PASOS_PLAN` rompe `planLocal` y sus ids guardados).

- [ ] **Step 9: Suite completa y typecheck**

Run: `npx tsc --noEmit && npx jest`
Expected: 0 errores de tipos, todo verde. **Comprobar el código de salida de verdad**, sin `tail`.

- [ ] **Step 10: Commit**

```bash
git add src/components/TableroDifusion.tsx __tests__/components/tableroDifusion.test.tsx \
        src/screens/PetDetailScreen.tsx src/screens/CuadrillaScreen.tsx src/components/PlanBusqueda.tsx
git commit -m "t14-A4: el tablero en la ficha, el afiche alcanzable desde la cuadrilla, y el plan enlaza"
```

---

# Task A5: Script de semilla de lugares

**Files:**
- Create: `scripts/semilla-lugares.js`
- Test: `__tests__/lib/semillaLugares.test.js`

**Interfaces:**
- Produces: `module.exports = { normalizarElemento, aFilas }` para poder probarlo sin red.

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/lib/semillaLugares.test.js`:

```js
const { normalizarElemento } = require('../../scripts/semilla-lugares');

describe('normalizarElemento', () => {
  it('descarta lo que no tiene nombre (el 9% de OSM en la RM)', () => {
    expect(normalizarElemento({ type: 'node', id: 1, lat: -33, lon: -70, tags: {} })).toBeNull();
  });

  it('toma el centro de un way (no tiene lat/lon propias)', () => {
    const r = normalizarElemento({
      type: 'way', id: 7, center: { lat: -33.4, lon: -70.6 },
      tags: { name: 'Vet Sur', amenity: 'veterinary' },
    });
    expect(r).toMatchObject({ osm_tipo: 'way', osm_id: 7, lat: -33.4, lng: -70.6 });
  });

  it('mapea la categoria y descarta las que no nos sirven', () => {
    const vet = normalizarElemento({ type: 'node', id: 2, lat: -33, lon: -70,
      tags: { name: 'A', amenity: 'veterinary' } });
    expect(vet.categoria).toBe('veterinaria');
    const ref = normalizarElemento({ type: 'node', id: 3, lat: -33, lon: -70,
      tags: { name: 'B', amenity: 'animal_shelter' } });
    expect(ref.categoria).toBe('refugio');
    expect(normalizarElemento({ type: 'node', id: 4, lat: -33, lon: -70,
      tags: { name: 'C', amenity: 'cafe' } })).toBeNull();
  });

  it('arma la direccion con calle y numero, y la deja null si no hay calle', () => {
    const con = normalizarElemento({ type: 'node', id: 5, lat: -33, lon: -70,
      tags: { name: 'D', amenity: 'veterinary', 'addr:street': 'Irarrázaval', 'addr:housenumber': '100' } });
    expect(con.direccion).toBe('Irarrázaval 100');
    const sin = normalizarElemento({ type: 'node', id: 6, lat: -33, lon: -70,
      tags: { name: 'E', amenity: 'veterinary', 'addr:housenumber': '100' } });
    expect(sin.direccion).toBeNull();
  });

  it('NO inventa telefono: la fila no lleva esa columna', () => {
    const r = normalizarElemento({ type: 'node', id: 8, lat: -33, lon: -70,
      tags: { name: 'F', amenity: 'veterinary', phone: '+56 2 1234 5678' } });
    expect(Object.keys(r)).not.toContain('telefono');
    expect(JSON.stringify(r)).not.toContain('1234');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/lib/semillaLugares.test.js`
Expected: FAIL — `Cannot find module '../../scripts/semilla-lugares'`

- [ ] **Step 3: Escribir el script**

Crear `scripts/semilla-lugares.js`:

```js
#!/usr/bin/env node
// SEMILLA DE LUGARES — pobla `lugares` (0063) desde OpenStreetMap vía Overpass.
//
// NO ES UNA MIGRACION a proposito: los datos cambian y una migracion los
// congelaria. Se corre a mano cuando haga falta refrescar.
//
// LICENCIA: los datos son ODbL. Quien los muestre TIENE que atribuir
// "© colaboradores de OpenStreetMap". La pantalla del tablero ya lo hace.
//
// LO QUE NO GUARDAMOS: el telefono. Medido el 3-ago-2026 sobre la RM, solo el
// 8% de las veterinarias lo tiene publicado en OSM. Guardar una columna que
// esta vacia en 9 de cada 10 filas invita a que la pantalla prometa "llamá a
// estas 12" y despues no haya a quien llamar.
//
// Uso:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/semilla-lugares.js CL-RM

const CATEGORIAS = { veterinary: 'veterinaria', animal_shelter: 'refugio' };

function normalizarElemento(el) {
  const tags = el.tags || {};
  const nombre = (tags.name || '').trim();
  if (!nombre) return null;                       // sin nombre no sirve de nada
  const categoria = CATEGORIAS[tags.amenity];
  if (!categoria) return null;

  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lng = el.lon != null ? el.lon : el.center && el.center.lon;
  if (lat == null || lng == null) return null;

  const calle = (tags['addr:street'] || '').trim();
  const numero = (tags['addr:housenumber'] || '').trim();
  const direccion = calle ? (numero ? `${calle} ${numero}` : calle) : null;

  return {
    osm_tipo: el.type,
    osm_id: el.id,
    nombre,
    categoria,
    lat,
    lng,
    direccion,
    comuna: (tags['addr:city'] || tags['addr:suburb'] || '').trim() || null,
  };
}

function aFilas(elementos) {
  return elementos.map(normalizarElemento).filter(Boolean);
}

async function main() {
  const region = process.argv[2] || 'CL-RM';
  const query = `[out:json][timeout:180];area["ISO3166-2"="${region}"]->.a;` +
    `(node["amenity"~"veterinary|animal_shelter"](area.a);` +
    `way["amenity"~"veterinary|animal_shelter"](area.a););out tags center;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass respondió ${res.status}`);
  const filas = aFilas((await res.json()).elements || []);
  console.log(`${region}: ${filas.length} lugares con nombre y categoría útil`);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');

  // `resolution=merge-duplicates` + el unique (osm_tipo, osm_id) hacen que
  // re-correr la semilla ACTUALICE en vez de duplicar.
  const up = await fetch(`${url}/rest/v1/lugares?on_conflict=osm_tipo,osm_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(filas.map((f) => ({ ...f, actualizado_en: new Date().toISOString() }))),
  });
  if (!up.ok) throw new Error(`Supabase respondió ${up.status}: ${await up.text()}`);
  console.log('Semilla aplicada.');
}

module.exports = { normalizarElemento, aFilas };

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/lib/semillaLugares.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/semilla-lugares.js __tests__/lib/semillaLugares.test.js
git commit -m "t14-A5: semilla de lugares desde OSM, sin columna de telefono a proposito"
```

⚠️ **NO correr el script contra producción todavía.** Va en la tarea INT, después de aplicar la
`0063`.

---

# Task B1: Medir el modelo de embeddings — HECHA, con resultado NO-GO

⚠️ **ESTA TAREA YA SE EJECUTÓ Y CAMBIÓ EL ÁREA B. No la repitas.** Queda acá como registro de por
qué el área tiene la forma que tiene.

**Qué se midió:** si CLIP (`Xenova/clip-vit-base-patch32`, `image-feature-extraction`) podía correr
dentro de una Edge Function de Supabase, para calcular el vector en el servidor y que la función
existiera igual en la web y en el build nativo de Android.

**Resultado: NO-GO.** Tres variantes de import, las tres fallidas por la misma raíz — el runtime
Deno de Supabase **no registra ningún backend de ONNX Runtime**:

| Variante | Resultado |
|---|---|
| `@huggingface/transformers@3.0.0` por jsDelivr | 500; revienta dentro de `from_pretrained` |
| `@xenova/transformers@2.17.2` por jsDelivr (la de la doc de Supabase) | 500 a los ~41,6 s; `Cannot read properties of undefined (reading 'create')` |
| Igual por `esm.sh` | Ni bundlea: `esm.sh` intenta resolver `onnxruntime-node`, que son bindings nativos de Node |
| V1 + `env.backends.onnx.wasm.numThreads = 1` | `env.backends.onnx` ya es `undefined` antes de llegar a `pipeline()` |

**Y Cloudflare Workers AI tampoco sirve** (verificado en su catálogo el 3-ago-2026): tiene modelos
de embedding de **texto** (BGE, EmbeddingGemma, Qwen3) pero **ninguno acepta imágenes**; sus modelos
de visión generan texto desde una imagen o clasifican, no devuelven el vector. No hay CLIP.

**Decisión de Pablo (3-ago), con las dos rutas de servidor cerradas: el vector se calcula EN EL
NAVEGADOR.** Consecuencias que el resto del área B tiene que respetar:

1. **Sólo la web calcula vectores.** Un reporte publicado desde la app nativa de Android no tendrá
   vector, y **eso está bien**: la regla global "lo que falta nunca descarta" ya lo cubre — ese
   reporte encuentra coincidencias exactamente como hoy, sólo no gana el punto de la foto. La web es
   además la única plataforma publicada.
2. **El cliente escribe en `pet_fotos_vector`**, no una Edge Function. Eso cambia la RLS de la
   migración `0064` respecto de lo que decía el plan original: hay que dejar insertar, acotado a los
   reportes propios.
3. **Nunca automático.** El modelo pesa unos 40 MB la primera vez, así que el cálculo va detrás de
   un botón que lo explica, y jamás en el camino de publicar.
4. **La Edge Function `foto-vector` NO se construye.** La Task B3 pasa a ser un módulo del cliente.

# Task B2: Migración 0064 — `pgvector` y `pet_fotos_vector`

**Files:**
- Create: `supabase/migrations/0064_vectores_de_foto.sql`
- Test: `__tests__/db/migracion0064.test.ts`

**Interfaces:**
- Produces: tabla `public.pet_fotos_vector(id uuid, pet_id uuid, foto_url text, embedding vector(512), creado_en timestamptz)` con `unique (pet_id, foto_url)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/db/migracion0064.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0064_vectores_de_foto.sql'), 'utf8');

describe('0064: vectores de foto', () => {
  it('NO agrega columnas a pets', () => {
    expect(sql).not.toMatch(/alter table public\.pets add column/);
  });

  it('la extension se crea de forma idempotente', () => {
    expect(sql).toMatch(/create extension if not exists vector/);
  });

  it('el vector tiene las 512 dimensiones de CLIP ViT-B\/32', () => {
    expect(sql).toMatch(/embedding vector\(512\)/);
  });

  it('una foto no se vectoriza dos veces', () => {
    expect(sql).toMatch(/unique \(pet_id, foto_url\)/);
  });

  it('el vector lo escribe el dueño del reporte y NADIE mas', () => {
    expect(sql).toMatch(/alter table public\.pet_fotos_vector enable row level security/);
    // El cliente web calcula el vector (B1 dio NO-GO en el servidor), asi que
    // tiene que poder escribir — pero solo sobre SUS reportes.
    expect(sql).toMatch(/p\.user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/with check/);
  });

  it('anon no escribe ni lee vectores', () => {
    expect(sql).toMatch(/revoke[^;]*on public\.pet_fotos_vector from[^;]*anon/);
    expect(sql).not.toMatch(/to anon/);
  });

  it('el vector NO se puede leer desde el cliente (seria un oraculo de parecido)', () => {
    expect(sql).not.toMatch(/create policy[^;]*for select[^;]*pet_fotos_vector/);
  });

  it('se borra con el reporte', () => {
    expect(sql).toMatch(/references public\.pets\(id\) on delete cascade/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/db/migracion0064.test.ts`
Expected: FAIL — ENOENT.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/0064_vectores_de_foto.sql`:

```sql
-- 0064: vectores de foto para la coincidencia (tanda 14, area B).
--
-- TABLA APARTE, NO UNA COLUMNA EN `pets`: media app lee pets con select('*') y
-- una columna nueva que falte rompe la ficha entera. Es la misma razon de
-- `pet_chips` (0054) y de las tres tablas de la cuadrilla (0048).
--
-- QUE SE VECTORIZA: SOLO fotos de reportes, que ya son publicas. Las fotos de
-- avisos anonimos viven en el bucket privado `avisos-anonimos` (0062) y NO se
-- tocan: su vector seria un dato derivado de una imagen que su autor mando en
-- privado.
--
-- QUIEN ESCRIBE, Y POR QUE ES EL CLIENTE: la Task B1 midio que CLIP no corre en
-- una Edge Function de Supabase (el runtime Deno no registra ningun backend de
-- ONNX Runtime, tres variantes de import probadas) y que Cloudflare Workers AI
-- no tiene ningun modelo de embedding que acepte imagenes. Con las dos rutas de
-- servidor cerradas, Pablo decidio calcular el vector EN EL NAVEGADOR. Asi que
-- escribe el cliente, acotado por RLS a sus propios reportes.
--
-- LO QUE ESO CONCEDE, DICHO DE FRENTE: alguien puede plantar en SU reporte un
-- vector que no corresponde a su foto —por ejemplo el de la foto publica de otro
-- reporte— y fabricarse una coincidencia hacia esa persona. No es un agujero
-- nuevo: subir directamente la foto ajena como foto del reporte consigue lo
-- mismo y ya era posible. Lo que la RLS SI impide es tocar el vector de un
-- reporte ajeno.
--
-- Y NO SE PUEDE LEER: sin policy de SELECT, el vector no sale nunca al cliente.
-- Si saliera seria un oraculo de parecido — cualquiera podria medir cuanto se
-- parece su foto a la de un reporte ajeno sin que nadie se entere.

create extension if not exists vector;

create table public.pet_fotos_vector (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  foto_url text not null,
  embedding vector(512) not null,
  creado_en timestamptz not null default now(),
  unique (pet_id, foto_url)
);

create index pet_fotos_vector_pet_idx on public.pet_fotos_vector (pet_id);

alter table public.pet_fotos_vector enable row level security;

-- SIN policy de SELECT a proposito: el vector no sale nunca al cliente (ver
-- arriba). Quien lo lee es `buscar_coincidencias`, que es security definer.
--
-- INSERT y UPDATE acotados al dueño del reporte. El `with check` es lo que de
-- verdad ata la escritura: sin el, la policy solo filtraria que filas se pueden
-- mirar para actualizar, no cuales se pueden crear (es exactamente la forma del
-- agujero de escalada de privilegios que aparecio en `profiles`, donde un
-- `for update using (...)` SIN `with check` dejaba a cualquiera hacerse admin).
create policy "el vector es del dueño del reporte"
  on public.pet_fotos_vector for insert to authenticated
  with check (
    exists (select 1 from public.pets p
             where p.id = pet_fotos_vector.pet_id and p.user_id = auth.uid())
  );

create policy "el dueño puede recalcular el vector de su foto"
  on public.pet_fotos_vector for update to authenticated
  using (
    exists (select 1 from public.pets p
             where p.id = pet_fotos_vector.pet_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.pets p
             where p.id = pet_fotos_vector.pet_id and p.user_id = auth.uid())
  );

-- Fail-closed y explicito, con los roles NOMBRADOS: `revoke ... from public` NO
-- le saca el privilegio a `anon` ni a `authenticated`, porque las default
-- privileges de Supabase se lo conceden a ellos de forma directa y no via
-- PUBLIC. Es la trampa que la 0058 ya documenta y que la 0063 de esta misma
-- tanda se comio en la primera pasada.
revoke all on public.pet_fotos_vector from public, anon, authenticated;
grant insert, update on public.pet_fotos_vector to authenticated;
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/db/migracion0064.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Ensayar contra la base real en `begin … rollback`**

SQL de comprobación después de la migración, dentro de la misma transacción:

```sql
create temp table r (n int, caso text, resultado text);
grant all on r to authenticated, anon;

select set_config('mi.pet', (select id::text from public.pets limit 1), true);
insert into public.pet_fotos_vector (pet_id, foto_url, embedding)
values (current_setting('mi.pet')::uuid, 'https://x/f.jpg',
        (select array_agg(0.1)::vector from generate_series(1, 512)));

insert into r select 0, 'CONTROL: el vector sembrado existe',
  'filas como postgres=' || count(*) from public.pet_fotos_vector;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select user_id::text from public.pets where id = current_setting('mi.pet')::uuid),
  'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  -- Ni el dueño lee el vector: si saliera seria un oraculo de parecido.
  select count(*) into n from public.pet_fotos_vector;
  insert into r values (1, 'el DUEÑO lee vectores', 'filas visibles=' || n || ' (esperado 0)');
exception when insufficient_privilege then
  insert into r values (1, 'el DUEÑO lee vectores', 'RECHAZADO 42501 (mejor todavia)');
end $$;
do $$
begin
  -- El dueño SI escribe el vector de SU reporte: es el camino real del cliente
  -- web desde que B1 dio NO-GO en el servidor. Sin este control, un revoke de
  -- mas se leeria como "todo seguro" mientras la funcion no le anda a nadie.
  insert into public.pet_fotos_vector (pet_id, foto_url, embedding)
  values (current_setting('mi.pet')::uuid, 'https://x/propio.jpg',
          (select array_agg(0.2)::vector from generate_series(1, 512)));
  insert into r values (2, 'CONTROL: el dueño escribe el vector de SU reporte', 'OK');
exception when others then
  insert into r values (2, 'CONTROL: el dueño escribe el vector de SU reporte', 'ROTO ' || SQLSTATE);
end $$;
reset role;

-- Y el ataque que de verdad importa: escribir sobre el reporte de OTRO.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id::text from public.profiles
           where id <> (select user_id from public.pets where id = current_setting('mi.pet')::uuid)
             and eliminado_en is null limit 1),
  'role', 'authenticated')::text, true);
do $$
begin
  insert into public.pet_fotos_vector (pet_id, foto_url, embedding)
  values (current_setting('mi.pet')::uuid, 'https://x/ajeno.jpg',
          (select array_agg(0.9)::vector from generate_series(1, 512)));
  insert into r values (3, 'un TERCERO planta un vector en reporte ajeno', 'AGUJERO: lo inserto');
exception when others then
  insert into r values (3, 'un TERCERO planta un vector en reporte ajeno', 'RECHAZADO ' || SQLSTATE);
end $$;
reset role;

select n, caso, resultado from r order by n;
```

Expected: caso 0 `filas=1` · caso 1 `filas visibles=0` o `RECHAZADO 42501` · caso 2 **`OK`** ·
caso 3 `RECHAZADO 42501`.

⚠️ **Si el caso 2 diera `ROTO`, la migración está mal**: el cliente web es quien calcula y escribe el
vector desde que B1 dio NO-GO en el servidor, así que sin esa escritura la función no le anda a
nadie. Un caso 3 en rechazado con un caso 2 también rechazado no es "seguro": es roto.

- [ ] **Step 6: Mover el guardián de última migración a 64**

`toBe(63)` → `toBe(64)`, el `describe` y la línea de procedencia (`Venia de 0063 (tanda 14, A1).`).
**Moverlo, no duplicarlo.**

Run: `npx jest __tests__/db/ultimaMigracion.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0064_vectores_de_foto.sql __tests__/db/migracion0064.test.ts \
        __tests__/db/ultimaMigracion.test.ts
git commit -m "t14-B2: pgvector y pet_fotos_vector, invisibles para la app (0064)"
```

---

# Task B3: El vector se calcula en el navegador

⚠️ **Esta tarea cambió de forma por el resultado de B1.** El plan original la escribía como una Edge
Function; B1 midió que CLIP no corre en el runtime de Supabase y que Cloudflare Workers AI no tiene
ningún modelo de embedding que acepte imágenes. Pablo decidió calcular en el navegador. **Nada de
`supabase/functions/foto-vector/` se construye.**

**Files:**
- Create: `src/lib/vectorFoto.ts` (puro: normalización, coseno, validación)
- Create: `src/services/vectorFoto.ts` (carga el modelo y escribe en la base; **sólo web**)
- Test: `__tests__/lib/vectorFoto.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces (en `src/lib/vectorFoto.ts`, puro y sin red):
  - `export const DIMENSIONES = 512`
  - `export function normalizar(v: number[]): number[]`
  - `export function coseno(a: number[], b: number[]): number`
  - `export function esVectorValido(v: unknown): v is number[]`
- Produces (en `src/services/vectorFoto.ts`):
  - `export function hayModeloDisponible(): boolean` — `false` fuera de web
  - `export async function calcularYGuardar(petId: string, fotoUrl: string): Promise<boolean>`

- [ ] **Step 1: Instalar la librería**

```bash
npm install @huggingface/transformers@3.0.0
```

- [ ] **Step 2: Escribir el test que falla**

Crear `__tests__/lib/vectorFoto.test.ts`:

```ts
import { coseno, DIMENSIONES, esVectorValido, normalizar } from '../../src/lib/vectorFoto';

describe('normalizar', () => {
  it('deja el vector con norma 1', () => {
    const n = normalizar([3, 4]);
    expect(Math.hypot(...n)).toBeCloseTo(1, 6);
  });

  it('un vector de ceros no explota en NaN', () => {
    expect(normalizar([0, 0, 0]).every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe('coseno', () => {
  it('vale 1 consigo mismo', () => {
    expect(coseno([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('vale 0 entre ortogonales', () => {
    expect(coseno([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('largos distintos devuelve 0 en vez de mentir', () => {
    expect(coseno([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe('esVectorValido', () => {
  it('exige las 512 dimensiones exactas de CLIP', () => {
    expect(esVectorValido(new Array(DIMENSIONES).fill(0.1))).toBe(true);
    expect(esVectorValido(new Array(DIMENSIONES - 1).fill(0.1))).toBe(false);
  });

  it('rechaza NaN e Infinity (romperian el indice de pgvector)', () => {
    const v = new Array(DIMENSIONES).fill(0.1);
    v[7] = NaN;
    expect(esVectorValido(v)).toBe(false);
    const w = new Array(DIMENSIONES).fill(0.1);
    w[9] = Infinity;
    expect(esVectorValido(w)).toBe(false);
  });

  it('rechaza lo que no es arreglo', () => {
    expect(esVectorValido('512')).toBe(false);
    expect(esVectorValido(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx jest __tests__/lib/vectorFoto.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/vectorFoto'`

- [ ] **Step 4: Escribir el módulo puro**

Crear `src/lib/vectorFoto.ts`:

```ts
// VECTOR DE FOTO — logica pura del area B (tanda 14).
//
// PURO A PROPOSITO: no importa el modelo ni toca la red, asi que jest lo puede
// probar sin bajar 40 MB. El que carga el modelo es services/vectorFoto.ts.

export const DIMENSIONES = 512;

export function normalizar(v: number[]): number[] {
  let suma = 0;
  for (const x of v) suma += x * x;
  const norma = Math.sqrt(suma);
  // Un vector de ceros dividido por su norma es NaN en toda posicion, y un NaN
  // adentro de pgvector rompe el indice entero, no solo esa fila.
  if (norma === 0) return v.slice();
  return v.map((x) => x / norma);
}

export function coseno(a: number[], b: number[]): number {
  // Largos distintos no es un caso "raro": es un modelo cambiado a mitad de
  // camino. Devolver 0 lo deja fuera del match en vez de inventar un parecido.
  if (a.length !== b.length || a.length === 0) return 0;
  let punto = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    punto += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return punto / (Math.sqrt(na) * Math.sqrt(nb));
}

export function esVectorValido(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length !== DIMENSIONES) return false;
  return v.every((x) => typeof x === 'number' && Number.isFinite(x));
}
```

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `npx jest __tests__/lib/vectorFoto.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Escribir el servicio, que sólo funciona en web**

Crear `src/services/vectorFoto.ts`. Requisitos, todos obligatorios:

- **`hayModeloDisponible()` devuelve `Platform.OS === 'web'`.** En nativo la librería no corre (es
  WASM), y la función tiene que decirlo en vez de fallar recién al usarse. Un reporte publicado desde
  Android queda sin vector, y **eso está bien**: la regla global "lo que falta nunca descarta" ya lo
  cubre — ese reporte encuentra coincidencias exactamente como hoy, sólo no gana el punto de la foto.
- **El modelo se importa DINÁMICAMENTE** (`await import('@huggingface/transformers')`) y sólo cuando
  se lo va a usar. Un import estático arriba del archivo mete ~40 MB en el bundle de todos, incluido
  quien nunca toca la función.
- **El pipeline se guarda a nivel de módulo y se reusa.** Bajar el modelo dos veces sería absurdo.
- **La escritura usa `insert` liso y mira si volvió fila** (`.insert(...).select('id')` y
  `data.length === 0`), porque la RLS rechaza en silencio: 200 con 0 filas, no `42501`. Es la sexta
  aparición de este silencio en el proyecto, y por lo mismo los tests **no deben mockear `42501`**.
  **PROHIBIDO `.upsert()`** contra `pet_fotos_vector`: el ensayo de B2 midió que da `42501` incluso
  al dueño — plantear el camino `on conflict … do update` exige SELECT sobre `embedding`, y esa
  columna está recortada a propósito (es el no-oráculo). Decisión de Pablo (4-ago): insert liso;
  si algún día hace falta recalcular el vector de un `foto_url` existente, es un
  `.update(...).eq('pet_id', …).eq('foto_url', …).select('id')` aparte — ambos caminos ya medidos
  contra la base real. **PROHIBIDO también el `.select()` pelado** en esta tabla: sin argumentos es
  `select=*`, toca `embedding` y da `42501`; siempre columnas explícitas (`.select('id')`). Un
  `23505` (la fila ya existe, carrera benigna de dos escrituras concurrentes) se trata como éxito.
- **Valida con `esVectorValido` antes de escribir.** Un `NaN` adentro de pgvector rompe el índice
  entero, no sólo esa fila.
- **Devuelve `false` en vez de lanzar** cuando el modelo no está disponible o falla la carga. Nada de
  esto puede romper la pantalla que lo llama: es best-effort por diseño.

- [ ] **Step 7: Guardianes de lo que más importa**

Agregar a `__tests__/lib/vectorFoto.test.ts`:

```ts
const fuenteServicio = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'services', 'vectorFoto.ts'), 'utf8');

it('el modelo se importa dinamico: no entra al bundle de quien nunca lo usa', () => {
  const fuente = fuenteServicio();
  // Un import estatico de la libreria mete ~40 MB en el bundle de TODOS.
  expect(fuente).not.toMatch(/^import [^\n]*@huggingface\/transformers/m);
  expect(fuente).toMatch(/await import\(/);
});

it('en nativo dice que no hay modelo, en vez de fallar al usarse', () => {
  expect(fuenteServicio()).toMatch(/Platform\.OS === 'web'/);
});

it('la escritura mira si volvio fila (la RLS rechaza en silencio)', () => {
  const fuente = fuenteServicio();
  expect(fuente).toMatch(/\.select\(/);
  expect(fuente).toMatch(/length === 0/);
});

it('nunca upsert contra pet_fotos_vector: exige SELECT sobre embedding y da 42501 (B2 lo midio)', () => {
  expect(fuenteServicio()).not.toMatch(/\.upsert\(/);
});

it('nunca .select() pelado contra pet_fotos_vector: select=* toca embedding y da 42501', () => {
  // Todo .select( de este archivo tiene que llevar columnas explicitas.
  expect(fuenteServicio()).not.toMatch(/\.select\(\s*\)/);
});
```

- [ ] **Step 7b: Extender el comentario de la 0064 con el segundo tropiezo (hallazgo I2 de la re-revisión de B2)**

En `supabase/migrations/0064_vectores_de_foto.sql`, el bloque de comentario que ya advierte del
`.upsert()` (líneas ~44-58) tiene que advertir también del `.select()` pelado, que falla por la
misma causa (privilegio de columna). Agregar al final de ese bloque:

```
-- Ojo también con .select() SIN argumentos contra esta tabla: supabase-js lo traduce a select=*,
-- que toca embedding y da 42501 aunque la escritura haya funcionado. Siempre columnas explícitas:
-- .select('id'). El patrón establecido en el resto del proyecto (.select() pelado) acá NO sirve.
```

- [ ] **Step 8: Correr los tests y el typecheck**

Run: `npx jest __tests__/lib/vectorFoto.test.ts` y `npx tsc --noEmit`
Expected: PASS, 13 tests, 0 errores de tipos.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/lib/vectorFoto.ts src/services/vectorFoto.ts \
        __tests__/lib/vectorFoto.test.ts supabase/migrations/0064_vectores_de_foto.sql
git commit -m "t14-B3: el vector se calcula en el navegador (B1 cerro las dos rutas de servidor)"
```

---

# Task B4: Migración 0065 — la foto entra al motor de coincidencias

**Files:**
- Create: `supabase/migrations/0065_coincidencias_con_foto.sql`
- Test: `__tests__/db/migracion0065.test.ts`

**Interfaces:**
- Consumes: `pet_fotos_vector` de B2.
- Produces: `buscar_coincidencias` con **dos columnas nuevas** al final del `returns table`:
  `foto_similitud double precision` y `porque jsonb`. Las 12 columnas anteriores **no se mueven ni
  se renombran**: `src/services/busqueda.ts` las lee por nombre y la 0058 es la definición vigente.

⚠️ Cambia el tipo de retorno ⇒ **`drop function` + `create` + re-grant**. `create or replace` no
puede cambiar el `returns` (trampa documentada en la 0024 y repetida en la 0059).

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/db/migracion0065.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(dir, '0065_coincidencias_con_foto.sql'), 'utf8');
const previa = readFileSync(join(dir, '0058_insignia_suspendida_y_tope_de_radio.sql'), 'utf8');

describe('0065: la foto suma al motor de coincidencias', () => {
  it('cambia el retorno, asi que dropea antes de crear (trampa de la 0024)', () => {
    expect(sql).toMatch(/drop function public\.buscar_coincidencias\(uuid, double precision, int\)/);
    expect(sql).toMatch(/grant execute on function public\.buscar_coincidencias\(uuid, double precision, int\) to anon/);
    expect(sql).toMatch(/grant execute on function public\.buscar_coincidencias\(uuid, double precision, int\) to authenticated/);
  });

  it('conserva el tope de radio de la 0058', () => {
    expect(sql).toMatch(/least\(coalesce\(p_radio_km, 15\), 50\)/);
  });

  it('el chip sigue valiendo 1000 y mandando sobre todo lo demas', () => {
    expect(sql).toMatch(/chip_coincide desc/);
  });

  it('la foto SUMA y NUNCA descarta (regla global de la tanda)', () => {
    // el filtro final solo puede mencionar chip y señas, nunca la foto
    const filtroFinal = sql.slice(sql.indexOf('where cand.chip_coincide'));
    expect(filtroFinal).not.toMatch(/foto_similitud\s*[<>]/);
  });

  it('el aporte de la foto tiene techo de 60, por debajo del chip', () => {
    expect(sql).toMatch(/60/);
    expect(sql).not.toMatch(/foto[^;]*1000/);
  });

  it('el numero de chip sigue sin salir', () => {
    expect(sql).not.toMatch(/returns table[\s\S]*chip\s+text/);
  });

  it('las 12 columnas de la 0058 siguen estando y en el mismo orden', () => {
    for (const col of ['id uuid', 'estado pet_estado', 'especie pet_especie', 'nombre text',
                       'descripcion text', 'fotos text[]', 'lat double precision',
                       'lng double precision', 'creado_en timestamptz',
                       'distancia_km double precision', 'chip_coincide boolean', 'puntaje int']) {
      expect(sql).toContain(col);
      expect(previa).toContain(col);
    }
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/db/migracion0065.test.ts`
Expected: FAIL — ENOENT.

- [ ] **Step 3: Copiar el cuerpo vigente y modificarlo**

Run: `sed -n '468,582p' supabase/migrations/0058_insignia_suspendida_y_tope_de_radio.sql`

Copiar ese cuerpo **VERBATIM** a la migración nueva y hacerle exactamente estos cambios:

1. `drop function public.buscar_coincidencias(uuid, double precision, int);` arriba.
2. Al `returns table` se le suman **al final**: `foto_similitud double precision, porque jsonb`.
3. Un `left join lateral` que calcula la mejor similitud entre las fotos de los dos reportes:

```sql
    left join lateral (
      -- MEJOR PAR de fotos, no la primera de cada uno: un reporte tiene varias
      -- y la buena puede ser la tercera. `1 - (a <=> b)` es el coseno, porque
      -- el operador <=> de pgvector devuelve DISTANCIA coseno.
      select max(1 - (va.embedding <=> vb.embedding)) as sim
        from public.pet_fotos_vector va
        join public.pet_fotos_vector vb on vb.pet_id = p.id
       where va.pet_id = b.id
    ) f on true
```

4. El puntaje suma el término de la foto:

```sql
      public.senas_puntaje(...) +
      -- LA FOTO SUMA HASTA 60 Y NUNCA DESCARTA.
      -- Por que 60: la escala de senas_puntaje suma MENOS DE 100 sin chip
      -- (colores 40, tamaño 25, sexo 15, esterilizado 10, cercania hasta 20)
      -- contra 1000 del chip. Con 60 la foto pesa mas que cualquier seña
      -- suelta y sigue sin poder acercarse al chip, que tiene que seguir
      -- mandando: un chip igual es identidad, un parecido es una pista.
      -- Y NUNCA DESCARTA porque un animal sucio, mojado o de noche no se
      -- parece a su propia foto (misma regla que senas_contradicen).
      coalesce(greatest(0, round((f.sim - 0.6) / 0.4 * 60))::int, 0)
      as puntaje
```

5. El desglose legible, que hoy no existe:

```sql
      jsonb_strip_nulls(jsonb_build_object(
        'chip', nullif(cand.chip_coincide, false),
        'color', nullif(cand.b_colores && cand.colores, false),
        'tamano', nullif(cand.b_tamano is not null and cand.b_tamano = cand.tamano, false),
        'cerca', nullif(cand.distancia_km < 2, false),
        'foto', nullif(coalesce(cand.foto_similitud, 0) >= 0.75, false)
      )) as porque
```

6. El filtro final y el `order by` quedan **idénticos** a la 0058: la foto no aparece en ninguno.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/db/migracion0065.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Ensayar contra la base real con el control que importa**

Dentro de `begin … rollback`, después de aplicar 0064 y 0065:

```sql
-- CONTROL IMPRESCINDIBLE: un reporte SIN vector tiene que seguir encontrando
-- lo mismo que antes. Si esto baja, la migracion rompio el matching existente.
select 'sin vector' as caso, count(*) as coincidencias
  from public.buscar_coincidencias((select id from public.pets
                                     where activo and not oculto limit 1), 15, 10);
```

Expected: el mismo número de coincidencias que devuelve la función vigente **antes** de la
migración. Correr la consulta primero fuera de la transacción para tener el número con que comparar.

- [ ] **Step 6: Mover el guardián de última migración a 65**

`toBe(64)` → `toBe(65)`, con su `describe` y su línea de procedencia. **Moverlo, no duplicarlo.**

Run: `npx jest __tests__/db/ultimaMigracion.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0065_coincidencias_con_foto.sql __tests__/db/migracion0065.test.ts \
        __tests__/db/ultimaMigracion.test.ts
git commit -m "t14-B4: la foto suma hasta 60 al match y nunca descarta; y el desglose del porque (0065)"
```

---

# Task B5: Mostrar el puntaje y el porqué, y disparar el vector

**Files:**
- Create: `src/lib/porQueCoincide.ts`
- Test: `__tests__/lib/porQueCoincide.test.ts`
- Modify: `src/services/busqueda.ts`, `src/services/pets.ts`, `src/screens/PetDetailScreen.tsx`

**Interfaces:**
- Consumes: las columnas `foto_similitud` y `porque` de B4.
- Produces: `export function porQueCoincide(porque: Record<string, boolean> | null): string[]`

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/lib/porQueCoincide.test.ts`:

```ts
import { porQueCoincide } from '../../src/lib/porQueCoincide';

describe('porQueCoincide', () => {
  it('sin desglose no inventa razones (base vieja: la columna no llega)', () => {
    expect(porQueCoincide(null)).toEqual([]);
    expect(porQueCoincide({})).toEqual([]);
  });

  it('el chip va primero y es el mas fuerte', () => {
    const r = porQueCoincide({ chip: true, color: true, cerca: true });
    expect(r[0]).toMatch(/chip/i);
  });

  it('traduce cada razon a algo que se entiende', () => {
    expect(porQueCoincide({ color: true }).join(' ')).toMatch(/color/i);
    expect(porQueCoincide({ tamano: true }).join(' ')).toMatch(/tamaño/i);
    expect(porQueCoincide({ cerca: true }).join(' ')).toMatch(/cerca/i);
    expect(porQueCoincide({ foto: true }).join(' ')).toMatch(/foto/i);
  });

  it('NO afirma identidad: nunca dice "es tu mascota"', () => {
    const r = porQueCoincide({ chip: true, color: true, tamano: true, cerca: true, foto: true });
    expect(r.join(' ')).not.toMatch(/es tu mascota|es la tuya|seguro que/i);
  });

  it('ignora las claves en false y las desconocidas', () => {
    expect(porQueCoincide({ color: false, inventada: true } as any)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/lib/porQueCoincide.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir el módulo**

Crear `src/lib/porQueCoincide.ts`:

```ts
// POR QUE COINCIDE — traduce el desglose de `buscar_coincidencias` (0065).
//
// Hasta la tanda 14 el `puntaje` se calculaba, la RPC lo devolvia, estaba
// tipado en services/busqueda.ts y NINGUNA pantalla lo leia: el orden de las
// coincidencias era inexplicable para quien lo miraba.
//
// EL TONO: esto explica por que dos fichas se parecen. NO afirma identidad.
// Decir "es tu mascota" a quien esta buscando y equivocarse es cruel, y el
// chip mismo puede estar mal tipeado.

const RAZONES: Array<[string, string]> = [
  ['chip', 'El número de chip coincide'],
  ['foto', 'La foto se parece'],
  ['color', 'Coincide el color'],
  ['tamano', 'Coincide el tamaño'],
  ['cerca', 'Fue visto cerca'],
];

export function porQueCoincide(porque: Record<string, boolean> | null): string[] {
  if (!porque) return [];
  return RAZONES.filter(([clave]) => porque[clave] === true).map(([, texto]) => texto);
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/lib/porQueCoincide.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Sumar los campos al tipo `Coincidencia`**

En `src/services/busqueda.ts`, agregar al tipo — **opcionales**, igual que `chip_coincide` y
`puntaje`, porque contra una base sin la 0065 no llegan:

```ts
  foto_similitud?: number | null;
  porque?: Record<string, boolean> | null;
```

- [ ] **Step 6: El botón que calcula el vector, en la ficha del reporte propio**

⚠️ **Cambió por el resultado de B1.** El plan original lo disparaba solo al publicar, contra una Edge
Function. Ahora el modelo se baja al teléfono de la persona (~40 MB la primera vez), así que **no
puede ser automático ni ir en el camino de publicar**: sería bajarle 40 MB a alguien que está
apurado subiendo la foto de su perro perdido, sin avisarle.

Va como un botón en la ficha del **reporte propio**, gateado por `esMio && !reunida`, que:

- Sólo se muestra si `hayModeloDisponible()` (o sea, sólo en web). En nativo no aparece, y la ficha
  se ve exactamente como hoy.
- **Dice de frente lo que va a pasar antes de hacerlo**: que se descarga una vez, que puede tardar
  unos segundos, y para qué sirve (que si alguien publica un animal parecido, la coincidencia lo
  tenga en cuenta). Nada de spinners misteriosos.
- Llama `calcularYGuardar(pet.id, foto)` por cada foto del reporte.
- Si falla, lo dice y ofrece reintentar. **No rompe la ficha**: es best-effort.

Requisito de tono, que acá importa: el botón **no puede prometer que va a encontrar a la mascota**.
Suma una señal al matching, no es un buscador de fotos.

- [ ] **Step 6b: Guardián de que no es automático**

```ts
it('el vector NO se calcula solo al publicar: bajar 40 MB pide permiso', () => {
  const pets = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'services', 'pets.ts'), 'utf8');
  expect(pets).not.toMatch(/calcularYGuardar/);
});
```

- [ ] **Step 7: Mostrar el porqué en la tarjeta de coincidencia**

En `src/screens/PetDetailScreen.tsx` (render de coincidencias, ~línea 1259), agregar debajo del
título de cada match las razones que devuelve `porQueCoincide(m.porque ?? null)`. Si el arreglo
está vacío, no se renderiza nada — una base sin la 0065 se ve exactamente como hoy.

- [ ] **Step 8: Suite y typecheck**

Run: `npx tsc --noEmit && npx jest`
Expected: 0 errores, todo verde.

- [ ] **Step 9: Commit**

```bash
git add src/lib/porQueCoincide.ts __tests__/lib/porQueCoincide.test.ts \
        src/services/busqueda.ts src/screens/PetDetailScreen.tsx
git commit -m "t14-B5: el puntaje deja de ser invisible y la coincidencia dice por que coincide"
```

---

# Task C1: Un mapa de verdad en la web

**Files:**
- Create: `src/lib/mapaWeb.ts`
- Test: `__tests__/lib/mapaWeb.test.ts`
- Modify: `src/components/PlatformMap.web.tsx`, `package.json`

**Interfaces:**
- Produces (en `src/lib/mapaWeb.ts`):
  - `export function iconoHtml(color: string, etiqueta?: string | number): string`
  - `export function regionABounds(r: Region): [[number, number], [number, number]]`
  - `export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }`
- `PlatformMap.web.tsx` mantiene **exactamente** la misma interfaz que `react-native-maps` usa hoy:
  - `MapView`: `style`, `region`, `initialRegion`, `onPress(e)` con `e.nativeEvent.coordinate.{latitude,longitude}`, `children`, `key`
  - `Marker`: `coordinate`, `pinColor`, `title`, `description`, `draggable`, `onDragEnd(e)`, `onCalloutPress`

⚠️ Las seis pantallas que lo consumen (`PetDetailScreen`, `PublishScreen`, `PublicarAdopcionScreen`,
`AddSightingScreen`, `PublicPetScreen`, `ReportesMapa`) **no deben cambiar una línea** por esta tarea.

- [ ] **Step 1: Instalar Leaflet**

```bash
npm install leaflet@1.9.4
npm install --save-dev @types/leaflet
```

**No** se instala `react-leaflet`: hace falta traducir la API de `react-native-maps` igual, y un
wrapper propio con contexto es más chico que adaptar dos APIs.

- [ ] **Step 2: Escribir el test que falla**

Crear `__tests__/lib/mapaWeb.test.ts`:

```ts
import { iconoHtml, regionABounds } from '../../src/lib/mapaWeb';

describe('iconoHtml', () => {
  it('usa el color que le pasan', () => {
    expect(iconoHtml('#C62828')).toContain('#C62828');
  });

  it('sin etiqueta no deja un circulo vacio con texto fantasma', () => {
    expect(iconoHtml('#000')).not.toMatch(/<text[^>]*>\s*(undefined|null)/);
  });

  it('numera el rastro cuando le dan etiqueta', () => {
    expect(iconoHtml('#000', 3)).toMatch(/>3</);
  });

  it('escapa la etiqueta: un titulo no puede inyectar HTML en el pin', () => {
    expect(iconoHtml('#000', '<img src=x onerror=alert(1)>')).not.toContain('<img');
  });
});

describe('regionABounds', () => {
  it('convierte region de react-native-maps a los dos vertices de Leaflet', () => {
    const b = regionABounds({
      latitude: -33.45, longitude: -70.65, latitudeDelta: 0.02, longitudeDelta: 0.02,
    });
    expect(b[0][0]).toBeCloseTo(-33.46, 6);
    expect(b[1][0]).toBeCloseTo(-33.44, 6);
    expect(b[0][1]).toBeCloseTo(-70.66, 6);
    expect(b[1][1]).toBeCloseTo(-70.64, 6);
  });

  it('un delta de cero no produce un bounds degenerado', () => {
    const b = regionABounds({
      latitude: -33, longitude: -70, latitudeDelta: 0, longitudeDelta: 0,
    });
    expect(b[0][0]).toBeLessThan(b[1][0]);
    expect(b[0][1]).toBeLessThan(b[1][1]);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx jest __tests__/lib/mapaWeb.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Escribir el módulo puro**

Crear `src/lib/mapaWeb.ts`:

```ts
// MAPA WEB — helpers puros del mapa de Leaflet (tanda 14, area C).
//
// POR QUE ESTA AREA EXISTE: `PlatformMap.web.tsx` era un placeholder que
// dibujaba un cuadro gris diciendo "el mapa solo esta disponible en la app
// movil", y su `Marker` devolvia null. Como la web es la UNICA plataforma
// publicada, toda la dimension geografica de la app era invisible para todos
// los usuarios reales: los datos se guardan, llegan al cliente y se descartan
// al dibujar.

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const DELTA_MINIMO = 0.002;

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Pin dibujado como SVG en un divIcon: sin archivos de imagen (los iconos por
// defecto de Leaflet se rompen con cualquier bundler porque resuelven rutas
// relativas), colorable, y numerable para el orden del rastro.
export function iconoHtml(color: string, etiqueta?: string | number): string {
  const texto =
    etiqueta === undefined || etiqueta === null || etiqueta === ''
      ? ''
      : `<text x="12" y="16" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">${escapar(String(etiqueta))}</text>`;
  return (
    `<svg width="24" height="34" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M12 33C12 33 23 20.5 23 12A11 11 0 1 0 1 12c0 8.5 11 21 11 21z" fill="${escapar(color)}" stroke="#fff" stroke-width="2"/>` +
    texto +
    `</svg>`
  );
}

export function regionABounds(r: Region): [[number, number], [number, number]] {
  // Un delta de 0 daria un bounds de area nula y Leaflet haria zoom al maximo
  // sobre un punto; el minimo lo deja mirando una manzana.
  const dLat = Math.max(Math.abs(r.latitudeDelta), DELTA_MINIMO) / 2;
  const dLng = Math.max(Math.abs(r.longitudeDelta), DELTA_MINIMO) / 2;
  return [
    [r.latitude - dLat, r.longitude - dLng],
    [r.latitude + dLat, r.longitude + dLng],
  ];
}
```

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `npx jest __tests__/lib/mapaWeb.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Reescribir `PlatformMap.web.tsx`**

```tsx
// PLATFORM MAP (web) — mapa real con Leaflet y teselas de OpenStreetMap.
//
// MISMA INTERFAZ que `react-native-maps`, a proposito: las seis pantallas que
// lo consumen (PetDetailScreen, PublishScreen, PublicarAdopcionScreen,
// AddSightingScreen, PublicPetScreen y ReportesMapa) NO cambian una linea.
// Por eso el evento se entrega como `e.nativeEvent.coordinate`, que es la
// forma de react-native-maps y no la de Leaflet.
//
// SIN LLAVE Y SIN FACTURA: Google Maps en web pide cuenta con billing. Las
// teselas de OSM no. A cambio, su licencia OBLIGA a atribuir, y la atribucion
// va prendida abajo a la derecha (no se saca).
//
// Los pines son divIcon con SVG en vez de los iconos por defecto de Leaflet,
// que se rompen con cualquier bundler porque resuelven rutas relativas.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { iconoHtml, regionABounds, Region } from '../lib/mapaWeb';

const MapaCtx = createContext<L.Map | null>(null);

export function Marker({
  coordinate, pinColor, title, description, draggable, onDragEnd, onCalloutPress, etiqueta,
}: any) {
  const mapa = useContext(MapaCtx);
  useEffect(() => {
    if (!mapa) return;
    const icon = L.divIcon({
      html: iconoHtml(pinColor ?? '#C62828', etiqueta),
      className: '',
      iconSize: [24, 34],
      iconAnchor: [12, 34],
      popupAnchor: [0, -30],
    });
    const m = L.marker([coordinate.latitude, coordinate.longitude], {
      icon,
      draggable: !!draggable,
    }).addTo(mapa);

    if (title || description) {
      m.bindPopup(`<b>${title ?? ''}</b>${description ? `<br/>${description}` : ''}`);
      if (onCalloutPress) m.on('popupopen', () => {
        const el = m.getPopup()?.getElement();
        el?.addEventListener('click', onCalloutPress, { once: true });
      });
    }
    if (onDragEnd) {
      m.on('dragend', () => {
        const p = m.getLatLng();
        // Forma de react-native-maps, no de Leaflet: los llamadores ya leen
        // `e.nativeEvent.coordinate` y no deben enterarse del cambio.
        onDragEnd({ nativeEvent: { coordinate: { latitude: p.lat, longitude: p.lng } } });
      });
    }
    return () => { m.remove(); };
  }, [mapa, coordinate.latitude, coordinate.longitude, pinColor, title, description, etiqueta]);

  return null;
}

export default function MapView({ style, region, initialRegion, onPress, children }: any) {
  const [mapa, setMapa] = useState<L.Map | null>(null);
  // Las regiones iniciales se leen UNA vez, al montar. Guardadas en un ref
  // para no re-montar el mapa cuando el llamador re-renderiza con un objeto
  // nuevo pero equivalente (`region={{...}}` crea uno distinto cada render).
  const inicial = useRef(region ?? initialRegion);

  // REF CALLBACK, no `useRef` + `useEffect([div.current])`: un efecto que
  // depende de `.current` no se vuelve a disparar cuando el ref se llena
  // —mutar un ref no re-renderiza— asi que el mapa puede no montarse nunca.
  const montar = useCallback((div: HTMLDivElement | null) => {
    if (!div) return;
    const r: Region = inicial.current ?? {
      latitude: -33.45, longitude: -70.66, latitudeDelta: 0.3, longitudeDelta: 0.3,
    };
    const m = L.map(div, { attributionControl: true });
    m.fitBounds(regionABounds(r));
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© colaboradores de OpenStreetMap',
    }).addTo(m);
    setMapa(m);
  }, []);

  // El mapa se destruye al desmontar el componente, no al re-renderizar.
  useEffect(() => () => { mapa?.remove(); }, [mapa]);

  // `region` controlada: cuando el llamador la cambia (por ejemplo
  // AddSightingScreen al usar "mi ubicación"), el mapa la sigue.
  useEffect(() => {
    if (mapa && region) mapa.fitBounds(regionABounds(region));
  }, [mapa, region?.latitude, region?.longitude, region?.latitudeDelta]);

  useEffect(() => {
    if (!mapa || !onPress) return;
    const h = (e: L.LeafletMouseEvent) =>
      onPress({ nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } } });
    mapa.on('click', h);
    return () => { mapa.off('click', h); };
  }, [mapa, onPress]);

  return (
    <div ref={montar} style={{ ...(style ?? {}), minHeight: 180 }}>
      {/* Los hijos se montan recien con el mapa listo: un Marker sin mapa no
          tiene donde agregarse. */}
      <MapaCtx.Provider value={mapa}>{mapa ? children : null}</MapaCtx.Provider>
    </div>
  );
}
```

- [ ] **Step 7: Guardián de que el placeholder no vuelve**

Agregar a `__tests__/lib/mapaWeb.test.ts`:

```ts
it('la web ya no dice que el mapa es solo de la app movil', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'PlatformMap.web.tsx'), 'utf8');
  expect(fuente).not.toMatch(/solo está disponible en la app móvil/);
  expect(fuente).toMatch(/openstreetmap/i);
  expect(fuente).toMatch(/colaboradores de OpenStreetMap/);   // ODbL obliga
});

it('Marker en web ya no devuelve null incondicionalmente', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'PlatformMap.web.tsx'), 'utf8');
  expect(fuente).not.toMatch(/export function Marker\([^)]*\)\s*\{\s*return null;\s*\}/);
});
```

- [ ] **Step 8: Verificar en el navegador de verdad**

```bash
npx expo export --platform web
npx serve dist -l 8080
```

Abrir `http://localhost:8080`, entrar a una ficha de reporte y **ver el mapa dibujado con el pin**.
Comprobar en la consola: **0 errores JS**. Verificar también `AddSightingScreen` (arrastrar el pin
mueve las coordenadas) y Explorar (varios pines de colores distintos).

⚠️ Verificar el **compilado**, no sólo el dev server: en este proyecto ya aparecieron bugs en
producción que en dev no se veían.

- [ ] **Step 9: Suite y typecheck**

Run: `npx tsc --noEmit && npx jest`
Expected: 0 errores, todo verde.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/lib/mapaWeb.ts \
        __tests__/lib/mapaWeb.test.ts src/components/PlatformMap.web.tsx
git commit -m "t14-C1: la web tiene mapa por primera vez (Leaflet + OSM, misma interfaz)"
```

---

# Task C2: El rastro con orden

**Files:**
- Modify: `src/screens/PetDetailScreen.tsx`, `src/components/PlatformMap.web.tsx` (prop `etiqueta`
  ya agregada en C1)
- Test: `__tests__/lib/mapaWeb.test.ts` (ampliar)

**Interfaces:**
- Consumes: `sortByRecency` de `src/lib/sightings.ts` (ya existe).
- Produces: nada nuevo hacia afuera.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `__tests__/lib/mapaWeb.test.ts`:

```ts
it('la ficha numera el rastro por orden temporal, no deja pines identicos', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'screens', 'PetDetailScreen.tsx'), 'utf8');
  // El mapa tiene que consumir el rastro YA ordenado, no `sightings` crudo.
  expect(fuente).toMatch(/sortByRecency/);
  expect(fuente).toMatch(/etiqueta=/);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/lib/mapaWeb.test.ts -t "numera el rastro"`
Expected: FAIL — `etiqueta=` no aparece en `PetDetailScreen.tsx`.

- [ ] **Step 3: Implementar**

En `src/screens/PetDetailScreen.tsx`, el bloque del mapa (~línea 772) pasa a numerar el rastro. El
más reciente lleva el número 1:

```tsx
{sortByRecency(sightings).map((s, i) => (
  <Marker
    key={s.id}
    coordinate={{ latitude: s.lat, longitude: s.lng }}
    pinColor={colors.sun}
    etiqueta={i + 1}
    title={i === 0 ? 'El más reciente' : 'Visto por acá'}
    description={s.nota ?? undefined}
  />
))}
```

⚠️ `etiqueta` es una prop **nuestra**: `react-native-maps` la ignora en nativo sin romperse, así
que el nativo sigue viéndose como hoy hasta que alguien la implemente ahí.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/lib/mapaWeb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/PetDetailScreen.tsx __tests__/lib/mapaWeb.test.ts
git commit -m "t14-C2: el rastro se ve como recorrido y no como pines sueltos"
```

---

# Task C3: Migración 0066 — el vecino del QR ve el rastro

**Files:**
- Create: `supabase/migrations/0066_rastro_publico.sql`
- Test: `__tests__/db/migracion0066.test.ts`
- Modify: `src/services/sightings.ts`, `src/screens/PublicPetScreen.tsx`

**Interfaces:**
- Produces: policy de SELECT sobre `sightings` para `anon`, acotada a reportes activos y no ocultos.

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/db/migracion0066.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0066_rastro_publico.sql'), 'utf8');

describe('0066: el rastro para quien llega por el QR', () => {
  it('la policy nueva REPITE los filtros de la ficha (no los hereda)', () => {
    expect(sql).toMatch(/p\.activo/);
    expect(sql).toMatch(/p\.oculto = false/);
  });

  it('es solo de lectura y solo para anon', () => {
    expect(sql).toMatch(/for select to anon/);
    expect(sql).not.toMatch(/for (insert|update|delete) to anon/);
  });

  it('no toca la policy de authenticated que ya existia', () => {
    expect(sql).not.toMatch(/drop policy[^;]*authenticated/);
  });

  it('no expone al autor del avistamiento', () => {
    expect(sql).not.toMatch(/grant[^;]*profiles[^;]*to anon/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/db/migracion0066.test.ts`
Expected: FAIL — ENOENT.

- [ ] **Step 3: Escribir la migración**

```sql
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
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/db/migracion0066.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Ensayar contra la base real, con los tres controles**

```sql
create temp table r (n int, caso text, resultado text);
grant all on r to anon, authenticated;

select set_config('mi.pet', (select id::text from public.pets
                              where activo and not oculto limit 1), true);
insert into public.sightings (pet_id, user_id, lat, lng, nota)
select current_setting('mi.pet')::uuid, p.user_id, p.lat, p.lng, 'rastro de prueba'
  from public.pets p where p.id = current_setting('mi.pet')::uuid;

insert into r select 0, 'CONTROL: el avistamiento sembrado existe',
  'filas como postgres=' || count(*) from public.sightings
 where pet_id = current_setting('mi.pet')::uuid;

set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
insert into r select 1, 'anon ve el rastro de un reporte VIGENTE',
  'filas=' || count(*) || ' (esperado >=1)' from public.sightings
 where pet_id = current_setting('mi.pet')::uuid;
reset role;

-- Ahora lo ocultamos y el mismo anon NO debe ver nada
update public.pets set oculto = true where id = current_setting('mi.pet')::uuid;
set local role anon;
insert into r select 2, 'anon ve el rastro de un reporte OCULTO',
  'filas=' || count(*) || ' (esperado 0)' from public.sightings
 where pet_id = current_setting('mi.pet')::uuid;
reset role;
update public.pets set oculto = false, activo = false where id = current_setting('mi.pet')::uuid;
set local role anon;
insert into r select 3, 'anon ve el rastro de un reporte CERRADO',
  'filas=' || count(*) || ' (esperado 0)' from public.sightings
 where pet_id = current_setting('mi.pet')::uuid;
reset role;

select n, caso, resultado from r order by n;
```

Expected: 0 → `filas=1`; 1 → `filas>=1`; 2 → `filas=0`; 3 → `filas=0`.

- [ ] **Step 6: Mostrar el rastro en `PublicPetScreen`**

En `src/screens/PublicPetScreen.tsx` (mapa ~línea 278), cargar `listSightings(pet.id)` y dibujar los
pines numerados igual que en la ficha. **Degradar en silencio**: si la consulta falla (migración sin
aplicar), se muestra el mapa con el pin del reporte, como hoy.

⚠️ `listSightings` filtra bloqueados en el cliente con `filtrarBloqueados`, que necesita sesión.
Sin sesión no hay bloqueos que aplicar: verificar que ese camino no lance.

- [ ] **Step 7: Suite y typecheck**

Run: `npx tsc --noEmit && npx jest`
Expected: 0 errores, todo verde.

- [ ] **Step 8: Mover el guardián de última migración a 66**

`toBe(65)` → `toBe(66)`, con su `describe` y su línea de procedencia. **Moverlo, no duplicarlo.**

Run: `npx jest __tests__/db/ultimaMigracion.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0066_rastro_publico.sql __tests__/db/migracion0066.test.ts \
        src/services/sightings.ts src/screens/PublicPetScreen.tsx __tests__/db/ultimaMigracion.test.ts
git commit -m "t14-C3: quien llega por el QR ve el rastro; oculto y cerrado siguen tapados (0066)"
```

---

# Task D1: Accesibilidad — los grupos de "elegí uno"

**Files:**
- Modify: `src/screens/AdopcionFeedScreen.tsx`, `src/screens/AlertZoneScreen.tsx`,
  `src/screens/EncontreScreen.tsx`, `src/screens/EditAdoptionScreen.tsx`,
  `src/screens/PublicarAdopcionScreen.tsx`, `src/screens/ProfileScreen.tsx`,
  `src/screens/HomeScreen.tsx`, `src/components/SelectorAmbito.tsx`,
  `src/components/PlanBusqueda.tsx`
- Test: `__tests__/lib/casillasAccesibles.test.ts` (ampliar)

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Encontrar los dos ejemplos ya hechos**

Run: `grep -rn 'accessibilityRole="radio"' src/ | head -5`
Expected: dos componentes que ya lo hacen bien. **Copiar ese patrón**, no inventar otro.

- [ ] **Step 2: Escribir el guardián que falla**

Ampliar `__tests__/lib/casillasAccesibles.test.ts` con un barrido que exija que todo grupo de
"elegí uno" anuncie `radio`/`radiogroup` en vez de `checkbox`:

```ts
const PANTALLAS_CON_GRUPOS = [
  'screens/AdopcionFeedScreen.tsx', 'screens/AlertZoneScreen.tsx', 'screens/EncontreScreen.tsx',
  'screens/EditAdoptionScreen.tsx', 'screens/PublicarAdopcionScreen.tsx',
  'screens/ProfileScreen.tsx', 'screens/HomeScreen.tsx',
  'components/SelectorAmbito.tsx', 'components/PlanBusqueda.tsx',
];

it.each(PANTALLAS_CON_GRUPOS)('%s anuncia sus grupos de elegí-uno como radio', (rel) => {
  const fuente = readFileSync(join(__dirname, '..', '..', 'src', rel), 'utf8');
  expect(fuente).toMatch(/accessibilityRole="radiogroup"/);
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx jest __tests__/lib/casillasAccesibles.test.ts`
Expected: FAIL en las nueve.

- [ ] **Step 4: Implementar en las nueve**

Cada grupo se envuelve en un contenedor con `accessibilityRole="radiogroup"` y cada opción pasa de
`checkbox` a `accessibilityRole="radio"` con `accessibilityState={{ checked }}`.

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `npx jest __tests__/lib/casillasAccesibles.test.ts`
Expected: PASS.

⚠️ **Anotar la deuda que NO se salda:** nada de esto se probó con un lector de pantalla real. La
conclusión sale de la tabla de props de la versión instalada de react-native-web. Es sólido, no es
lo mismo que VoiceOver.

- [ ] **Step 6: Commit**

```bash
git add src/screens src/components __tests__/lib/casillasAccesibles.test.ts
git commit -m "t14-D1: los grupos de elegi-uno dejan de anunciarse como casillas"
```

---

# Task D2: Los minors triados de la tanda 13

**Files:**
- Modify: varios (uno por ítem)
- Test: uno por ítem, en el archivo que ya cubre ese módulo

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Leer la lista completa**

Run: `grep -n "Deuda anotada post-tanda" .superpowers/sdd/progress.md`

- [ ] **Step 2: Unificar el título de la denuncia**

El aviso in-app dice «Entró una denuncia» y el push «Entró una denuncia nueva». Antes de tocar,
ubicar las dos cadenas:

Run: `grep -rn "Entró una denuncia" src/ supabase/functions/`

El arreglo es sacar **una sola constante** y que los dos la usen, no editar los dos textos para que
casualmente coincidan. Test, en `__tests__/lib/avisosBandeja.test.ts`:

```ts
it('la bandeja y el push dicen exactamente lo mismo de una denuncia', () => {
  const { TITULO_DENUNCIA_NUEVA } = require('../../src/lib/textosAviso');
  const bandeja = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'lib', 'avisosBandeja.ts'), 'utf8');
  const push = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'lib', 'notifyTargets.ts'), 'utf8');
  // Ninguno de los dos puede tener el texto escrito a mano.
  expect(bandeja).not.toMatch(/'Entró una denuncia/);
  expect(push).not.toMatch(/'Entró una denuncia/);
  expect(TITULO_DENUNCIA_NUEVA.length).toBeGreaterThan(0);
});
```

⚠️ Si se toca `src/lib/notifyTargets.ts`, hay que copiar el cambio a
`supabase/functions/send-notifications/notifyTargets.ts` **carácter por carácter, comentarios
incluidos**. El guardián `__tests__/lib/notifyTargetsEspejo.test.ts` ya lo exige.

- [ ] **Step 3: `useDenunciasPendientes` resetea a 0 en el catch**

Hoy su hermano `useAvisosSinLeer` sí lo hace y éste no: un error deja el contador viejo pegado,
mostrando denuncias que quizá ya no existen — un badge que miente. Test:

```ts
it('un error deja el contador en 0 y no el valor viejo', async () => {
  (moderacionBandeja as jest.Mock)
    .mockResolvedValueOnce([{ id: 'd1' }, { id: 'd2' }])
    .mockRejectedValueOnce(new Error('sin red'));
  const { result } = renderHook(() => useDenunciasPendientes(true));
  await waitFor(() => expect(result.current.cantidad).toBe(2));
  await act(async () => { await result.current.recargar(); });
  expect(result.current.cantidad).toBe(0);
});
```

- [ ] **Step 4: Los fallbacks de `CollarTag` y `TarjetaCompartir`**

`TarjetaCompartir.tsx:380` cae al dominio pelado sin path, así que el QR de respaldo lleva a la
home en vez de a la ficha. Mover el armado a `src/lib/tarjeta.ts` (que ya tiene tests) y que el
componente sólo consuma. Test, en `__tests__/lib/tarjeta.test.ts`:

```ts
it('el respaldo del QR lleva a la ficha, no al dominio pelado', () => {
  const url = urlDeRespaldo('abc-123');
  expect(url).toMatch(/\/mascota\/abc-123$/);
  expect(url).not.toMatch(/pages\.dev\/?$/);
});
```

- [ ] **Step 5: Borrar el test duplicado de `profile.test.ts`**

Run: `grep -n "it(" __tests__/services/profile.test.ts | sort -t"'" -k2 | uniq -d -f1`
Borrar el repetido y **verificar que el que queda cubre el caso** corriendo la suite de ese archivo.

- [ ] **Step 6: `TODOS_LOS_TIPOS` del espejo**

Le faltan `denuncia_nueva` y `reencuentro_seguimiento`, y su comentario promete una exhaustividad
que el arreglo no fuerza (deuda que ya creció a dos tipos). Sumar los dos y **cambiar el comentario
para que no prometa de más**. Test que lo ata al CHECK real de la base:

```ts
it('TODOS_LOS_TIPOS coincide con el CHECK de notification_events', () => {
  const sql = readFileSync(join(DIR, '0061_seguimiento_anonimo.sql'), 'utf8');
  const enElCheck = [...sql.matchAll(/'([a-z_]+)'/g)]
    .map((m) => m[1])
    .filter((t) => TODOS_LOS_TIPOS.includes(t as any));
  for (const tipo of TODOS_LOS_TIPOS) {
    expect(enElCheck).toContain(tipo);
  }
  expect(TODOS_LOS_TIPOS).toContain('denuncia_nueva');
  expect(TODOS_LOS_TIPOS).toContain('reencuentro_seguimiento');
});
```

- [ ] **Step 7: Correr la suite completa**

Run: `npx tsc --noEmit && npx jest`
Expected: 0 errores, todo verde.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "t14-D2: los minors triados de la tanda 13, saldados"
```

---

# Task D3: Paginado de `storage.list` y limpieza de vencidos

**Files:**
- Modify: `src/services/pets.ts` (`deletePet`), `supabase/functions/delete-account/index.ts`
- Test: `__tests__/services/deletePetPaginado.test.ts`

**Interfaces:**
- Produces: `export async function listarTodoElPrefijo(bucket: string, prefijo: string): Promise<string[]>` en `src/lib/rutaStorage.ts`.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('pagina hasta traer todo: con 250 archivos hace 3 vueltas', async () => {
  const pagina = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `f${i}.jpg` }));
  const list = jest.fn()
    .mockResolvedValueOnce({ data: pagina(100), error: null })
    .mockResolvedValueOnce({ data: pagina(100), error: null })
    .mockResolvedValueOnce({ data: pagina(50), error: null });
  // ... arma el mock de supabase.storage.from(...).list
  const todos = await listarTodoElPrefijo('avisos-anonimos', 'pet-1');
  expect(todos).toHaveLength(250);
  expect(list).toHaveBeenCalledTimes(3);
});

it('una pagina vacia corta el bucle (no gira para siempre)', async () => {
  // list devuelve [] la primera vez
  const todos = await listarTodoElPrefijo('avisos-anonimos', 'pet-1');
  expect(todos).toEqual([]);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest __tests__/services/deletePetPaginado.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el paginado**

```ts
// `storage.list` devuelve como maximo 100 por llamada. Sin paginar, un reporte
// con mas de 100 fotos de aviso dejaba huerfanos inaccesibles al borrarse.
export async function listarTodoElPrefijo(bucket: string, prefijo: string): Promise<string[]> {
  const TAM = 100;
  const todos: string[] = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefijo, { limit: TAM, offset: pagina * TAM });
    if (error) throw error;
    const lote = data ?? [];
    todos.push(...lote.map((f) => `${prefijo}/${f.name}`));
    if (lote.length < TAM) return todos;    // pagina incompleta = era la ultima
  }
}
```

Usarla en `deletePet` y replicarla en `delete-account/index.ts`.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/services/deletePetPaginado.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Decidir el cron de limpieza con el dato en la mano**

Run contra la base real:

```sql
select count(*) as seguimientos_de_reportes_vencidos
  from public.seguimientos_anonimos s
  join public.pets p on p.id = s.pet_id
 where coalesce(p.renovado_en, p.creado_en) < now() - interval '45 days';
```

Si da **0** (lo esperable hoy: la tabla nació el 3-ago), **NO** escribir la `0067`: anotar en el
ledger que el cron se justifica cuando el número deje de ser cero. Una migración que limpia lo que
no existe es código muerto que igual hay que mantener.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "t14-D3: storage.list paginado; el cron de limpieza queda medido, no supuesto"
```

---

# Task INT: Integración, revisión adversarial y despliegue

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa con el código de salida verificado de verdad**

```bash
npx tsc --noEmit; echo "tsc=$?"
npx jest; echo "jest=$?"
```

Expected: `tsc=0` y `jest=0`. ⚠️ **NO** encadenar a un `tail`: se come el código de salida. Es una
cicatriz del ESTADO.md.

- [ ] **Step 2: Revisión adversarial de rama, ANTES de aplicar nada**

Cuatro revisores en paralelo sobre áreas disjuntas (A, B, C, D), con la instrucción **explícita de
contradecir este plan** en vez de seguirlo. Es la regla que la tanda 12 aprendió por las malas: se
fusionó sin revisión con tres Criticals adentro y 2517 tests en verde.

Preguntas que cada revisor tiene que responder ejecutando, no leyendo:
- **A:** ¿el tablero le muestra a alguien un teléfono que no tenemos? ¿la atribución de OSM está
  visible? ¿un tercero puede leer el tablero ajeno?
- **B:** ¿un reporte **sin** vector encuentra las mismas coincidencias que antes? ¿la foto puede
  descartar? ¿se puede plantar un vector falso?
- **C:** ¿el rastro de un reporte oculto o cerrado se ve desde afuera? ¿el mapa rompe alguna de las
  seis pantallas que lo consumen? ¿quedan errores JS en el compilado?
- **D:** ¿algún guardián nuevo pasa por vacuidad (verde porque no mira nada)?

- [ ] **Step 3: Ola única de fixes + re-verificación por los mismos revisores**

- [ ] **Step 4: Desplegar en este orden (NO cambiarlo)**

1. **Ninguna Edge Function nueva.** El área B terminó calculando el vector en el navegador (ver Task
   B1), así que no hay nada que desplegar del lado de las funciones. Las cinco que ya están en
   producción **no se tocan**.
2. **Aplicar `0063` → `0064` → `0065` → `0066` en orden**, cada una ensayada dentro de
   `begin … rollback` contra la base real y con los ataques de su tarea **después** de aplicar.
   ⚠️ La `0065` dropea y recrea `buscar_coincidencias`: correr el control de "sin vector encuentra
   lo mismo" **antes y después**.
3. **Correr la semilla de lugares** (`node scripts/semilla-lugares.js CL-RM`), después de la `0063`.
   Verificar el conteo contra la medición del 3-ago (≈332 en la RM).
4. **Exportar el `dist` y que Pablo lo suba.** La web SIEMPRE después de las migraciones.
5. **Verificar contra el sitio real:** el bundle servido == el exportado, el mapa dibujado con
   pines, el rastro visible desde el link público **sin sesión**, el tablero con la atribución de
   OSM, y **0 errores JS**.

- [ ] **Step 5: Actualizar `ESTADO.md` y el ledger**

Con lo que se comprobó ejecutándolo, los números medidos en B1, y la deuda que la tanda deja
anotada con nombre y apellido.

---

## Self-review de este plan

**Cobertura del spec:** Área A → A1/A2/A3/A4/A5 (tablero, semilla, ODbL, sin avisos automáticos,
afiche desde la cuadrilla, plan que enlaza) · Área B → B1/B2/B3/B4/B5 (medición, pgvector, Edge
Function, término de foto que nunca descarta, puntaje visible) · Área C → C1/C2/C3 (Leaflet, rastro
ordenado, rastro público) · Área D → D1/D2/D3 · Manejo de errores → cubierto en A3 (degradación),
A4 (`return null`), B5 (best-effort), C3 (degradación en `PublicPetScreen`) · Pruebas → cada tarea
tiene guardián y ensayo SQL con control.

**Restricciones globales verificadas contra las tareas:** ninguna migración toca `pets` (test
explícito en 0063 y 0064) · lo que falta nunca descarta (test en 0065) · toda escritura pide
`.select()` (A3) · ningún test mockea `42501` · la atribución ODbL tiene test en A4 y en C1 · el
guardián de última migración se **mueve** en la Task 0 y afirma `0066`, que es la última que el plan
crea (la `0067` de D3 queda condicionada a una medición y, si se escribe, hay que mover el guardián
otra vez — anotado en D3).

**Consistencia de tipos:** `Destino` se define en A2 y lo consumen A3 y A4 con los mismos nombres de
campo · `LugarCerca.distanciaKm` (camelCase en el cliente) se mapea desde `distancia_km` (snake en
SQL) en A3 y se usa así en A4 · `iconoHtml(color, etiqueta?)` se define en C1 y la prop `etiqueta`
del `Marker` la consume C2 con ese mismo nombre · `porQueCoincide` recibe el `porque` que produce la
0065 en B4 y lo consume B5 · `DIMENSIONES = 512` es el mismo número en `vectorFoto.ts` (B3) y en
`vector(512)` (B2).

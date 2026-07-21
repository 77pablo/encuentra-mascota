# Apartado de Adopción — diseño

**Fecha:** 2026-07-21
**Estado:** aprobado, listo para plan

## Objetivo

Un apartado **dedicado** para dar mascotas en adopción, con un **feed estilo Instagram**
(fotos grandes, scroll vertical) donde aparecen **solo** animales en adopción — separado de
los reportes de perdida/encontrada, que no deben mezclarse. Cualquier vecino con cuenta
publica; se guarda (corazón) y se contacta por chat.

## Decisiones de producto (aprobadas)

- **Sección aparte** (tabla propia, no un tercer estado de `pets`).
- **Cualquier vecino con cuenta** publica.
- **Pestaña nueva** (8ª) con feed tipo Instagram. ⚠️ Quedan 8 pestañas; se compensa con
  íconos y jerarquía visual, y si molesta se consolida después (no en esta v1).
- Acciones por publicación: **foto + guardar (corazón) + contactar (chat)**. Sin me gusta ni
  comentarios (evita moderar comentarios).
- Campos extra (todos **opcionales**): edad, tamaño, salud (esterilizado/vacunas), con quién
  convive bien, requisitos.
- **Sin push en la v1** (no entra a la cola de avisos). Se puede agregar después.

## Arquitectura

### Migración `0030_adopciones.sql`

**Tabla `adoptions`:**
```
id            uuid pk default gen_random_uuid()
user_id       uuid not null references profiles(id) on delete cascade
especie       pet_especie not null                 -- reusa el enum de 0001
nombre        text                                  -- opcional
descripcion   text not null
fotos         text[] not null default '{}'          -- 1..4
lat           double precision not null             -- punto DIFUMINADO (ver abajo)
lng           double precision not null
comuna        text
-- extras opcionales (tri-estado 'si'|'no'|'no_se' donde aplica)
edad          text  check (edad in ('cachorro','adulto','senior') or edad is null)
tamano        text  check (tamano in ('chico','mediano','grande') or tamano is null)
esterilizado  text  check (esterilizado in ('si','no','no_se') or esterilizado is null)
vacunas       text  check (vacunas in ('al_dia','no','no_se') or vacunas is null)
convive_ninos text  check (convive_ninos in ('si','no','no_se') or convive_ninos is null)
convive_perros text check (convive_perros in ('si','no','no_se') or convive_perros is null)
convive_gatos text  check (convive_gatos in ('si','no','no_se') or convive_gatos is null)
requisitos    text                                  -- opcional, corto
activo        boolean not null default true
adoptada_en   timestamptz                            -- final feliz
oculto        boolean not null default false         -- moderación (paridad con pets)
creado_en     timestamptz not null default now()
```
- **RLS:** lectura pública de activas no ocultas (`for select using (true)` como `pets`, la
  visibilidad efectiva la filtra la RPC); insert/update/delete solo `auth.uid() = user_id`.
- **Ubicación difuminada:** en el borde de escritura (`createAdoption`) se aplica
  `difuminarUbicacion` (Tanda A), igual que `createPet`. La coordenada exacta **no se
  guarda**. El feed usa el punto sólo para "cerca de mí".
- **CHECKs** de longitud/rango/cantidad de fotos (mismos números que `pets`, mig `0016`).
- Columna geográfica generada + índice GIST (como `pets` en 0014) para el orden por cercanía.
- Índice parcial para el orden por defecto (activas no ocultas, recientes).

**RPC `buscar_adopciones(...)`** (`security invoker`, `stable`) — espejo simplificado de
`buscar_reportes`: filtros `p_especie`, `p_tamano`, punto+radio opcional, orden
`'recientes'|'cerca'`, **paginación por cursor** (misma técnica y arreglo de redondeo del
cursor de distancia que la 0015, para no repetir/saltear filas), excluye
`activo=false`/`oculto=true`/`adoptada_en is not null`. Devuelve las columnas de la tarjeta +
`distancia_km`.

### Generalización del chat (la parte delicada)

**`messages` ya tiene `pet_id` nullable (0017).** Se agrega en `0030`:
```
alter table public.messages
  add column adoption_id uuid references public.adoptions(id) on delete set null;
create index messages_adoption_id_idx on public.messages (adoption_id);
```
- Un mensaje pertenece a **un** contexto: un reporte (`pet_id`), una adopción
  (`adoption_id`), o un reporte ya borrado (ambos null, caso 0017). **No** se agrega un CHECK
  estricto de "exactamente uno" porque el caso de reporte borrado deja los dos en null.
- La RLS de `messages` **no cambia** (es por `from_user`/`to_user`, no mira el contexto).

**⚠️ Trampa a evitar (documentada):** hoy un hilo de reporte borrado se consulta con
`.is('pet_id', null)`. Si un mensaje de adopción también tiene `pet_id` null, ese filtro lo
**matchearía por error**. Por eso el contexto del hilo debe ser **explícito** en todas las
consultas. Se introduce un tipo:
```ts
type HiloCtx =
  | { tipo: 'pet'; id: string }
  | { tipo: 'pet_borrado' }            // pet_id null Y adoption_id null
  | { tipo: 'adopcion'; id: string };
```
Y `services/messages.ts` se refactoriza para recibir `HiloCtx` en vez de `petId`:
- `listMessages(ctx, me, other)`:
  - `pet` → `.eq('pet_id', id)`
  - `pet_borrado` → `.is('pet_id', null).is('adoption_id', null)`
  - `adopcion` → `.eq('adoption_id', id)`
- `markThreadRead(ctx, me, other)`: mismo branch.
- `sendMessage(ctx, from, to, texto)`: setea la columna correcta (`pet_id` o `adoption_id`).
- `Message` suma `adoption_id: string | null`.
- **Agrupado** (`foldPageInto`): la clave pasa a
  `pet_id !== null ? 'p:'+pet_id : adoption_id !== null ? 'a:'+adoption_id : 'del'` + `:` +
  `otherUser`. Así un hilo de adopción, uno de reporte y uno de reporte-borrado entre las
  mismas dos personas **no se funden**.
- `ConversationKey`/`Conversation` guardan el `ctx` (o `petId`+`adoptionId`) en vez de solo
  `petId`. `listConversations` enriquece `petLabel`: si es adopción, consulta `adoptions`
  (`especie`, `nombre`) y arma algo como *"En adopción · Pelusa"*; si es reporte, como hoy;
  si es reporte borrado, "Reporte eliminado".

**`ChatScreen`** acepta params `{ petId?, adoptionId?, otherUserId }` y arma el `HiloCtx`.
Navegar a contactar una adopción: `navigate('...Chat', { adoptionId, otherUserId })`. El
encabezado tocable del chat lleva al detalle de adopción cuando corresponde.

**Push del chat (`send-push` / la ruta del aviso):** cuando el mensaje es de una adopción, la
ruta del deep-link es `/adopcion/:id` en vez de `/mascota/:id`. Revisar `send-push` y el
punto donde se arma la ruta; agregar la rama. (Si el push del chat hoy no dispara, se deja el
route correcto igual, sin bloquear.)

### Guardar (corazón) — tabla `adoption_saves`

Los favoritos actuales (`favorites`) referencian `pets(id)`. Para no acoplar ni volverlos
polimórficos (riesgo), se crea una tabla paralela en `0030`:
```
adoption_saves (user_id uuid refs profiles on delete cascade,
                adoption_id uuid refs adoptions on delete cascade,
                creado_en timestamptz default now(),
                primary key (user_id, adoption_id))
```
RLS: solo el dueño gestiona sus guardados (`auth.uid() = user_id`). Servicio
`services/adoptionSaves.ts` + un `AdoptionSavesProvider` que **espeja** `FavoritesProvider`
(set en memoria, alterna, degrada sin la tabla). El corazón de la tarjeta reusa el
componente/UX de favoritos. Pantalla "Guardados" del Perfil puede sumar una sección de
adopciones guardadas (o una entrada aparte); decisión menor de UI en implementación.

### Cliente

- **`services/adoptions.ts`**: `createAdoption`, `getAdoption` (`maybeSingle` + mensaje
  humano como `getPet`), `listMyAdoptions`, `updateAdoption`, `deleteAdoption` (borra fotos
  del bucket como `deletePet`), `marcarAdoptada`.
- **`services/busquedaAdopciones.ts`** + hook `useBusquedaAdopciones`: llama
  `buscar_adopciones` con cursor, scroll infinito (espeja `busqueda.ts`/`useBusquedaReportes`).
- **`schemas/adoption.ts`** (zod): validación del formulario.
- **`AdopcionFeedScreen`** (pestaña): feed vertical de tarjetas grandes tipo Instagram
  (carrusel de fotos si hay varias), chips de filtro arriba (especie, tamaño), toggle
  recientes/cerca, corazón para guardar, botón "Quiero conocerlo" → chat. Scroll infinito +
  pull-to-refresh. Empty state cálido.
- **`PublicarAdopcionScreen`**: formulario (fotos vía `pickImage`/`storage`, comuna, campos
  extra como chips/selectores tri-estado, requisitos), **filtro `moderarTexto`** sobre
  descripción + requisitos (bloquea venta de animales, justo lo que no queremos acá) +
  casilla de confirmación de imagen (paridad con Publicar).
- **`AdopcionDetailScreen`** (ruta pública `/adopcion/:id`, modo invitado): fotos, todos los
  datos, "Quiero conocerlo" (chat, pasa por `useRequireAuth`), corazón, y para el dueño:
  editar / borrar / **"¡Ya encontró familia!"**.
- **Final feliz** (`marcarAdoptada`): `adoptada_en = now()`, sale del feed; celebración
  sobria reusando el patrón del reencuentro (sin obligar foto). Guardados y chat sobreviven.
- **Navegación:** nueva pestaña `Adopcion` en `TabNavigator` (ícono propio, p. ej.
  `heart`/`paw`); `AdopcionDetail` registrada en el stack raíz con linking `adopcion/:id`
  (paridad con `MascotaPublica`/`Collar`). Entrada opcional en Inicio ("En adopción cerca
  tuyo") queda como nice-to-have, no bloquea.

## Moderación / privacidad / legal

- **Texto:** `moderarTexto` en publicar y editar (mismo anti-bypass que reportes).
- **Imagen:** casilla de confirmación sin premarcar (misma decisión que los bloqueos de
  tienda: sin IA).
- **Contacto solo por chat:** no se expone teléfono (coherente con Tanda A). El feed muestra
  nombre público y foto, nada de contacto directo.
- **Ubicación difuminada** (~250 m), nunca la exacta.
- **Legal:** los Términos ya prohíben la venta de animales; la adopción gratuita es
  legítima. La denuncia/bloqueo (Tanda B) debe alcanzar también las publicaciones de
  adopción y su chat → `moderation.ts` suma `denunciarAdopcion`, y el ocultado de contenido
  de usuarios bloqueados aplica al feed (filtrar en `buscar_adopciones` como en reportes, no
  después de paginar).

## Testing

- `schemas/adoption.ts`: validación (especie válida, longitudes, tri-estados, ≥1 foto).
- `adoptions.ts`/`adoptionSaves.ts`: CRUD con mocks.
- `messages.ts`: **tests del refactor a `HiloCtx`** — que un hilo de adopción, uno de
  reporte y uno de reporte-borrado entre las mismas dos personas **no se fundan** ni se
  filtren cruzado (el bug del `.is('pet_id', null)`). `foldConversations` con mensajes mixtos.
- `busquedaAdopciones.ts`: cursor/paginación (mismos casos borde que `busqueda.ts`).
- Manual post-deploy: RLS de `adoptions`/`adoption_saves`; que el feed no muestre reportes;
  que contactar una adopción cree un hilo separado del de un reporte con la misma persona;
  final feliz saca del feed.

## Archivos

- `supabase/migrations/0030_adopciones.sql` (nuevo)
- `src/services/adoptions.ts`, `src/services/adoptionSaves.ts`,
  `src/services/busquedaAdopciones.ts`, `src/hooks/useBusquedaAdopciones.ts`,
  `src/schemas/adoption.ts` (nuevos)
- `src/context/AdoptionSavesProvider.tsx` (nuevo; espeja FavoritesProvider) + montaje en `App.tsx`
- `src/screens/AdopcionFeedScreen.tsx`, `PublicarAdopcionScreen.tsx`,
  `AdopcionDetailScreen.tsx` (nuevos)
- `src/services/messages.ts` (**refactor a `HiloCtx`** — COMPARTIDO/central)
- `src/screens/ChatScreen.tsx`, `src/screens/ConversationsScreen.tsx` (adaptar al ctx)
- `src/services/moderation.ts` (`denunciarAdopcion`)
- `src/navigation/TabNavigator.tsx` (8ª pestaña) + `RootNavigator.tsx` (detalle + linking)
- `supabase/functions/send-push/*` (ruta `/adopcion/:id` si aplica)

## Fuera de alcance (YAGNI en la v1)

- Me gusta / comentarios. Push/avisos de adopción (queda para una v2, reusando la cola).
- Refugios/rescatistas con rol propio. Compartir con afiche/QR. Coincidencias
  adopción↔búsqueda. Favoritos polimórficos (tabla paralela por ahora).

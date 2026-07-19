# Tanda D — Rendimiento y costos

Fecha: 2026-07-19 · Estado: aprobado, listo para plan

Cuatro piezas (más una quinta evaluada y **descartada casi entera**) que comparten un tema:
**lo que crece solo**. Ninguna de las cuatro molesta hoy — la base de producción está
prácticamente vacía. Lo que las junta es que las cuatro empeoran sin que nadie haga nada,
y tres de ellas son mucho más baratas de arreglar ahora que dentro de un año.

La regla que ordena toda la tanda: **se arregla ahora lo que es barato hoy y caro después,
o lo que ya está mal por otro motivo. Lo demás se difiere con un umbral escrito.**

1. La cola de avisos no se vacía nunca → **hacer ahora** (barato)
2. `pg_cron` cada minuto → **hacer ahora** (una línea) + **diferir** la parte con `pg_net`
3. Conversaciones sin paginar → **diferir la RPC**, hacer solo los índices
4. Fotos huérfanas al borrar un reporte → **hacer ahora, es la prioridad #1** (no es
   rendimiento, es privacidad, y duele desde el usuario número uno)
5. `Auth RLS Initialization Plan` → **no tocar 18 de 19 políticas**, ver el porqué

---

# 0. Lo que se confirmó antes de diseñar

No se dio nada por hecho. Verificado en el código real el 19-jul:

| Afirmación | Verificado | Resultado |
|---|---|---|
| La cola nunca se borra | `send-notifications/index.ts:284,293` | ✅ Solo hay `update` a `estado`. **No existe un solo `delete`** sobre `notification_events` en todo el repo |
| El cron corre cada minuto | `docs/agendar-avisos.sql:19` | ✅ `'* * * * *'` |
| Conversaciones sin límite | `src/services/messages.ts:95-99` | ✅ `select('*')` + `.or(...)` + `order`, **sin `.limit()` ni `.range()`** |
| `deletePet` no borra fotos | `src/services/pets.ts:100-103` | ✅ Tres líneas: `delete().eq('id', id)`. Nada de Storage |
| La defensa del regex existe | `0017_borrado_cuenta.sql:94` | ✅ `r.ruta ~ ('^' \|\| uid::text \|\| '/[^/]+$')`, más la copia en `delete-account/index.ts:121` |

**Una corrección al enunciado del problema.** Se dijo que la cola la llenan triggers "en
cada publicación, pista y mensaje". **Los mensajes no encolan nada.** Los tres triggers de
`0011_avisos.sql:50,62,79` están sobre `pets` (insert), `sightings` (insert) y `pet_tips`
(insert). Importa porque el chat es, de lejos, lo que más filas genera por usuario activo:
si encolara, la tabla crecería un orden de magnitud más rápido y esta pieza dejaría de ser
diferible. No es el caso. La cola crece con **eventos de barrio**, no con conversación.

---

# 1. La cola de avisos no se vacía nunca

## El problema

`supabase/functions/send-notifications/index.ts` marca cada evento y lo deja donde está:

```ts
// línea 293 — el camino feliz
.update({ estado: 'enviado', procesado_en: new Date().toISOString() })
.eq('id', ev.id);
```

`notification_events` es una tabla de **cola** que en la práctica funciona como **bitácora
permanente**. Cada reporte publicado, cada avistamiento y cada pista deja una fila para
siempre, con su `datos jsonb` adentro (que para las pistas incluye 120 caracteres de texto
del vecino, ver `0011_avisos.sql:70`).

Dos consecuencias, y la segunda es la que de verdad importa:

1. **Espacio.** Una fila ronda los 200-400 bytes. Es el problema menor.
2. **El índice `notification_events_pendientes_idx (estado, creado_en)` se degrada.** El
   despachador hace `where estado='pendiente' order by creado_en limit 50` una vez por
   minuto. Mientras la tabla tenga 500 filas da igual; con 500.000 filas de las cuales 3
   están pendientes, Postgres sigue usando el índice pero recorre una estructura mucho más
   grande, y el autovacuum tiene que pasar por encima de todo eso cada vez. Es lento de
   forma *creciente y silenciosa*: nadie recibe un error, los avisos solo empiezan a tardar.

## Alcance

**Dentro:** una purga automática, verificable antes de correr, de los eventos ya
despachados.

**Fuera:** archivar los eventos en otra tabla o en un bucket. No hay ninguna pregunta de
negocio que hoy se responda con esos datos. Si algún día hay analítica, se diseña entonces
con datos agregados, no guardando la cola cruda "por si acaso". YAGNI.

**Fuera:** tocar el despachador. Cuanto menos se toque una función que ya está desplegada,
verificada y con un agujero de seguridad recién cerrado (el `OPTIONS`), mejor.

## Diseño — migración `0019_rendimiento.sql`

### Qué se borra y qué no

```
estado = 'enviado'  y  procesado_en < now() - interval '90 days'   → SE BORRA
estado = 'error'                                                    → NUNCA se borra
estado = 'pendiente'                                                → NUNCA se borra
```

Las tres reglas tienen su porqué, y las dos exclusiones son la parte importante:

- **`error` no se toca jamás.** Son las únicas filas que dicen "este aviso no salió y por
  qué" (`error_detalle`, que se agregó justo para eso). Son un puñado por definición: un
  evento llega a `error` recién tras 3 intentos. Borrarlas ahorraría kilobytes y costaría
  la única forma de enterarse de que los avisos están rotos. Hoy, con Brevo sin activar y
  Resend en modo prueba, es información que vale.
- **`pendiente` no se toca jamás**, obviamente: es la cola viva. Pero se escribe explícito
  en la migración porque un `where procesado_en < ...` a secas ya excluiría los pendientes
  por tener `procesado_en` nulo, y **depender de eso es frágil**: alcanza con que alguien
  agregue un `procesado_en` provisorio en un reintento futuro para que la purga se empiece
  a comer la cola viva. El `estado = 'enviado'` explícito es la defensa.
- **90 días** y no 7 ni 30. Es un margen deliberadamente generoso, porque **el borrado es
  irreversible** y en este proyecto ya hubo un Critical por un borrado en cascada que se
  llevó hilos de chat enteros. 90 días de eventos a la escala de esta app son unos pocos
  miles de filas: la retención larga no cuesta nada y compra la posibilidad de investigar
  "¿por qué no me llegó el aviso de hace dos meses?".

### La purga se puede mirar antes de correr

Dos funciones, no una. La de solo lectura existe para poder responder *"¿qué se va a
borrar?"* sin borrar nada:

```sql
-- Solo lectura. Contesta que se llevaria la purga si corriera ahora.
create or replace function public.avisos_a_purgar()
returns table (cuantos bigint, mas_viejo timestamptz, mas_nuevo timestamptz)
language sql security definer set search_path = public, pg_temp stable
as $$
  select count(*), min(procesado_en), max(procesado_en)
    from public.notification_events
   where estado = 'enviado'
     and procesado_en < now() - interval '90 days';
$$;
```

Y la que borra, con **tope por corrida**:

```sql
create or replace function public.purgar_avisos()
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare borradas bigint;
begin
  -- Tope de 5000 por corrida: la PRIMERA purga sobre un atraso grande no puede
  -- quedarse minutos con la tabla tomada mientras los triggers de publicacion
  -- intentan insertar. Si sobra trabajo, la proxima corrida semanal lo termina.
  -- Se autocura sin intervencion.
  with victimas as (
    select ctid from public.notification_events
     where estado = 'enviado'
       and procesado_en < now() - interval '90 days'
     limit 5000
  )
  delete from public.notification_events e
   using victimas v where e.ctid = v.ctid;
  get diagnostics borradas = row_count;
  return borradas;
end; $$;

revoke all on function public.avisos_a_purgar()  from public, anon, authenticated;
revoke all on function public.purgar_avisos()    from public, anon, authenticated;
```

**Sin parámetros, las dos.** Misma propiedad que `mi_perfil()` y `anonimizar_mi_cuenta()`:
no existe una firma que permita pedir "borrá hasta tal fecha". La ventana de 90 días está
compilada adentro; cambiarla exige una migración, que se revisa. Y sin `execute` para
`anon` ni `authenticated`: solo las llama el `postgres` del cron.

### Índice para la purga

El índice actual `(estado, creado_en)` sirve para *leer la cola*, no para purgar (que
filtra por `procesado_en`). Uno parcial, chiquito porque solo indexa lo purgable:

```sql
create index if not exists notification_events_purga_idx
  on public.notification_events (procesado_en) where estado = 'enviado';
```

### Cuándo corre

Un job de `pg_cron` **propio**, semanal, domingo 04:00:

```sql
select cron.schedule('purgar-avisos', '0 4 * * 0', $$ select public.purgar_avisos(); $$);
```

Separado del despachador **a propósito**, y por dos motivos:

1. **Aislamiento de fallas.** Si la purga rompe, el despacho sigue; si el despacho rompe,
   la purga sigue. Meterla adentro de `send-notifications` habría acoplado un borrado
   irreversible al camino caliente de los avisos, y habría exigido redesplegar la Edge
   Function.
2. **No sale de la base.** `purgar_avisos()` corre como SQL puro dentro de Postgres: sin
   HTTP, sin `service_role` viajando por la red, sin depender de que `pg_net` esté vivo.
   Menos superficie que cualquier alternativa.

## Alternativas descartadas

- **Purgar desde el despachador, al final de cada corrida.** Más simple de escribir, pero
  ata un borrado irreversible a la función más crítica y hace que la purga corra 43.000
  veces al mes para no hacer nada 42.999.
- **`ON DELETE` / TTL nativo.** Postgres no tiene TTL de filas. Se hace con cron o no se
  hace.
- **Particionar la tabla por mes y hacer `drop partition`.** Es la solución correcta a
  escala de millones de filas y es *más* eficiente que borrar. También es una migración
  mucho más invasiva sobre una tabla con triggers en producción, para un problema que hoy
  son 200 filas. Se reevalúa si la cola pasa el millón de filas al año.

## Casos borde

- **Primera corrida sobre un atraso grande:** cubierto por el tope de 5000 y la
  autocuración semanal.
- **La purga corre mientras el despachador procesa un lote:** no se pisan. El despachador
  toca `estado='pendiente'`; la purga solo `estado='enviado'` con `procesado_en` de hace
  más de 90 días. Los conjuntos son disjuntos por construcción.
- **Un evento marcado `enviado` con `procesado_en` nulo** (no debería existir, pero): la
  comparación `null < ...` es `null`, no entra al `where`. **Sobrevive**, que es el lado
  correcto en el que fallar.
- **Migración reaplicada:** todo es `create or replace` / `if not exists`, y el
  `cron.schedule` se protege con el mismo `unschedule` condicional que ya usa
  `docs/agendar-avisos.sql:14`.

## Verificación

1. **Antes de agendar nada**, correr `select * from public.avisos_a_purgar();` contra la
   base real. Con la base de hoy debe devolver **0** — no hay ningún evento de hace 90
   días. Ese cero es la prueba de que la purga no se va a llevar nada por sorpresa.
2. Prueba de sobrevivencia, con `service_role` en el SQL Editor: insertar a mano tres
   filas —una `enviado` de hace 200 días, una `enviado` de hace 10 días, una `error` de
   hace 200 días—, correr `purgar_avisos()`, y confirmar que devuelve **1** y que
   sobreviven exactamente las otras dos. Borrar las de prueba después.
3. `select public.avisos_a_purgar();` sin sesión y con una sesión `authenticated` → `42501`
   en ambos casos.
4. Confirmar el job: `select jobname, schedule, active from cron.job;` → dos jobs,
   `despachar-avisos` y `purgar-avisos`.

## ¿A partir de cuándo duele?

| Escenario | Filas/año | ¿Molesta? |
|---|---|---|
| Hoy (0 usuarios reales) | ~0 | No |
| 100 usuarios activos, ~1 evento/usuario/mes | ~1.200 | No, ni en 10 años |
| 1.000 usuarios, 3 eventos/usuario/mes | ~36.000 | Recién al tercer o cuarto año |
| 10.000 usuarios | ~360.000 | Sí, al segundo año |

**Duele de verdad recién con miles de usuarios activos sostenidos por años.** Se hace
igual ahora porque son ~40 líneas de SQL sin riesgo para la app, y porque el momento
barato de escribir una purga es cuando `avisos_a_purgar()` devuelve 0 y podés probarla sin
miedo. Escribirla con 400.000 filas encima es la misma tarea, con las manos temblando.

---

# 2. `pg_cron` cada minuto

## El problema

`docs/agendar-avisos.sql:19` agenda `'* * * * *'`: ~43.200 invocaciones al mes de la Edge
Function. La cola se llena con eventos de barrio (reportes, avistamientos, pistas), así que
con el uso de hoy —y con el de bastante tiempo más— la abrumadora mayoría de esas corridas
lee la cola, encuentra `[]` y devuelve `{"ok":true,"procesados":0}`.

**Costo en dinero hoy: cero.** El plan gratis de Supabase da 500.000 invocaciones de Edge
Function al mes; 43.200 son el ~8,6%. `pg_cron` no se cobra aparte. Esto no es un problema
de plata, es de desperdicio y de margen: si el día de mañana se agrega otra función
agendada, ese 8,6% ya está gastado en nada.

## Las tres opciones

**(a) Bajar la frecuencia.** `'*/5 * * * *'` → 8.640/mes (-80%). Latencia máxima del aviso:
5 minutos. Una línea de SQL. Riesgo: nulo.

**(b) Disparar desde el trigger con `pg_net`.** El encolador hace además un
`net.http_post` hacia la función. Latencia: segundos. Invocaciones: una por evento, o sea
proporcional al uso real, que es lo teóricamente correcto.

Pero tiene tres costos que a esta escala no se pagan solos:

- **La entrega deja de tener red.** `net.http_post` es asíncrono (encola en
  `net.http_request_queue` y un worker lo manda), así que no bloquea el `insert` del
  usuario — bien. Pero si ese worker está caído o el POST se pierde, **nadie reintenta**:
  el evento queda `pendiente` para siempre. Hoy el cron es exactamente esa red.
- **Una credencial adentro de un trigger.** El `Authorization: Bearer sb_publishable_…`
  tendría que vivir en la función del trigger, que corre `security definer` en cada
  publicación de cada usuario.
- **Hay que tocar los tres encoladores**, que están en producción y son justo lo que
  rompería la publicación de reportes si tuvieran un error. Ya pasó por acá: la
  verificación del 18-jul de `0011` probó explícitamente que publicar no falle, porque un
  encolador roto tumba el `insert` entero.

**(c) Híbrido:** (b) para latencia + un cron de baja frecuencia como red de seguridad. Es
el diseño correcto a largo plazo y el que se recomienda **cuando llegue el momento**.

## Decisión

**Ahora: solo (a).** Cambiar `'* * * * *'` por `'*/5 * * * *'` en `docs/agendar-avisos.sql`
y reagendar. Una línea, -80% de invocaciones, riesgo cero.

**Diferido: (b)+(c), con un umbral explícito.** No se hace hasta que se cumplan las dos
condiciones:

1. **Que los avisos lleguen de verdad.** Hoy no llegan: ESTADO.md:195 dice que Brevo sigue
   sin activar (`403 SMTP account is not yet activated`) y Resend está en modo prueba. Y el
   push necesita build EAS. Optimizar la latencia de una cañería cuya última milla está
   tapada es la definición de trabajo prematuro. **5 minutos de latencia sobre un correo
   que no sale es igual a 1 minuto de latencia sobre un correo que no sale.**
2. **Que la latencia se note.** Con push funcionando y usuarios reales, 5 minutos de
   demora en "reporte nuevo en tu zona" es defendible pero no ideal — una mascota se aleja.
   Ahí sí vale.

Mientras tanto, dos observaciones anotadas para no redescubrirlas:

- **Techo de caudal.** `LOTE = 50` (`index.ts:24`) con `*/5` da 600 eventos/hora. De sobra
  hoy. No se sube el lote: cada evento hace un `auth.admin.getUserById` más una llamada
  HTTP al proveedor, y la Edge Function tiene tope de tiempo de pared. Si alguna vez hace
  falta caudal, la respuesta es paralelizar dentro del lote, no agrandarlo.
- **Un aviso atrasado no se pierde**, solo llega tarde: los eventos siguen `pendiente`
  hasta que alguien los procese. Eso es lo que hace seguro bajar la frecuencia.

## ¿A partir de cuándo duele?

Nunca por costo, con el plan gratis. Empieza a doler por **latencia percibida** recién
cuando el push funcione y haya suficiente densidad de usuarios en una misma zona como para
que "avisar rápido" cambie el resultado de una búsqueda. Estimación: **cientos de usuarios
activos en la misma ciudad**. Muy lejos.

---

# 3. Conversaciones: se traen todos los mensajes de la historia

## El problema

`src/services/messages.ts:95-99`:

```ts
const { data, error } = await supabase
  .from('messages')
  .select('*')
  .or(`from_user.eq.${me},to_user.eq.${me}`)
  .order('creado_en', { ascending: false });
```

Sin `.limit()`, sin `.range()`, y con `select('*')`, o sea trayendo el `texto` completo de
cada mensaje que esa persona escribió o recibió **en toda su vida en la app** — para
después quedarse con uno por conversación. Se llama en `ConversationsScreen.tsx:27`, o sea
**cada vez que se abre la pestaña de mensajes**.

El agrupado vive en `foldConversations` (línea 82), que es puro y corre en el teléfono.

## Por qué paginar no es trivial (y por qué el atajo obvio es un bug)

**Rechazado: `.limit(500)`.** Es la solución de una línea y es **una pérdida silenciosa de
datos en pantalla**. El límite corta por recencia de *mensaje*, no de *conversación*: si
alguien tiene una conversación muy activa con un vecino, esos 500 mensajes se comen el
cupo y **una conversación vieja pero viva desaparece de la lista sin ningún aviso**. La
persona abre Mensajes y un hilo no está. Es exactamente la clase de fallo —silencioso, sin
error, con la app diciendo "listo"— que en este proyecto ya se coló tres veces (el
`Prefer: return=minimal` que pisaba el teléfono, el reintento del borrado que perdía las
fotos, el cursor de distancia que salteaba filas).

Paginar de verdad tampoco sirve: no se puede paginar el resultado *agrupado* si el
agrupado ocurre después de traer los datos.

## Diseño (diferido) — el agrupado se muda al servidor

Es la misma jugada que ya funcionó en `0014`/`0015` con la búsqueda: dejar de traer todo
para filtrar en el teléfono y que Postgres haga el trabajo.

RPC `public.mis_conversaciones(p_limite int, p_cursor timestamptz)`, con `distinct on`:

```sql
select distinct on (m.pet_id, otro)
       m.pet_id, otro, m.texto as last_texto, m.creado_en as last_at
  from public.messages m,
       lateral (select case when m.from_user = auth.uid() then m.to_user
                            else m.from_user end) as x(otro)
 order by m.pet_id, otro, m.creado_en desc
```

…envuelto para ordenar por `last_at desc` y cortar por cursor. **`SECURITY INVOKER`**, para
que la RLS de `messages` siga aplicándose exactamente igual que hoy — misma decisión que
`buscar_reportes`.

### El caso borde que hay que respetar

`foldConversations` arma la clave como la cadena `` `${m.pet_id}:${otherUser}` ``. Con
`pet_id` nulo (reporte borrado, migración `0017`) eso da `"null:<uid>"`, así que **todos
los hilos con reporte borrado de una misma persona se funden en uno solo**. En SQL,
`distinct on` trata los NULL como iguales entre sí, así que **el comportamiento coincide**.
No es casualidad afortunada: es la propiedad que hay que verificar con un test antes de
cambiar nada, porque si divergieran, un usuario vería dos hilos donde antes veía uno (o
peor, al revés).

### Qué se conserva

- **`foldConversations` y sus tests no se borran.** Sirven de escalón de respaldo si la RPC
  no existe todavía (`PGRST202`), igual que el patrón que ya usan `messages.ts:123` y
  `tips.ts`. Y sirven de **oráculo**: un test que corre el mismo fixture por la función
  pura y por la RPC y exige el mismo resultado.
- El resto de `listConversations` (el `.in(ids)` a `profiles` y a `pets`, el reintento sin
  `eliminado_en`) queda igual. Ahí no hay N+1 y ya está resuelto.

### La política de `messages` se reescribe en la misma migración

Único lugar donde el aviso `Auth RLS Initialization Plan` es real (ver pieza 5):

```sql
-- Antes: using (auth.uid() = from_user or auth.uid() = to_user)   -- 0001_init.sql:79
-- Dos evaluaciones POR FILA sobre el barrido de mensajes.
create policy "leer solo mis mensajes" on public.messages for select to authenticated
  using ((select auth.uid()) = from_user or (select auth.uid()) = to_user);
```

Va acá y no en una migración de "optimización de RLS" porque es la **misma** consulta que
esta pieza arregla, y así queda cubierta por la misma verificación.

## Lo que SÍ se hace ahora: los índices

Son gratis, son reversibles, aceleran también `countUnread` y `listMessages`, y en una
tabla casi vacía se crean al instante. Van en `0019_rendimiento.sql`:

```sql
create index if not exists messages_from_creado_idx on public.messages (from_user, creado_en desc);
create index if not exists messages_to_creado_idx   on public.messages (to_user,   creado_en desc);
```

Sin ellos, la RPC del futuro barrería la tabla igual, y `countUnread` (que corre en cada
render de la campanita) hace `where to_user = me and leido = false`.

## ¿A partir de cuándo duele?

Una fila de `messages` con su texto ronda los 150 bytes en JSON.

| Mensajes acumulados por usuario | Peso de abrir "Mensajes" | ¿Molesta? |
|---|---|---|
| 200 (uso normal, primer año) | ~30 KB | No |
| 2.000 (usuario muy activo, un año) | ~300 KB | Se nota en 3G |
| 10.000 (dueño de refugio, dos años) | ~1,5 MB **en cada apertura** | Sí, claramente |

**El umbral concreto para dejar de diferir: cuando el usuario más activo pase de ~2.000
mensajes**, o antes si aparece un caso de uso tipo refugio/rescatista, que acumula
conversación mucho más rápido que un vecino. Se mide con una consulta de una línea:
`select max(c) from (select count(*) c from messages group by from_user) t;`

Se difiere porque es **la pieza más cara de la tanda** (migración + RPC + servicio +
escalón de respaldo + tests de equivalencia), la de mayor riesgo de regresión visible
—romper la lista de mensajes se ve al instante y es la función más querida de la app— y la
que hoy no le molesta absolutamente a nadie. Los índices, en cambio, cuestan dos líneas.

---

# 4. Fotos huérfanas al borrar un reporte

**Esta es la prioridad #1 de la tanda, y no por rendimiento.**

## El problema

`src/services/pets.ts:100-103`:

```ts
export async function deletePet(id: string): Promise<void> {
  const { error } = await supabase.from('pets').delete().eq('id', id);
  if (error) throw error;
}
```

Borra la fila y **nada más**. Las fotos siguen en el bucket `pet-photos`, que es **público**,
accesibles por URL para siempre.

Lo que lo convierte en un problema de privacidad y no de espacio: cuando alguien borra su
reporte, lo que quiere decir es *"quiero que esto deje de estar publicado"*. Puede ser una
foto de su casa, de sus hijos en el fondo, o simplemente algo que ya no quiere expuesto. La
app le responde "listo" y la imagen sigue online.

La tanda A lo **atenuó**: desde `src/lib/idAleatorio.ts` las rutas son
`${userId}/${idAleatorio()}.jpg` con 128 bits de aleatoriedad, así que ya no se puede
enumerar el bucket ni adivinar la ruta. **Pero no lo resolvió**: cualquiera que haya visto
el reporte antes de que se borrara —o que tenga la URL en el historial, en una captura, en
un mensaje de WhatsApp, en el caché de un buscador— la sigue teniendo válida para siempre.

Se llama desde `ProfileScreen.tsx:110`.

## El hallazgo que hace esto barato y seguro

**No hace falta migración. Ni RPC. Ni tocar `service_role`.**

El Critical de la tanda de borrado de cuenta existía porque `delete-account` corre con
`service_role`, **que se saltea la RLS de Storage**: con ese poder, una ruta ajena metida a
mano en `pets.fotos` se borraba de verdad. Por eso hicieron falta el regex y la RPC.

`deletePet` es distinto: corre **como el usuario**, por PostgREST, con su JWT. Y
`0001_init.sql:118-120` ya dice:

```sql
create policy "borrar mis fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'pet-photos' and owner = auth.uid());
```

`owner` lo pone Storage en el `upload` (política de la línea 115). O sea que **la vía de
escalada no existe acá**: si alguien mete la ruta de una foto ajena en su propio reporte y
lo borra, Storage rechaza ese borrado por RLS. El peor caso es que no se borre nada.

## Diseño — solo cliente

En `src/services/pets.ts`, `deletePet` pasa a tres pasos, **en este orden**:

1. **Leer** el reporte (`fotos` y `final_foto`) *antes* de destruir la fila.
2. **Borrar** de Storage las rutas que pasen el filtro.
3. **Borrar** la fila.

El orden es la lección literal del Critical #2 del borrado de cuenta: *"la RPC entregaba
las rutas una sola vez; si Storage fallaba, el reintento recibía vacío y las fotos quedaban
para siempre en un bucket público mientras respondíamos listo"*. Si se borra la fila
primero, las rutas se pierden y no hay reintento posible.

### El filtro se replica igual, aunque la RLS ya alcance

Nuevo helper puro en `src/lib/rutaStorage.ts` (con tests), que hace lo mismo que
`ruta_storage()` de `0017_borrado_cuenta.sql:30` más el regex de la línea 94:

```ts
// Misma forma que exige mis_fotos_a_borrar(): un unico segmento bajo la
// carpeta del propio usuario. `<miuid>/../<otro-uid>/foto.jpg` NO pasa.
const OK = new RegExp(`^${userId}/[^/]+$`);
```

**No es redundancia inútil, y no es la defensa principal** (la defensa es la RLS de
Storage, que no se puede evitar desde el cliente). Está por tres motivos: hace explícita en
el código la misma invariante que ya protege el borrado de cuenta, evita mandarle a Storage
rutas que van a rebotar, y —el que importa— si alguna vez este camino se mueve a una Edge
Function con `service_role`, el filtro ya está puesto. La regla escrita en el plan de la
tanda A es *"cualquier borrado de fotos nuevo debe tener la misma protección"*, y se
cumple al pie de la letra.

### Qué pasa si Storage falla

**Se borra la fila igual, y se registra el fallo.** Decidido a conciencia:

- Si se aborta el borrado del reporte, un hipo de Storage deja a la persona **sin poder
  borrar su propio reporte** — que puede ser justo una urgencia de privacidad.
- Si se sigue, queda una foto huérfana, que es **exactamente el estado de hoy**. Se degrada
  al status quo, no a algo peor.

Es la misma forma del riesgo aceptado (a) del borrado de cuenta: se elige el estado malo
**visible** por sobre el estado malo **silencioso**.

## Casos borde

- **`final_foto` es fácil de olvidar.** La foto del "final feliz" vive en su propia columna
  (`0008_final_feliz.sql`), no en el array `fotos`. `mis_fotos_a_borrar()` sí la contempla
  (`0017:75`). Acá también, o el reencuentro deja siempre una huérfana.
- **`closePet` (`pets.ts:87`) NO borra fotos.** Correcto: marca `activo = false`, el reporte
  sigue existiendo y su foto se sigue mostrando.
- **`updatePet` (`pets.ts:92`) no toca `fotos`** — verificado, su `Pick` no la incluye. Así
  que editar un reporte no genera huérfanas hoy. **Si alguna vez se agrega editar fotos,
  reaparece este mismo problema** con las fotos reemplazadas. Queda anotado.
- **La misma URL en dos reportes propios.** No se puede desde la UI, pero sí por API.
  Borrar uno rompe la imagen del otro. Son datos propios y el usuario tuvo que salirse de la
  app para lograrlo: aceptado.
- **Fotos de avistamientos ajenos:** no se tocan, `deletePet` solo mira `pets`. Coherente
  con `0017:64-66`, donde sobreviven a propósito.
- **Reporte con `fotos` vacío:** no se llama a `remove([])`, se saltea el paso.
- **Fotos viejas ya huérfanas:** las que quedaron de reportes borrados antes de este
  cambio **no se limpian**. Barrer el bucket comparando contra `pets.fotos` es un borrado
  masivo e irreversible sobre datos de usuarios, y hoy la base está prácticamente vacía —
  el beneficio es cero y el riesgo no. **Se difiere y, si algún día se hace, con un
  inventario impreso y revisado a mano primero.**

## Verificación

1. **Unitarios** de `rutaStorage.ts`: que extraiga la ruta de la URL pública, que devuelva
   `null` para una URL de otro bucket, y que **rechace** `<miuid>/../<otro>/foto.jpg` y
   `<otro-uid>/foto.jpg`. Es el mismo juego de casos que el test del regex de `0017`, que
   debe seguir verde.
2. **Unitarios** de `deletePet`: que lea antes de borrar, que incluya `final_foto`, y que
   **igual borre la fila** si `storage.remove` rechaza.
3. **Contra la base real** — la única que prueba lo que importa: publicar un reporte con
   foto desde la app, **guardar la URL pública**, comprobar con `curl` que devuelve `200`,
   borrar el reporte, y comprobar que la misma URL devuelve **`400`/`404`**. Sin este paso
   no se puede afirmar que el problema esté resuelto.
4. **El ataque:** desde la cuenta A, meter por API la ruta de una foto de B en un reporte
   propio, borrarlo, y confirmar que la foto de B **sigue online**. Verifica que la RLS de
   Storage sostiene lo que este diseño le delega.

## ¿A partir de cuándo duele?

**Desde el primer usuario que borre un reporte con foto.** No crece: ya está mal. Por eso
va primera, aunque sea la única de la tanda que no es un problema de escala.

---

# 5. `Auth RLS Initialization Plan` — evaluado y descartado casi entero

## Qué dice el aviso

Cuando una política usa `auth.uid()` directo, Postgres lo re-evalúa **por cada fila**
examinada. Envolverlo en `(select auth.uid())` lo convierte en un InitPlan: se evalúa una
vez por consulta. Es semánticamente idéntico (`auth.uid()` es `STABLE`).

## Inventario real

**19 políticas** con `auth.uid()` directo, en 10 tablas más `storage.objects`. Pero el aviso
solo importa si la política se evalúa sobre **muchas filas**, así que lo que hay que contar
no son políticas, son filas:

| Tabla | Políticas con `auth.uid()` | Filas por consulta | ¿Vale la pena? |
|---|---|---|---|
| `messages` | select, insert, update (`0001:79,81,83`) | **toda la historia del usuario** | **Sí, y solo el `select`** |
| `pets` | insert, update, delete (`0001:59,61,63`) | 1 (por PK) — el `select` es `using(true)`, sin `auth.uid()` | No |
| `profiles` | update, insert (`0001:13,15`) | 1 | No |
| `favorites`, `notification_prefs`, `alert_zones`, `push_tokens` | 1 c/u, `for all` | decenas | No |
| `pet_tips`, `pet_updates`, `sightings` | insert/delete — los `select` son públicos | 1 | No |
| `denuncias` | insert, select | pocas | No |
| `storage.objects` | insert, delete (`0001:117,120`) | 1 (por ruta) | No, **y además es esquema de Supabase** |

## Recomendación: tocar **una** política, no diecinueve

La única política que se evalúa sobre un conjunto grande de filas es
`"leer solo mis mensajes"` — y encima evalúa `auth.uid()` **dos veces por fila**. Casualidad
útil: es la tabla de la pieza 3. **Por eso se reescribe ahí, en la misma migración y bajo la
misma verificación**, y no en un cambio suelto.

Las otras 18 **no se tocan**, y conviene decir por qué con todas las letras:

- **El beneficio medible es cero.** Ahorrar 18 llamadas a una función `STABLE` sobre una
  consulta que toca una fila no es una optimización, es ruido.
- **El riesgo no es cero.** Cambiar una política implica `drop policy` + `create policy`, o
  sea una ventana —corta, pero real— sin esa política, y **una oportunidad de tipear mal un
  predicado por cada política tocada**. Diecinueve oportunidades de convertir un `= user_id`
  en algo que deje pasar filas ajenas, para no ganar nada.
- **En este proyecto ya pasó.** El historial completo de Criticals —el `on delete cascade`
  que se llevó los hilos de chat, el `pets.fotos` que permitía borrar fotos ajenas, el
  `select('*')` que pisaba el teléfono— es de cambios estructurales que parecían mecánicos.
  Una migración de 19 políticas RLS "para dejar el Advisor en verde" es exactamente ese
  animal.
- **El Advisor va a seguir avisando, y está bien.** Es un aviso de **rendimiento**, no de
  seguridad. Un tablero en verde no es un objetivo; que la app no filtre datos, sí. Queda
  anotado acá para que la próxima persona que vea el aviso no lo re-investigue desde cero.

**Si algún día se hace igual**, la forma correcta es: una tabla a la vez, con `alter policy`
en vez de drop+create donde se pueda, y un test de RLS contra la base real (cuenta A no ve
lo de B) por cada tabla tocada, en la misma sesión.

---

# Resumen ejecutivo y orden de trabajo

## Hacer ahora — `0019_rendimiento.sql` + dos cambios de cliente (~4-5 h)

| # | Qué | Por qué ahora | Esfuerzo |
|---|---|---|---|
| **4** | Borrar las fotos en `deletePet` | **Ya está mal hoy.** Es privacidad, no escala. Y sale barato: sin migración, la RLS de Storage ya cubre la escalada | ~2 h |
| **1** | Purga de `notification_events` (90 días, `enviado` solamente) + índice parcial + job semanal | Crece solo. El momento barato de escribir un borrado irreversible es cuando `avisos_a_purgar()` devuelve 0 | ~2 h |
| **3b** | Los dos índices de `messages` | Dos líneas, instantáneas en tabla vacía, y aceleran también `countUnread` | ~15 min |
| **2a** | Cron `'* * * * *'` → `'*/5 * * * *'` | Una línea, -80% de invocaciones, riesgo nulo | ~10 min |

## Diferir, con el umbral escrito

| # | Qué | Umbral para retomarlo | Esfuerzo cuando toque |
|---|---|---|---|
| **3a** | RPC `mis_conversaciones` + reescribir la política `select` de `messages` | Cuando el usuario más activo pase de **~2.000 mensajes**, o aparezca un caso tipo refugio | ~4-6 h |
| **2b** | Despacho por `pg_net` desde el trigger + cron como red | Cuando los avisos **lleguen de verdad** (Brevo/dominio + push EAS) **y** haya densidad de usuarios por ciudad | ~3 h |
| **4b** | Limpiar las fotos ya huérfanas del bucket | Solo si el bucket pesa. Con inventario revisado a mano antes | ~2 h |
| **5** | Las 18 políticas RLS restantes | **Probablemente nunca.** El beneficio es cero y el riesgo no | — |

## Orden de implementación

**4 → 1 → 3b → 2a.** La 4 primero porque es la única que ya está mal. La 1 después porque
es la única con SQL nuevo de verdad y merece la cabeza fresca. Las dos últimas son
cambios de una línea que se verifican solos.

Las cuatro son independientes entre sí: ninguna bloquea a otra, y ninguna tiene la
restricción de orden de despliegue que tuvo la tanda A — **`0019` no toca permisos ni
columnas que la app lea**, así que la migración y la web pueden ir en cualquier orden.

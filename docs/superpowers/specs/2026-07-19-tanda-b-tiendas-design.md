# Tanda B — Requisitos de tienda (App Store y Google Play)

Fecha: 2026-07-19 · Estado: propuesta, pendiente de decisiones del dueño (marcadas ⚖️)

Siete piezas que comparten un mismo tema: **sin esto la app no se publica**. No son mejoras
de producto — cada una es un requisito escrito de Apple, de Google, o de las dos. La tanda A
cerró lo que exponíamos de más; esta cierra lo que nos falta tener.

| # | Pieza | Lo exige | Existe hoy |
|---|---|---|---|
| 1 | Bloquear usuarios | Apple 1.2 · Play (UGC) | **Nada** |
| 2 | Denunciar en todas partes | Apple 1.2 · Play | A medias (solo reportes) |
| 3 | Filtro proactivo al publicar | Apple 1.2 | Nada |
| 4 | Aceptación explícita de Términos | Play (textual) | Un párrafo pasivo |
| 5 | Web pública de borrado de cuenta | **Google sí, Apple no** | Nada (el in-app sí existe) |
| 6 | Contacto de soporte visible | Apple · Play | Un placeholder literal |
| 7 | Permisos en `app.config.ts` | Apple · Play | Incompleto y genérico |

Apple 1.2 no pide una de estas cosas: pide **las cuatro juntas** — un método para *filtrar*
contenido objetable, un mecanismo para *denunciar*, la capacidad de *bloquear* usuarios, y
datos de contacto publicados. Y pide actuar sobre las denuncias en **24 horas**. Por eso las
piezas 1, 2, 3 y 6 son un solo bloque a los ojos del revisor, aunque acá se diseñen aparte.

## Alcance

**Dentro:** las siete piezas de la tabla, con su migración `0019`, sus pantallas y su
verificación.

**Fuera (decidido explícitamente):**

- **Panel de moderación web.** El dueño ya modera con el SQL Editor y `service_role`. Un
  panel es un producto entero, con su propio login y su propia superficie de ataque. YAGNI
  hasta que el volumen de denuncias lo pida.
- **Suspender o expulsar cuentas.** No hay ninguna tienda que lo exija; el auto-ocultado de
  reportes con 3 denuncias (`0003_moderacion.sql:24`) ya cubre el caso urgente. Y una
  expulsión automática es un arma: tres cuentas coordinadas echan a cualquiera.
- **Moderación de imágenes por IA.** Ver pieza 3 — se evaluó y se descarta con motivo.
- **Proceso de apelación.** Cuando alguien pueda quedar expulsado, hará falta. Hoy no lo hay.
- **Todo lo administrativo de las tiendas:** cuenta de desarrollador, ficha, capturas,
  cuestionario de clasificación por edad, formulario de seguridad de datos, build de EAS.
  Es trabajo del dueño, no de código, y va después de esta tanda.
- **Filtrar los mensajes privados del chat** (ver pieza 3, decisión explícita).

---

# 1. Bloquear usuarios

## El problema

**No existe.** Verificado: los únicos aciertos de "block" en `src/` son falsos positivos
(`Confetti.tsx`, `NotificationPrefsScreen.tsx`). Hoy, si alguien te acosa por el chat, tu
única salida es borrar tu cuenta.

Apple (1.2) y Play lo exigen los dos, y es lo primero que un revisor prueba, porque es lo
más fácil de probar: abre un chat y busca el botón.

Hay un segundo problema, más chico pero que condiciona el diseño: **no hay pantalla de perfil
de otro usuario**. `src/screens/` tiene `ProfileScreen` (el propio) y nada más. El nombre y la
foto de otra persona aparecen sueltos: firmando una pista, en la cabecera del chat, como dueño
de un reporte. No hay dónde poner el botón.

## Diseño

### La tabla (`0019_bloqueos.sql`)

```sql
create table public.bloqueos (
  bloqueador uuid not null references public.profiles(id) on delete cascade,
  bloqueado  uuid not null references public.profiles(id) on delete cascade,
  creado_en  timestamptz not null default now(),
  primary key (bloqueador, bloqueado),
  constraint bloqueos_no_a_si_mismo check (bloqueador <> bloqueado)
);
alter table public.bloqueos enable row level security;

create policy "veo solo mis bloqueos"   on public.bloqueos for select to authenticated
  using (auth.uid() = bloqueador);
create policy "bloqueo como yo"         on public.bloqueos for insert to authenticated
  with check (auth.uid() = bloqueador);
create policy "desbloqueo lo que bloqueé" on public.bloqueos for delete to authenticated
  using (auth.uid() = bloqueador);
```

La RLS es **asimétrica a propósito**: nadie puede leer quién lo bloqueó. Si se pudiera, el
bloqueo se convierte en una notificación de "esta persona te bloqueó", que es exactamente el
combustible de la represalia (crear otra cuenta, escribir por fuera, ir a la dirección del
reporte). El bloqueado se entera solo cuando intenta escribir, y con un mensaje neutro.

La CHECK de no-bloquearse-a-sí-mismo es la restricción de servidor que pide la regla de la
casa (`0016_validacion_servidor.sql`): la API es pública, el formulario no defiende nada.

### El corazón: una función anclada a `auth.uid()`

El bloqueo tiene que ser **efectivo en los dos sentidos**, y ahí choca con la RLS asimétrica:
para rechazar el mensaje del bloqueado hay que leer una fila que él no puede leer. Se resuelve
con la misma técnica que ya se verificó dos veces en este proyecto (`mi_perfil()`,
`anonimizar_mi_cuenta()`): **`security definer` sin parámetro de identidad**.

```sql
create function public.hay_bloqueo_con(p_otro uuid)
returns boolean
language sql security definer set search_path = public, pg_temp stable
as $$
  select exists (
    select 1 from public.bloqueos b
     where (b.bloqueador = auth.uid() and b.bloqueado  = p_otro)
        or (b.bloqueador = p_otro     and b.bloqueado  = auth.uid())
  );
$$;
revoke all on function public.hay_bloqueo_con(uuid) from public, anon;
grant execute on function public.hay_bloqueo_con(uuid) to authenticated;
```

Un solo parámetro, y el otro lado es **siempre** `auth.uid()`. No existe firma que permita
preguntar "¿A bloqueó a B?" por dos terceros. Lo único que filtra es "uno de los dos bloqueó
al otro", que es información que el usuario obtiene igual al intentar escribir.

### Que el bloqueado no pueda escribirte

Se reescribe la política de insert de `messages`, que ya fue modificada una vez por la `0017`
para las cuentas eliminadas (`0017_borrado_cuenta.sql:169`). Queda con las dos condiciones:

```sql
drop policy if exists "enviar mensajes como yo" on public.messages;
create policy "enviar mensajes como yo"
  on public.messages for insert to authenticated
  with check (
    auth.uid() = from_user
    and not exists (select 1 from public.profiles p
                     where p.id = messages.to_user and p.eliminado_en is not null)
    and not public.hay_bloqueo_con(messages.to_user)
  );
```

Es en el servidor y no en la pantalla porque la anon key es pública: con `curl` y un token de
sesión se escribe directo a PostgREST, saltándose la app entera. Un bloqueo que solo esconde
el botón no es un bloqueo.

**El mensaje de error es parte del diseño.** El rechazo llega como `42501`, y hoy
`src/lib/dbErrors.ts` mostraría jerga de Postgres. Se traduce a algo neutro:
*"No se pudo enviar el mensaje a esta persona."* — **nunca** "te bloqueó". Decirlo confirma el
bloqueo y arma al acosador.

### Qué se oculta y qué se queda

Aquí está la decisión de producto de toda la tanda.

| Contenido de la persona bloqueada | Qué le pasa a quien bloquea | Por qué |
|---|---|---|
| Mensajes nuevos hacia mí | No llegan (RLS) | Es el punto |
| El hilo de chat que ya existía | **Desaparece de Conversaciones** | Ver abajo |
| Sus pistas en cualquier reporte | Se ocultan | Es texto dirigido a personas |
| Sus avistamientos | Se ocultan **pero el pin queda** ⚖️ | Ver abajo |
| Sus novedades (si es dueño de un reporte) | Se ocultan | Igual que las pistas |
| **Sus reportes de mascota** | **Se quedan visibles** ⚖️ | Ver abajo |
| Avisos por correo y push de esa persona | No se envían | Si no puede escribirte, tampoco puede sonarte el teléfono |

**El hilo existente se oculta, no se borra.** Borrar es irreversible y además destruye los
mensajes que escribió el otro, que son la prueba de lo que pasó si hay que denunciar. Ocultar
es reversible con un "desbloquear". El otro sigue viendo el hilo de su lado: no se le avisa
nada, simplemente sus mensajes nuevos fallan.

⚖️ **Decisión pendiente del dueño — los reportes de mascota.** La recomendación es **no
ocultarlos**: un reporte de mascota perdida no es contenido dirigido contra nadie, es el
pedido de auxilio de un animal, y sacarlo del mapa castiga al perro por lo que hizo su dueño.
El bloqueo protege *tu relación con esa persona*, no te borra el barrio.
La alternativa (ocultar todo, sin excepción) es más literal respecto de lo que dice Apple y
más fácil de defender ante un revisor que insista. **Es un cambio de una línea** en
`buscar_reportes` (quitar la excepción), así que se puede virar sin rediseñar nada. Recomendado:
no ocultarlos. **Que lo decida el dueño antes de escribir el plan.**

⚖️ **Decisión pendiente, versión chica — los avistamientos.** Un avistamiento es medio dato
(la nota, el autor) y medio hecho (el pin: "acá pasó tu gato"). Recomendación: **ocultar la
nota y la firma, conservar el pin sin autor**, por el mismo motivo que los reportes. Es más
código que ocultarlo entero. Si el dueño prefiere lo simple, ocultarlo entero es defendible.

### Dónde se filtra: mitad servidor, mitad cliente

No es capricho, y hay una lección de la `0015` detrás.

- **Los reportes y coincidencias se filtran en el SERVIDOR**, dentro de `buscar_reportes` y
  `buscar_coincidencias` (`0014_busqueda_servidor.sql:107`), con
  `and not public.hay_bloqueo_con(p.user_id)` en el `where` — *si* el dueño elige ocultarlos.
  Nunca en el cliente: esas funciones tienen **paginación por cursor**, y filtrar después de
  recibir la página rompe el tamaño de página y desalinea el cursor. Es literalmente la
  familia de bugs que costó la migración `0015` (filas repetidas y filas salteadas en
  silencio). Las dos funciones son `invoker`, así que `auth.uid()` está disponible adentro.
- **Pistas, avistamientos, novedades y conversaciones se filtran en el CLIENTE**, con el
  conjunto de ids bloqueados cargado una vez en un `BloqueosProvider` — mismo patrón, mismo
  lugar y misma degradación que `FavoritesProvider` (si la tabla todavía no existe, conjunto
  vacío y la app funciona como siempre). Son listas cortas, sin cursor, y meterlas en la RLS
  obligaría a llamar una función `security definer` por fila en consultas que hoy son un
  `select` plano. YAGNI.

Consecuencia asumida y anotada: el filtrado de pistas es **cosmético**. Alguien con `curl`
puede leer la pista de quien bloqueó. Es correcto: son datos públicos, se leen sin cuenta por
diseño (`0012_pistas.sql:15`), y el modo invitado los muestra igual. El bloqueo protege de una
*persona*, no es un control de acceso.

### Dónde está el botón

Se crea `src/screens/PersonaScreen.tsx`, un perfil público mínimo: foto, nombre, "en la app
desde", y dos acciones — **Denunciar** y **Bloquear** (Ionicons de línea `flag-outline` y
`ban-outline`). Nada más: no lista sus reportes ni su actividad, porque eso es agregar
superficie de acoso, no quitarla. No muestra teléfono ni red social — la tanda A los cerró a
nivel de columna y **debe seguir así** (`0018_contacto_privado.sql`).

Se llega desde cuatro lugares: cabecera del chat (toque en el nombre), firma de una pista,
firma de un avistamiento, y dueño de un reporte en `PetDetailScreen`.

Y además, **bloquear tiene que estar en el chat sin salir del chat** — es lo que pide la
consigna y lo que prueba el revisor: un botón de menú (`ellipsis-horizontal`) en la cabecera de
`ChatScreen.tsx` con "Denunciar conversación" y "Bloquear a esta persona".

Al bloquear: confirmación que explica en una frase qué pasa ("No podrá escribirte y dejarás de
ver lo que publique. Puedes deshacerlo cuando quieras."), y vuelta a Conversaciones. El
desbloqueo vive en **Perfil → Personas bloqueadas**, no en un menú escondido: si bloquear es
fácil y desbloquear no, la gente bloquea menos.

## Casos borde

- **Modo invitado.** Sin sesión no hay a quién bloquear: el bloqueo es una relación entre dos
  cuentas. El botón usa el portero de siempre (`useRequireAuth`), con una acción nueva
  `'bloquear'` en `src/lib/requireAuth.ts:6` y su mensaje ("Creá tu cuenta para bloquear a esta
  persona"). **El invitado sigue viendo todo** — es correcto y es inevitable, y el modo
  invitado es sagrado. No se le pide cuenta para *mirar*, nunca.
- **Cuentas eliminadas.** Si la otra persona tiene `eliminado_en`, el botón de bloquear **no
  se muestra**: ya no puede escribir (la `0017` lo impide) y el hilo ya es de solo lectura.
  Ofrecerlo sería teatro.
- **Borrar mi cuenta con bloqueos puestos.** `anonimizar_mi_cuenta()` (migración `0017`)
  **tiene que borrar mis filas de `bloqueos` donde soy el bloqueador**: son datos privados
  míos y la lápida no los necesita. Las filas donde soy el *bloqueado* se quedan: son de otra
  persona y siguen siendo válidas contra mi lápida. **Olvidarse de esto deja datos privados
  después del borrado** — es justo la clase de detalle que se cayó entre tareas en las dos
  tandas anteriores. Va explícito en el plan.
- **Bloquear al dueño de un reporte donde dejé una pista.** Mi pista se queda (es mía y le
  sirve al animal). Simplemente dejo de ver sus novedades y no puedo escribirle.
- **Bloqueo mutuo.** Dos filas independientes. `hay_bloqueo_con` devuelve `true` igual;
  desbloquear de un lado no reabre el canal si el otro sigue puesto. Correcto.
- **Avisos.** `src/lib/notifyTargets.ts` decide a quién le toca cada aviso, y su copia gemela
  vive en la Edge Function (hay un test que falla si se desincronizan — mantenerlo verde). El
  filtro de bloqueo va ahí, y también en `send-push`. Un push de alguien a quien bloqueaste es
  peor que un mensaje: suena en el teléfono.

## Verificación

1. **Unitarios** del provider y de la lógica pura de filtrado.
2. **Ataque a la API real**, con dos cuentas descartables y sus tokens, saltándose la app —
   el único nivel que prueba algo acá:
   - A bloquea a B; B intenta `insert` en `messages` hacia A → **`42501`**.
   - A intenta `insert` en `messages` hacia B → **`42501`** también (los dos sentidos).
   - B pide `select * from bloqueos` → **cero filas** (no puede saber que lo bloquearon).
   - B llama `hay_bloqueo_con(A)` → `true`; `hay_bloqueo_con(<un tercero>)` → `false`.
   - Sin sesión, `hay_bloqueo_con(...)` → **`42501`**.
   - **Control de no-regresión:** A escribe a un tercero sin bloqueo → **`201`**. Sin este
     control, una política rota "pasa" todas las pruebas de arriba.
   - A se desbloquea de B → B puede escribir de nuevo.
3. **Playwright** contra el sitio: bloquear desde el chat, ver desaparecer el hilo, ver
   desaparecer sus pistas de un reporte, desbloquear en Perfil y ver volver todo.

---

# 2. Denunciar en todas partes

## El problema

`src/services/moderation.ts` es un archivo de seis líneas con una sola función:

```ts
export async function denunciarPet(petId: string, reporterUser: string, motivo: string)
```

Se usa en un solo lugar (`PetDetailScreen.tsx:325`). O sea: **solo se puede denunciar un
reporte de mascota**. No se puede denunciar a una persona, ni un mensaje del chat, ni una
pista, ni un avistamiento. El chat es donde ocurre el abuso real y donde mira el revisor.

## Diseño

**Se extiende la tabla `denuncias` que ya existe; no se crea una nueva.** La `0003` ya trae
la RLS correcta y el trigger de auto-ocultado con 3 denuncias, que funciona y no queremos
reescribir.

```sql
alter table public.denuncias
  alter column pet_id drop not null,
  add column tipo text not null default 'reporte',
  add column objeto_id uuid,
  add column usuario_denunciado uuid references public.profiles(id) on delete cascade,
  add column detalle text,
  add constraint denuncias_tipo_valido
    check (tipo in ('reporte','usuario','mensaje','pista','avistamiento')),
  add constraint denuncias_motivo_largo check (length(btrim(motivo)) between 1 and 60),
  add constraint denuncias_detalle_largo check (detalle is null or length(detalle) <= 500),
  -- Cada tipo apunta a algo: sin esto se pueden guardar denuncias huérfanas.
  add constraint denuncias_objeto_coherente check (
    (tipo = 'reporte' and pet_id is not null)
    or (tipo = 'usuario' and usuario_denunciado is not null)
    or (tipo in ('mensaje','pista','avistamiento') and objeto_id is not null)
  );
```

El `unique (pet_id, reporter_user)` de la `0003:12` (una denuncia por persona por reporte) se
reemplaza por un índice único parcial equivalente por tipo, para que denunciar un reporte no
impida denunciar después un mensaje del mismo tipo.

**⚠️ Trampa en el trigger.** `check_denuncias()` (`0003:24`) cuenta
`where pet_id = new.pet_id`. Con `pet_id` nullable, una denuncia de usuario entra con
`pet_id = null` y `= null` nunca matchea, así que el conteo da 0 y no rompe nada — pero por
accidente. Se le agrega un `if new.tipo <> 'reporte' then return new; end if;` al principio,
para que sea correcto por diseño y no por casualidad.

**No se agrega auto-ocultado ni auto-suspensión de usuarios.** Tres cuentas coordinadas
echarían a cualquiera, justo cuando más necesita publicar. Las denuncias de usuario las revisa
el dueño a mano; ese es el compromiso de 24 horas.

**Se guarda `detalle` (texto libre corto).** Sin él, el dueño lee "acoso" contra un uuid y no
tiene forma de actuar sobre un mensaje que la RLS no le deja leer. ⚠️ Ese texto **lo escribe
un usuario**: si algún día se muestra en un correo, hay que escaparlo. Ya nos pasó exactamente
eso en la tanda 3 con el extracto de una pista.

**El servicio** pasa de una función a cinco, todas finitas y con el mismo tipo de motivo:
`denunciarReporte`, `denunciarUsuario`, `denunciarMensaje`, `denunciarPista`,
`denunciarAvistamiento`. Los motivos son una lista cerrada en español (contenido ofensivo,
estafa o pedido de dinero, información falsa, spam, otro), no texto libre: se agrupan y se
validan en el servidor.

**Los puntos de entrada** (los cinco):

| Dónde | Qué se denuncia |
|---|---|
| `PetDetailScreen` (ya existe) | el reporte |
| `ChatScreen`, menú de cabecera | la conversación / la otra persona |
| Burbuja de mensaje, pulsación larga | ese mensaje |
| Tarjeta de pista y de avistamiento | esa pista / ese avistamiento |
| `PersonaScreen` (pieza 1) | la persona |

Después de denunciar, además del acuse, se ofrece **bloquear en el mismo paso**. Denunciar y
bloquear son el mismo impulso; separarlos en dos viajes hace que la gente haga solo uno.

## Casos borde

- **Modo invitado.** La acción `'denunciar'` ya existe en el portero. Se reusa; se agrega el
  mensaje para denunciar personas.
- **Denunciar a una cuenta eliminada.** Se oculta la acción: no hay nada que moderar.
- **Denunciar dos veces lo mismo.** El único parcial devuelve `23505`; se traduce en
  `dbErrors.ts` a *"Ya denunciaste esto. Lo estamos revisando."* — nunca un error.
- **Denunciar un mensaje ya borrado.** No hay borrado de mensajes, así que no pasa. Si algún
  día lo hay, `objeto_id` queda apuntando a nada: es a propósito, sin FK, porque la denuncia
  debe sobrevivir a lo que denuncia.

## Verificación

Unitarios de los cinco servicios; ataque a la API insertando una denuncia con
`reporter_user` de otra persona (debe dar `42501`), con un `tipo` inventado y con un `detalle`
de 5000 caracteres (deben dar `23514`); y una prueba de que el auto-ocultado con 3 denuncias
de reporte **sigue funcionando** después de tocar el trigger.

---

# 3. Filtro proactivo de contenido al publicar

## El problema

Apple pide un método para **evitar que se publique** material objetable, no solo para
reaccionar después. Hoy todo lo que se escribe se publica tal cual, y lo único que existe es
el auto-ocultado con 3 denuncias — puramente reactivo, y lento: el contenido está arriba desde
que se publica hasta que tres personas distintas lo denuncian.

## Las opciones

| Opción | Costo | Se puede saltar con `curl` | Falsos positivos |
|---|---|---|---|
| a. Lista de palabras en el cliente | casi cero | **sí, entero** | los que uno se busque |
| b. Lista de palabras en el servidor (trigger) | bajo | no | ídem |
| c. Moderación de imágenes en una Edge Function | API paga + latencia + mantener una clave | no | altos y opacos |

## Recomendación: (b) con espejo en el cliente, y (c) NO

**Se implementa (b), y el cliente valida lo mismo antes de enviar** — exactamente la regla de
la casa que ya fijó la `0016`: *"la base repite los mismos límites que ya valida el formulario,
para que un usuario normal nunca los vea, y solo los toque quien esté escribiendo por fuera de
la app"*. La lista de palabras vive en `src/lib/palabrasProhibidas.ts` (puro, con tests) y su
gemela en la función de Postgres; el mismo patrón de dos copias sincronizadas que ya se usa
para `notifyTargets`, con un test que falla si se separan.

**(c) se descarta**, y conviene dejar dicho por qué para no rediscutirlo: es una API paga, con
una clave que mantener y una llamada de red en el camino crítico de publicar; el proyecto es
de una persona sola y sin presupuesto; y una foto mal clasificada deja a alguien sin poder
publicar a su perro perdido, sin explicación posible, porque el modelo no da una. El paquete
que Apple acepta —filtro de texto + denuncia en todas partes + bloqueo + términos +
compromiso de 24 h— se cumple sin ella. Si algún día llega abuso real por imágenes, se
reevalúa con datos.

## El falso positivo es peor que el problema

Esto manda sobre todo lo demás. Un reporte legítimo rechazado deja a alguien sin poder pedir
ayuda por su mascota, en el peor momento de su semana. Cuatro reglas, y las cuatro son
requisitos, no preferencias:

1. **La lista es corta y solo de lo inequívoco**: insultos fuertes, contenido sexual explícito
   y ataques de odio. Nada ambiguo. Ninguna palabra que pueda aparecer en una descripción
   honesta de un animal o de un barrio.
2. **Coincidencia por palabra completa**, sobre texto normalizado (minúsculas, sin tildes),
   **nunca por substring**. El problema clásico es este: una palabra prohibida contenida
   dentro de otra inocente convierte el filtro en un generador de rechazos absurdos. Va con
   test dedicado.
3. **El rechazo es reparable y lo dice.** El mensaje nombra la palabra exacta:
   *"Quita la palabra «X» para poder publicar."* El usuario la borra en cinco segundos. Un
   rechazo genérico ("contenido inapropiado") sobre un texto de 800 caracteres es una pared.
4. **No se toca la foto ni se borra el borrador.** El texto escrito queda en el formulario.

## Dónde se aplica y dónde no

**Sí:** `pets.descripcion` y `pets.nombre`, `pet_tips.texto`, `pet_updates.texto`,
`sightings.nota`. Todo eso es público y se lee sin cuenta.

**No: los mensajes del chat.** Es correspondencia privada entre dos personas. Filtrarla es
invasivo, no lo pide ninguna tienda (1.2 habla de contenido publicado), y sería inútil: el
abuso en el chat se resuelve con bloquear y denunciar, que es justo lo que agregan las piezas
1 y 2. Queda escrito acá para que nadie lo "arregle" después por las dudas.

## Verificación

Tests de la lógica pura: que la lista corta rechaza lo que debe, que **no** rechaza una
descripción normal de mascota (una batería de textos reales como control), que la palabra
prohibida dentro de otra palabra **pasa**, y que las tildes y mayúsculas no la evaden. Más un
ataque por API insertando una pista con una palabra de la lista → debe dar error de restricción.

---

# 4. Aceptación explícita de los Términos

## Qué hay exactamente hoy

Verificado, no supuesto:

- `src/screens/auth/RegisterScreen.tsx:108` tiene un párrafo pasivo, en gris chico:
  *"Al crear tu cuenta aceptas los Términos y la Política de Privacidad."* **No es una
  casilla, no se toca, y no enlaza a ninguna parte** — no hay forma de leer lo que uno acepta
  desde esa pantalla.
- `src/screens/LegalScreen.tsx` sí tiene el texto completo (privacidad + términos), colgado de
  Perfil. Es un texto decente y honesto.

Play lo pide textualmente: **aceptación explícita, no premarcada**, antes de publicar
contenido. Un párrafo informativo no lo es.

## Diseño

- **Componente nuevo `src/ui/Checkbox.tsx`** — no existe ninguno. Ionicons de línea
  (`square-outline` / `checkbox-outline`), tokens de `src/theme` (`colors.brand` marcado,
  `colors.line` sin marcar), sin emojis. **Arranca desmarcado siempre**; no se guarda estado
  previo que lo premarque.
- En `RegisterScreen`, el párrafo pasa a ser la etiqueta de la casilla, con "Términos" y
  "Política de Privacidad" como enlaces reales a `LegalScreen`. **El botón "Registrarme" queda
  deshabilitado hasta marcarla.** Deshabilitado y no "avisa al tocar": la casilla es la
  puerta, no un recordatorio.
- **Se guarda cuándo se aceptó**: columna `profiles.terminos_aceptados_en timestamptz`. Sin
  registro, "aceptó" es una afirmación sin respaldo, y es lo que hay que poder mostrar si
  alguien reclama.
- **Cuentas que ya existen** (y las que se registren mientras se despliega): hoja única antes
  de la **primera** acción de publicar, con el mismo texto y la misma casilla. No un bloqueo
  al abrir la app: eso pisaría el modo invitado y el primer segundo de uso, que es lo que la
  app hace bien.

**El modo invitado no se toca.** Mirar reportes no requiere aceptar nada, porque el invitado no
publica. La puerta está donde está el contenido generado, no en la entrada.

## Casos borde

- **Marcar, salir de la pantalla y volver:** desmarcado otra vez. Es lo correcto: la casilla
  acompaña al envío de ese formulario.
- **Registro que falla después de aceptar:** no se escribe la fecha (no hay usuario). Al
  reintentar hay que volver a marcar.
- **La columna sin migrar:** el registro **no debe fallar**. Se escribe con el mismo patrón de
  escalón que ya usan `messages.ts:123` y `tips.ts`: si la columna no existe, se sigue sin
  ella. Un usuario que no puede registrarse es infinitamente peor que un dato de auditoría
  faltante durante una hora.

## Verificación

Unitarios: el botón está deshabilitado sin marcar y habilitado al marcar; la casilla nace
desmarcada. Playwright: registrarse sin marcar es imposible, los enlaces abren el texto legal,
y la fecha queda escrita en `profiles`.

---

# 5. Página web pública de borrado de cuenta

## El problema, y la diferencia que importa

**Apple NO la exige** (le alcanza con el borrado dentro de la app, que ya está en producción y
verificado 12/12). **Google SÍ**: pide una URL **sin login**, donde cualquiera pueda pedir el
borrado **sin instalar la app**, y esa URL se declara en Play Console. Sin ella la ficha no
pasa. Es la pieza más barata de la tanda y una de las dos que bloquean sí o sí.

## Diseño

Archivos estáticos nuevos en `public/`, que Cloudflare Pages ya copia a `dist/`:
`public/borrar-cuenta.html`, y de paso `public/privacidad.html` y `public/terminos.html`
(Play también exige una **URL** de política de privacidad, no basta con tenerla dentro de la
app). HTML plano, en español, sin JavaScript, sin dependencias, con los colores del sistema de
diseño escritos a mano (no hay build para `public/`).

Contenido de `borrar-cuenta.html`:

1. **Cómo se borra desde la app**, paso a paso: Perfil → Borrar mi cuenta.
2. **Qué se borra y qué sobrevive**, con las palabras exactas de la `0017`: se borran los
   reportes con sus fotos, la zona de alerta, guardados, preferencias y tokens; sobreviven
   anonimizadas las pistas y avistamientos en reportes ajenos (firmados *"Un vecino"*) y las
   conversaciones (*"Cuenta eliminada"*). **Este texto tiene que decir la verdad**: si se
   desvía de lo que hace la función, es una declaración falsa en una tienda.
3. **Plazo:** el borrado es inmediato; queda una fila lápida sin datos personales, necesaria
   para que las conversaciones de otras personas no se rompan.
4. **Para quien ya no puede entrar** (perdió el acceso, desinstaló): escribir al correo de
   soporte desde la dirección de la cuenta, y el dueño lo procesa a mano.

**Decisión de seguridad, la clave de esta pieza: NO se pone un formulario que borre.** Un
campo de correo público que dispara un borrado es un vector de secuestro: cualquiera escribe
la dirección de otro y le borra la cuenta. Google pide una vía de solicitud, no un botón
anónimo con poder destructivo. Solicitud por correo, verificada a mano.

## Casos borde

- **`public/_redirects` tiene la regla SPA.** Cloudflare Pages sirve los archivos estáticos
  antes del fallback, así que `/borrar-cuenta.html` debería resolver — **pero hay que
  comprobarlo con `curl` contra el sitio desplegado**, no asumirlo. Si el fallback se lo come,
  la URL que se declara en Play devuelve la app y el revisor rechaza.
- **Doble fuente de verdad legal.** El texto queda en `LegalScreen.tsx` y en los HTML. No hay
  forma barata de unificarlos (uno es React Native, el otro estático sin build). Se acepta,
  con un comentario en los dos archivos apuntando al otro.
- **El correo de contacto aparece ahora en tres lugares** (pieza 6). Que sea uno solo.

## Verificación

`curl` contra producción: las tres URLs devuelven `200` y `text/html`, y **no** devuelven el
`index.html` de la app. Que las cabeceras de `_headers` se apliquen también a ellas. Y leer
el texto al lado de `0017_borrado_cuenta.sql` para confirmar, frase por frase, que no promete
nada que la función no haga.

---

# 6. Contacto de soporte visible en la app

## El problema

`src/screens/LegalScreen.tsx:10`:

```ts
const CORREO_CONTACTO = '[tu correo de contacto]';
```

Un placeholder literal, en pantalla, en producción. Eso solo ya es rechazo: las dos tiendas
exigen contacto de soporte, y Apple 1.2 lo pide explícitamente junto con el filtro, la
denuncia y el bloqueo.

## Diseño

- Una constante única, `src/lib/soporte.ts`, con la dirección real. Todo lo demás la importa.
  Una dirección **de la app**, no la personal del dueño: va a quedar publicada en dos tiendas
  y en tres páginas web.
- **Perfil → "Ayuda y contacto"**, con Ionicons `help-circle-outline`, visible **también sin
  sesión** (el Perfil de visita), abriendo el correo con `Linking.openURL('mailto:…')` con
  asunto prellenado.
- El mismo dato en `LegalScreen`, en la pantalla de denuncia ("Si es urgente, escríbenos") y
  en las tres páginas web de la pieza 5.
- En los Términos se agrega la frase que el revisor busca: **revisamos las denuncias dentro de
  las 24 horas** y podemos ocultar contenido o restringir cuentas. Es un compromiso real, no
  una fórmula: hay que poder cumplirlo.

## Casos borde

Sin cliente de correo configurado, `mailto:` no abre nada y `openURL` puede rechazar. La
dirección se muestra **como texto seleccionable** además del botón, para que siempre haya una
salida.

---

# 7. Permisos en `app.config.ts`

## Qué falta y por qué importa cada uno

Estado actual: `app.config.ts:11` declara `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` y
`CAMERA`; `:19-22` declara dos textos de iOS.

1. **Falta `POST_NOTIFICATIONS`.** Sin ese permiso **no llega ningún push en Android 13+**.
   Todo el trabajo de la tanda 3 y la Edge Function `send-push` desplegada quedan mudos en
   cualquier teléfono moderno. No es un requisito de tienda: es un bug latente que solo
   aparecería en el build nativo, que todavía no existe.
   ⚠️ Declararlo **no alcanza**: en Android 13+ hay que pedirlo en tiempo de ejecución. Hay
   que verificar que `src/services/pushTokens.ts` llame a `requestPermissionsAsync`, y pedirlo
   **cuando el usuario activa un aviso** en la pantalla de Avisos, no al abrir la app: un
   permiso pedido en frío se rechaza y en Android no se vuelve a preguntar.
2. **Falta `NSPhotoLibraryUsageDescription`.** La app elige fotos de la galería. En iOS, una
   app que accede a la galería sin la clave de descripción **no se rechaza: se cae**, en el
   momento exacto en que el revisor toca "elegir foto".
3. **Falta bloquear `ACCESS_BACKGROUND_LOCATION`.** Ninguna función lo necesita, pero una
   dependencia transitiva lo puede colar en el manifiesto fusionado. Si aparece, Google exige
   formulario de declaración, video demostrativo y una revisión que tarda semanas. Se cierra
   con una línea:
   ```ts
   android: {
     blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
   }
   ```
   Es puramente defensivo y cuesta nada. Vale también revisar el manifiesto fusionado del
   primer build por si hay otros polizones.
4. **Los textos actuales son genéricos** — *"Usamos la cámara para tomar fotos de la
   mascota."* Apple rechaza los genéricos. La fórmula que pasa:
   **qué se accede + para qué función concreta + qué gana el usuario.**

Textos propuestos (español, en el tono de la app):

- **Ubicación:** *"Usamos tu ubicación para centrar el mapa donde estás y mostrarte las
  mascotas perdidas de tu barrio, y para marcar el punto donde perdiste o viste a una mascota.
  Nunca publicamos tu ubicación exacta: el punto se desplaza unos 250 metros antes de
  guardarse."* — La última frase es verdad desde la tanda A (`src/lib/difuminarUbicacion.ts`).
  Decirlo acá no es marketing: es lo que convence al revisor de que la ubicación está pensada,
  y lo que hace que el usuario acepte.
- **Cámara:** *"Usamos la cámara para que tomes una foto de la mascota en el momento y la
  adjuntes a tu reporte o a un avistamiento. La foto es lo que hace que un vecino la reconozca
  en la calle."*
- **Galería:** *"Accedemos a tus fotos solo para que elijas las imágenes que quieres adjuntar
  a un reporte, a un avistamiento o a tu foto de perfil. Solo usamos las que tú seleccionas."*

## Casos borde

- **Ninguno de estos cambios se puede probar en web.** Toda la pieza 7 vive en el build
  nativo, que no existe todavía. Se verifica leyendo el manifiesto y el `Info.plist`
  generados por `npx expo prebuild`, sin llegar a compilar.
- **Adyacente, ya anotado en `ESTADO.md`:** el config plugin de `expo-sharing` no está
  registrado en `plugins`. No afecta a la web. Si se toca este archivo, es el momento de
  mirarlo.
- Si el afiche llegara a guardarse en el carrete en nativo, haría falta
  `NSPhotoLibraryAddUsageDescription`. Hoy usa `expo-sharing`, así que no. Verificar antes del
  primer build.

---

# Orden sugerido de implementación

De menor a mayor riesgo, dejando para el final lo que toca políticas (la lección de la tanda A:
lo que toca permisos se despliega con coreografía).

1. **Pieza 7** (`app.config.ts`) — aislada, no toca `src/`, cero riesgo.
2. **Pieza 6** (soporte) — es una constante y una fila de menú. Desbloquea el texto de las
   piezas 4 y 5.
3. **Pieza 5** (web de borrado) — archivos estáticos, independiente de todo.
4. **Pieza 4** (términos) — un componente nuevo y una pantalla.
5. **Pieza 3** (filtro) — lógica pura + trigger; el riesgo es de falsos positivos, no de
   arquitectura.
6. **Pieza 2** (denuncias) — migración que toca una tabla viva y su trigger.
7. **Pieza 1** (bloqueo) — la más grande y la única que reescribe una política de RLS
   existente (`messages`). Va última, con todo lo demás en verde.

**Despliegue.** La pieza 1 cambia la política de insert de `messages`: si se aplica la
migración con la app vieja arriba, un usuario legítimo que escriba a alguien que lo bloqueó
recibe jerga de Postgres en pantalla, porque la traducción de `dbErrors.ts` todavía no está.
No rompe nada, pero se ve feo: **web primero, migración después**, igual que la `0018`.

**Peso estimado.** La pieza 1 es aproximadamente la mitad del trabajo de la tanda ella sola
(migración + provider + pantalla nueva + cinco puntos de UI + filtrado en dos capas + los
avisos). Las piezas 5, 6 y 7 juntas son una tarde corta. Las piezas 2, 3 y 4 están en el medio.

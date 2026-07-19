# Borrar mi cuenta — diseño

**Fecha:** 2026-07-19
**Estado:** aprobado, listo para plan de implementación

## Por qué

Hoy la app no tiene ninguna forma de borrar una cuenta. Eso importa por tres razones, en orden de urgencia:

1. **Bloquea la publicación.** Apple exige que toda app que permita crear una cuenta permita borrarla desde adentro (App Store Review Guideline 5.1.1(v)); Google Play tiene un requisito equivalente. Sin esto la app no se puede publicar, así que no es una mejora: es un bloqueante.
2. **Ley 21.719 (Chile)**, que entra en vigencia en **diciembre de 2026**, reconoce el derecho de supresión con multas reales. La app es chilena y guarda datos sensibles.
3. **Lo que guardamos es delicado.** `alert_zones` es, en la práctica, la dirección de la casa de la persona; `profiles` guarda teléfono y red social, y hoy son **legibles por cualquier usuario logueado**.

El resultado buscado: una persona puede irse de la app y destruir sus datos personales de forma irreversible, **sin destruir de paso información que ya no es solo suya** — la pista que dejó en el reporte de un vecino, los mensajes que otro escribió en una conversación.

## La tensión que hubo que resolver

El pedido original fue "soft delete + anonimización irreversible", que a primera vista se contradicen: *soft delete* suele significar reversible.

Se resuelve separando los dos planos:

- **Soft delete aplica a las FILAS**: se conservan para no romper el contenido de terceros ni la integridad referencial.
- **Anonimización aplica a los DATOS**: se destruyen en el momento, sin período de gracia.

No hay recuperación. Quien se arrepiente se hace una cuenta nueva.

## Principio que ordena todo

> Lo que es solo tuyo se destruye. Lo que además es de otro sobrevive sin vos.

## Qué le pasa a cada dato

### Se borra de verdad (la fila desaparece)

| Dato | Motivo |
|---|---|
| `pets` (sus reportes) | Un reporte sin dueño es un fantasma: nadie puede contactarlo ni cerrar el caso. Decisión explícita del producto |
| `alert_zones` | Es literalmente dónde vive la persona. El dato más sensible de la base |
| `favorites` | Puramente personal, sin valor para terceros |
| `notification_prefs` | Ídem |
| `push_tokens` | Identifican dispositivos |
| `notification_events` con `actor_id` suyo | El jsonb `datos` guarda `lat`/`lng` y extractos de texto |
| Fotos en Storage | Su avatar + las fotos de los reportes borrados |

**Efecto en cascada que hay que tener presente:** `sightings`, `pet_tips` y `pet_updates` tienen FK a `pets(id) on delete cascade`. Por lo tanto, borrar los reportes de la persona **también borra las pistas y avistamientos que otros dejaron en esos reportes**. Es consecuencia directa de que el reporte se vaya de verdad, y es aceptado.

### Sobrevive, anonimizado (apunta a la lápida)

| Dato | Motivo | Cómo se muestra |
|---|---|---|
| `sightings` en reportes ajenos | El avistamiento es información de la dueña del gato, no de quien lo escribió | Sin autor visible (hoy ya es así) |
| `pet_tips` en reportes ajenos | Ídem | `"Un vecino"` |
| `messages` (ambas direcciones) | La otra persona participó de esa conversación y puede contener datos útiles | `"Cuenta eliminada"`, hilo cerrado |
| `denuncias` (`reporter_user`) | Las necesita moderación; ya no identifican a nadie | No se muestra |

### La lápida (`profiles`)

La fila sobrevive con:

```
nombre       = 'Cuenta eliminada'   -- no puede quedar vacío: CHECK profiles_nombre_largo exige length(btrim(nombre)) >= 1
foto_perfil  = null
telefono     = null
red_social   = null
eliminado_en = now()
```

**Por qué esto es anonimización real y no un `activo = false`:** lo que queda es un UUID al azar. La fila de `auth.users` —que guarda el correo, el único dato que conecta ese UUID con una persona— **se destruye**. Sin ella nadie puede revertir la asociación, ni siquiera con acceso total a la base. Además, borrar el usuario de Auth **libera el correo**, así que esa persona puede volver a registrarse más adelante (con un UUID nuevo, sin relación con el anterior).

## Cambios en la base — migración `0017_borrado_cuenta.sql`

1. **Soltar la FK `profiles.id → auth.users(id)`.**
   Es el cambio que habilita todo lo demás: mientras exista con `on delete cascade`, borrar el usuario de Auth arrastra el perfil y, en cascada, cada mensaje, pista y avistamiento de esa persona. `profiles.id` queda como PK uuid común.

2. **Columna `profiles.eliminado_en timestamptz null`.**
   Es la marca de la que depende toda la UI. Se usa en vez del texto del nombre porque el nombre se muestra distinto según el contexto.

3. **RPC `public.anonimizar_mi_cuenta()` `SECURITY DEFINER`.**

   **Sin parámetros, a propósito.** Saca la identidad de `auth.uid()`, nunca de un argumento. Esta es la decisión de seguridad más importante del diseño: una RPC `anonimizar_cuenta(user_id uuid)` con `SECURITY DEFINER` le permitiría a cualquier usuario borrarle la cuenta a cualquier otro. La firma sin parámetros hace que ese ataque sea imposible de expresar.

   Debe además:
   - Fijar `search_path` explícito (`set search_path = public, pg_temp`), práctica estándar para `SECURITY DEFINER`.
   - Ser **idempotente**: si el perfil ya tiene `eliminado_en`, retorna sin hacer nada.
   - Fallar si `auth.uid()` es null (llamada sin sesión).
   - Correr todo en una transacción (lo es por defecto dentro de una función).

   Y una segunda RPC `public.mis_fotos_a_borrar()`, también `SECURITY DEFINER` y sin parámetros, **de solo lectura**, que devuelve las rutas de Storage del usuario (filtradas a `^<uid>/[^/]+$`). Va aparte por el motivo explicado más abajo.

4. **RLS en `messages`: prohibir insertar mensajes hacia una cuenta eliminada.**
   Que la UI esconda el campo de texto no alcanza: con el token en la mano se puede insertar igual por la API. La política de INSERT debe exigir que el `to_user` no tenga `eliminado_en`.

## Edge Function `delete-account`

### Orden de ejecución (el orden es el diseño)

1. Verificar el JWT del llamador y obtener su `id`. Sin sesión → 401.
2. Invocar `mis_fotos_a_borrar()` (**solo lectura**) con el token del usuario (cliente "anon + JWT"), no con `service_role`, para que `auth.uid()` adentro resuelva a la persona correcta. Mismo patrón que ya usa `send-push`.
3. Borrar esos objetos de Storage.
4. Invocar `anonimizar_mi_cuenta()`, también con el token del usuario.
5. **Último de todo:** `auth.admin.deleteUser(id)` con `service_role`.

El paso 5 va al final porque borrar el usuario invalida su token: si fuera primero, no se podría completar nada de lo anterior.

**Por qué la consulta de fotos va separada y antes de la anonimización** (esto se descubrió en revisión, corrigiendo un diseño anterior en el que la RPC de anonimización devolvía las rutas): la anonimización es idempotente, así que si las rutas vinieran de ella y fallara el borrado de Storage, el reintento la encontraría en su camino corto, recibiría una lista vacía, y **las fotos quedarían para siempre en un bucket público mientras la función responde "listo"**. Separadas, un fallo antes del paso 4 no deja rastro y el reintento arranca limpio.

**Lo que se paga a cambio (riesgo aceptado):** como las fotos se borran antes de anonimizar, si falla el paso 4 la persona queda con la cuenta viva y sus reportes con las imágenes rotas. Es feo pero visible y se corrige reintentando; el estado que evitamos era peor y silencioso.

**Las rutas de Storage se filtran por `<user_id>/` en dos capas** (en la RPC y en la Edge Function), exigiendo además un único segmento. No es paranoia: `pets.fotos` y `profiles.foto_perfil` son texto que escribe el usuario y la base solo les valida el largo, así que sin ese filtro alguien podría guardar en su propio reporte la ruta de la foto de otra persona y, al borrarse la cuenta, hacer que la función —que corre con `service_role` y se saltea la RLS de Storage— se la borre.

### Errores y fallas parciales

- Si falla el paso 3 o 4, la función **devuelve error, no éxito**. Los datos personales ya están destruidos (lo importante ya ocurrió), pero reportar "listo" con el usuario de Auth todavía vivo dejaría a la persona pudiendo entrar a una cuenta lápida. Reintentar completa el resto gracias a la idempotencia de la RPC.
- Las fotos huérfanas siempre son recuperables: la ruta empieza con `<user_id>/`, así que se pueden barrer por prefijo aunque se pierda la lista.
- Reusa `supabase/functions/_shared/cors.ts`: preflight `OPTIONS` contestado antes de tocar la base, y todo lo que no sea `POST` responde 405.

## Interfaz

**`DeleteAccountScreen`** — pantalla propia, con entrada en Perfil debajo de *Cerrar sesión*. No un botón suelto: al ser irreversible, la pantalla muestra dos listas explícitas —**qué se borra** y **qué queda**— antes de cualquier botón. Incluye que sus pistas siguen ayudando a otros vecinos, firmadas *"Un vecino"*: es información que cambia la decisión y hace que quedarse tranquilo sea razonable.

Recién después, el botón rojo con el `confirmAction` que ya existe en `src/lib/notify.ts`. Al terminar: `signOut` y volver a Inicio, que funciona en modo invitado.

**Resto de la app:**

| Dónde | Cambio |
|---|---|
| `ConversationsScreen` | El hilo muestra *"Cuenta eliminada"* en vez del fallback `'Usuario'` |
| `ChatScreen` | Desaparece el campo de escribir si la otra parte tiene `eliminado_en` |
| `src/lib/tips.ts` | `firmaAutor` devuelve *"Un vecino"* cuando el autor está eliminado |
| `src/services/tips.ts` | El select pasa a `profiles(nombre, eliminado_en)` |

## Pruebas

Tres capas, porque ninguna sola alcanza:

**1. Jest (lógica pura)**
- Qué rutas de Storage hay que borrar, dadas las filas de perfil y reportes.
- Los nombres que muestra cada pantalla: `firmaAutor` con autor eliminado, el resolvedor de nombre en conversaciones.

**2. Contra la base real, con dos cuentas descartables**
La capa que más importa, porque nada de lo anterior prueba la seguridad:
- **Con el token de la cuenta A, intentar borrar la cuenta B** → debe ser imposible (la RPC no acepta destinatario).
- Con un token real, intentar insertar un mensaje hacia una cuenta eliminada → RLS debe rechazar con `42501`.
- Verificar que un `select` sobre `profiles` de una cuenta eliminada no devuelve teléfono ni red social.

Es el mismo método de la tanda 4: atacar la API con un token de sesión real sacado del `localStorage`, en vez de confiar en el formulario.

**3. Playwright, punta a punta**
Cuenta descartable que publica un reporte, deja una pista en el reporte de otra cuenta, chatea, y se borra. Verificar las cinco cosas:
1. Su reporte desapareció.
2. La pista en el reporte ajeno **sobrevive**, firmada *"Un vecino"*.
3. El hilo del otro dice *"Cuenta eliminada"* y no deja escribir.
4. El login viejo ya no entra.
5. **El mismo correo puede registrarse de nuevo** — la prueba de que `auth.users` se borró en serio.

Dejar la base limpia al terminar, como en las tandas anteriores.

## Archivos

| Archivo | Qué |
|---|---|
| `supabase/migrations/0017_borrado_cuenta.sql` | nuevo |
| `supabase/functions/delete-account/index.ts` | nuevo |
| `src/services/account.ts` | nuevo — llama a la Edge Function |
| `src/screens/DeleteAccountScreen.tsx` | nuevo |
| `src/screens/ProfileScreen.tsx` | entrada a la pantalla nueva |
| `src/screens/ConversationsScreen.tsx` | *"Cuenta eliminada"* |
| `src/screens/ChatScreen.tsx` | ocultar el composer |
| `src/lib/tips.ts`, `src/services/tips.ts` | firma *"Un vecino"* |
| navigator | registrar la pantalla |

## Fuera de alcance (anotado, no se hace acá)

- **`profiles` es legible entera por cualquier usuario logueado**, teléfono y red social incluidos (`0001_init.sql`: `for select to authenticated using (true)`). Es un problema de privacidad real y **anterior** a este trabajo; no lo arregla el borrado de cuenta. Merece su propia tanda: probablemente una vista o column-level security que exponga solo `id` y `nombre`.
- Exportar los datos antes de borrarlos (derecho de portabilidad). La Ley 21.719 también lo contempla.

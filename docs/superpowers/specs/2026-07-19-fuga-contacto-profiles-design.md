# Cerrar la fuga de datos de contacto en `profiles`

Fecha: 2026-07-19 · Estado: aprobado, listo para plan

## El problema

La política de lectura de `public.profiles` es, desde `0001_init.sql:10`:

```sql
create policy "perfiles visibles para autenticados"
  on public.profiles for select to authenticated using (true);
```

Cualquier persona que se registre puede leer **el teléfono y la red social de todos los
usuarios**. Comprobado el 19-jul-2026 leyendo los datos reales de Pablo
(`+56959987786`, `@77.pvblo`) desde una cuenta descartable creada en el momento.

Dos agravantes que definen la urgencia:

1. **Nadie sabe que lo está publicando.** El formulario (`ProfileScreen.tsx:264`) dice
   solo "Teléfono / WhatsApp" y "Red social", sin una palabra sobre quién lo ve. Como el
   dato hoy solo aparece en la pantalla de Perfil propia y en el afiche que uno mismo
   genera, la expectativa razonable del usuario es que sea privado.
2. **Es descargable en masa.** La anon key de Supabase es pública por diseño (viaja en el
   sitio web). Con una cuenta gratis y un `curl` se baja la tabla entera: nombre +
   teléfono + red social de todos. En una app de mascotas perdidas eso es material
   directo para la estafa del "tengo a tu mascota, transfiere la recompensa", con la
   víctima ya identificada y en estado vulnerable.

## Alcance

**Dentro:** cerrar la lectura de `telefono` y `red_social` a todo el mundo salvo su dueño.

**Fuera (decidido explícitamente):** un botón "Contactar por WhatsApp" en el detalle del
reporte. El contacto entre vecinos ya tiene dos caminos —el chat interno y el afiche con
QR que el dueño genera y comparte—; una tercera vía no la pidió nadie. YAGNI.

**Fuera:** auditar las demás tablas. Se hará aparte si corresponde.

## Hallazgo previo que hace barato el cambio

El teléfono y la red social **no se muestran hoy en ninguna parte de la UI salvo el perfil
propio**. Verificado:

| Consumidor | Qué pide | ¿Cambia? |
|---|---|---|
| `services/profile.ts:13` `getMyProfile` | `select('*')` — **siempre con `user.id`** | Sí |
| `services/messages.ts:110` | `id, nombre, eliminado_en` | No |
| `services/tips.ts:24` (embed) | `profiles(nombre, eliminado_en)` | No |
| `screens/ChatScreen.tsx:54` | `eliminado_en` | No |
| Edge Functions | ninguna lee `profiles` | No |

`getMyProfile` se llama en exactamente dos lugares, ambos con el id propio:
`ProfileScreen.tsx:40` y `PetDetailScreen.tsx:310` (para el WhatsApp del afiche).

## Enfoque elegido: permiso por columna

Se descartaron:

- **Vista `perfiles_publicos`** + cerrar `profiles` a `id = auth.uid()`. El embed de
  `tips.ts` depende de que PostgREST sepa relacionar una vista con `pet_tips`, y eso puede
  fallar recién en producción. Ya nos mordieron tres bugs que solo existían allí.
- **Tabla aparte `profile_contacts`.** Más ordenado a largo plazo, pero migra datos y toca
  más código para el mismo resultado de seguridad. Se reevalúa si el contacto crece.

## Diseño

### Migración `0018_contacto_privado.sql`

La política **de filas no cambia**: `nombre` y `foto_perfil` siguen siendo públicos a
propósito (firman las pistas, aparecen en los chats, sostienen el modo invitado). Lo que
cambia es el permiso a nivel de columna:

```sql
revoke select on public.profiles from anon, authenticated;
grant  select (id, nombre, foto_perfil, creado_en, eliminado_en)
       on public.profiles to anon, authenticated;
```

`update` no se toca, así que editar el perfil propio sigue funcionando. `id` queda
legible, que es lo que necesitan el `where` de los updates y la propia RLS.

A partir de aquí `telefono` y `red_social` **no son legibles por nadie vía API**, ni
siquiera por su dueño. Eso es deliberado: no hay condición que burlar, la columna
simplemente no se puede pedir.

El dueño los recupera con una función con la misma forma que la ya verificada
`anonimizar_mi_cuenta()`:

```sql
create function public.mi_perfil()
returns table (id uuid, nombre text, foto_perfil text,
               telefono text, red_social text, creado_en timestamptz)
language sql security definer set search_path = public stable
as $$ select id, nombre, foto_perfil, telefono, red_social, creado_en
     from public.profiles where id = auth.uid() $$;

revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;
```

**Sin parámetros.** Esa es la propiedad de seguridad central: no existe una firma que
permita pedir la fila de otra persona. Es la misma técnica que el 19-jul devolvió
`PGRST202` a un intento de pasar `user_id`.

### App

Solo cambia `src/services/profile.ts`:

- `getMyProfile()` pasa a `supabase.rpc('mi_perfil')` y **pierde el parámetro `userId`**
  — no puede recibirlo, el servidor decide de quién es la fila. Se actualizan los dos
  llamadores. Sigue devolviendo `Profile | null`.
- `updateMyProfile` queda igual.
- Desaparece el `select('*')`, que es justo lo que rompe con permisos por columna.

### Aviso al usuario (pequeño, pero es el punto 1 del problema)

En `ProfileScreen`, bajo los campos de contacto, una línea que diga que esos datos son
privados y solo se usan para el afiche que uno genera. Cierra la brecha entre lo que la
app hace y lo que la persona cree que hace.

## Errores y casos borde

- **Migración aplicada y app vieja desplegada:** `select('*')` falla entero (PostgREST no
  devuelve datos parciales) y el usuario ve su perfil vacío. Por eso el orden de
  despliegue es obligatorio (abajo).
- **App nueva y migración sin aplicar:** `rpc('mi_perfil')` devuelve `PGRST202`. Se
  maneja con el mismo patrón de escalón que ya usan `messages.ts` y `tips.ts`: si la RPC
  no existe, caer al `select('*')` de siempre. El escalón queda muerto tras aplicar la
  migración y se puede borrar después.
- **Cuenta anonimizada** (`eliminado_en` no nulo): `mi_perfil()` devuelve la lápida con
  los contactos ya en `null`. Correcto, no requiere trato especial.
- **Sin sesión:** `auth.uid()` es null → cero filas, y además el `execute` no está
  concedido a `anon`.

## Verificación

Tres niveles, porque los unitarios solos no ven esta clase de bug (lección de la tanda 4):

1. **Unitarios** de `profile.ts` contra el nuevo `rpc`, incluido el escalón de respaldo.
2. **Ataque a la API real**, con un token de sesión de una cuenta descartable sacado del
   `localStorage`, saltándose la app:
   - pedir `telefono`/`red_social` de otro usuario → `42501`
   - pedir `select=*` sobre `profiles` → falla
   - pedir `id, nombre, eliminado_en` → **sigue funcionando** (control de no-regresión del
     chat y las pistas)
   - `mi_perfil()` sin sesión → `42501`
   - `mi_perfil()` con sesión → solo la fila propia
3. **Playwright** contra el sitio: el Perfil propio muestra y edita el teléfono, y el
   afiche sigue trayendo el WhatsApp.

## Despliegue — el orden importa

1. `npm test` + `npx tsc --noEmit` en verde.
2. **Desplegar la web** (`npx expo export --platform web` → Cloudflare Pages).
3. **Después** aplicar la migración `0018`.
4. Correr la verificación de nivel 2 y 3 contra producción.

Invertir 2 y 3 deja a todos los usuarios sin su perfil hasta que suba la web.

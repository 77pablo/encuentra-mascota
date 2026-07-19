# Tanda A — Privacidad y seguridad de datos

Fecha: 2026-07-19 · Estado: aprobado, listo para plan

Seis piezas que comparten un mismo tema: **dejar de exponer datos que no hace falta
exponer**. La primera (`profiles`) se diseñó por sí sola; las otras cinco salieron de la
investigación legal del 19-jul (ver memoria `app-encuentra-mascota-legal`).

1. Cerrar la fuga de contacto en `profiles` ← el diseño original, abajo
2. Desplazar las coordenadas públicas de los reportes
3. Confirmar que las fotos no llevan EXIF
4. Rutas de fotos no adivinables en el bucket público
5. Aviso al pedir el teléfono
6. Advertencia antiestafa

---

# 1. Cerrar la fuga de datos de contacto en `profiles`

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

---

# 2. Desplazar las coordenadas públicas

## El problema

`PublishScreen.tsx:75` toma la coordenada del GPS y la guarda tal cual (el usuario puede
arrastrar el pin, pero el punto por defecto es donde está parado). Los reportes son
públicos y se ven **sin cuenta**, así que la app publica en un mapa abierto la cuadra
donde vive quien reporta. Eso habilita acoso, robo por descarte de casa vacía y estafa
dirigida.

La ley chilena **no** clasifica la geolocalización como dato sensible (el catálogo del
art. 2 de la 21.719 es cerrado y no la incluye), así que esto no es cumplimiento
normativo: es riesgo real de seguridad física de los usuarios.

## Diseño

**Se guarda solo la coordenada desplazada. La precisa no se guarda.**

Es la decisión más importante de esta pieza. Guardar la precisa "por si acaso" con acceso
restringido significa mantener para siempre un dato peligroso que ninguna función usa:
el dueño ya sabe dónde perdió a su mascota, y para buscarla un error de 300 m es
irrelevante. Lo que no se guarda no se puede filtrar.

Nuevo `src/lib/difuminarUbicacion.ts`, puro y testeable:

- Desplazamiento **aleatorio**, no redondeo. El redondeo es reversible: con varios
  reportes de la misma persona se recupera el punto real por intersección. Un
  desplazamiento aleatorio independiente por reporte, no.
- Ángulo uniforme en [0, 2π) y radio ~250 m con distribución uniforme **en área**
  (`r = R·√u`), para que el punto no se concentre en el centro.
- Se aplica **una sola vez, al publicar**, antes de escribir en la base. Así el pin queda
  fijo: no puede saltar entre renders ni entre dispositivos, y no hay forma de promediar
  varias lecturas para recuperar el original.
- Corrección de longitud por latitud (`cos(lat)`), o el desplazamiento real se achica
  hacia el sur de Chile.

Se aplica igual si el usuario arrastró el pin a mano: sigue siendo, casi siempre, su casa.

**Los avistamientos (`sightings`) reciben el mismo trato** — un avistamiento es la
ubicación de quien lo reporta, con el mismo problema.

## Consecuencias que hay que aceptar

- La búsqueda por distancia (`buscar_reportes`, PostGIS) sigue funcionando: el error es
  de ~250 m sobre radios de kilómetros.
- El rastro de avistamientos mostrará distancias con ese margen. Aceptable.
- **No hay migración de datos**: la base de producción está limpia (se dejó así tras las
  pruebas del 19-jul). Los reportes nuevos nacen desplazados.

## Verificación

Tests del módulo puro: que el punto devuelto esté siempre dentro del radio, que **nunca**
sea igual al de entrada, que dos llamadas con la misma entrada den puntos distintos, y
que la distribución no se concentre en el centro. Más una prueba en el navegador de que
publicar sigue funcionando y el pin cae cerca pero no encima.

---

# 3. Confirmar que las fotos no llevan EXIF

Una foto tomada con el celular en casa lleva las coordenadas GPS embebidas en los
metadatos. Con el bucket público, cualquiera las lee — y sería una fuga de ubicación
mucho más precisa que la del punto 2, que quedaría inutilizado.

**Probablemente ya estamos limpios por accidente:** `services/storage.ts:6` pasa toda foto
por `ImageManipulator.manipulateAsync` (resize a 1080 + recompresión JPEG), que
re-codifica el archivo sin copiar los metadatos.

**Esto es una verificación, no una implementación.** Se confirma subiendo una foto real
con GPS y leyendo los metadatos del archivo que quedó en el bucket. Solo si aparece EXIF
se escribe código. No se da por hecho: es exactamente la clase de suposición que ya nos
costó tres bugs de producción.

---

# 4. Rutas de fotos no adivinables

`storage.ts:14` arma la ruta como `${userId}/${Date.now()}.jpg`. En un bucket público eso
es **adivinable**: conocido el `userId` (que viaja en cualquier reporte) y aproximado el
minuto de publicación, el espacio de búsqueda es de unos pocos miles de intentos por foto.
Permite encontrar fotos de reportes ya borrados o nunca publicados.

**Cambio:** `${userId}/${uuid}.jpg`.

⚠️ **Restricción que hay que respetar sí o sí:** el prefijo `userId/` **debe conservarse**.
La RPC `mis_fotos_a_borrar()` y la Edge Function `delete-account` filtran las rutas con
`^<uid>/[^/]+$` — es lo que impide que alguien haga borrar la foto de otra persona
(fue uno de los tres Critical de la tanda de borrado de cuenta). Cambiar la forma de la
ruta rompería esa defensa en silencio. El test de esa regex debe seguir verde.

No hay migración: las fotos viejas siguen siendo válidas, solo las nuevas nacen con UUID.

---

# 5. Aviso al pedir el teléfono

Hoy el formulario (`ProfileScreen.tsx:264`) dice solo "Teléfono / WhatsApp", sin decir
quién lo ve. Con la pieza 1 aplicada la respuesta pasa a ser "solo tú", y conviene
decirlo: es información que tranquiliza y que además cumple el deber de informar en el
punto de captura.

Texto bajo los campos de contacto, algo como: *"Solo tú ves estos datos. Los usamos para
armar el afiche de tu mascota, que tú decides compartir."*

Debe ser **verdad después de la pieza 1** — si alguna vez el teléfono vuelve a mostrarse a
terceros, este texto pasa a ser mentira y hay que cambiarlo en el mismo commit.

---

# 6. Advertencia antiestafa

El timo "tengo a tu mascota, transfiere la recompensa" está documentado y activo en Chile.
Jurídicamente la comete el usuario, no la plataforma; la exposición nuestra es por
**negligencia si no advertimos ni moderamos**. Es la mitigación de mejor relación
costo/beneficio de toda la tanda: es texto.

Dos lugares:

1. **En el chat**, una línea persistente y discreta en la cabecera de la conversación.
2. **Junto al monto**, cuando un reporte publica recompensa — tanto al escribirla como al
   verla.

Contenido: nunca transferir dinero antes de ver a la mascota en persona; nadie honesto
pide pago por adelantado; y que la app **no procesa, no garantiza ni media** en el pago.
Esa última frase es también la que nos separa de una discusión de pagos con las tiendas.

Sin componente nuevo si alcanza con los de `src/ui`. Es la pieza más barata y la que más
daño evita.

---

# Orden sugerido de implementación

Las seis son independientes salvo por el despliegue. `profiles` (1) es la que tiene
restricción de orden (app antes que migración); las otras cinco no tocan permisos y
pueden ir en cualquier momento. Sugerido: 6 → 5 → 4 → 3 → 2 → 1, de menor a mayor riesgo,
dejando la que necesita coreografía de despliegue para el final, ya con todo lo demás
verde.

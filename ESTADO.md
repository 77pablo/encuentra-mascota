# Estado del proyecto — Encuentra tu Mascota

Última sesión: 2026-07-19 (**borrar mi cuenta** en producción y verificado end-to-end; las 3 Edge Functions desplegadas; migración `0017` aplicada) · Rama de trabajo: `feat/mvp-encuentra-mascota`. El repo no tiene remoto en GitHub todavía. ✅ **`master` ya tiene TODO fusionado** (merge local `--no-ff`; ambas ramas idénticas en `a657fe7`), incluidas las 3 funciones nuevas de esta sesión (alertas por zona, visto por acá, reencuentro).

## 🌐 EN PRODUCCIÓN (desde 2026-07-18)
- **Web:** https://encuentras-mascota.pages.dev — **Cloudflare Pages**, proyecto `encuentras-mascota`, por subida directa (drag-and-drop de la carpeta `dist`). Netlify quedó descartado por límite de la cuenta.
  - **Para actualizarla:** `npx expo export --platform web` → en Cloudflare, proyecto → **Deployments → Create new deployment** → rama de producción (`main`) → arrastrar `dist`. Misma URL. Si algo sale mal, hay **Rollback** por implementación.
  - `public/_redirects` (ruteo SPA: sin él `/mascota/<id>` daría 404 y se rompen links compartidos, QR del afiche y botones de los correos) y `public/_headers` (5 cabeceras de seguridad, verificadas en el sitio; **CSP a propósito NO**, hay que probarla contra el sitio desplegado para no romper Supabase en silencio).
- **Edge Function `send-notifications`: DESPLEGADA y probada.** Verificado end-to-end: publicar un reporte encoló el evento y la función lo procesó (`{"ok":true,"procesados":1,"fallidos":0}`); la segunda corrida devolvió `0`, o sea que marca `enviado` y no reprocesa. Secretos cargados: `RESEND_API_KEY`, `RESEND_FROM=onboarding@resend.dev`, `EXPO_PUBLIC_WEB_URL`. Agendada con `pg_cron` cada minuto (SQL en `docs/` del scratchpad; ver abajo).
- ⚠️ **Lo único sin probar de toda la cadena: que el correo LLEGUE.** Resend sigue en modo prueba (solo entrega a `pdanielespinozavega@gmail.com`), y esa dirección tiene cuenta en la app pero no sabemos su contraseña, así que no se pudo armar el escenario. Falta **verificar un dominio en Resend** y cambiar el remitente.

### Bugs de producción encontrados al desplegar (los tres arreglados)
1. **La app compilada no arrancaba:** `env.ts` le pasaba `process.env` entero a `validateEnv`. Metro solo inlinea las variables si se nombran literalmente (`process.env.EXPO_PUBLIC_X`), así que en el sitio compilado llegaban vacías y moría con "Faltan variables de entorno". **En dev nunca se veía** (el servidor de Metro sí inyecta `process.env`): era un bug que solo existía en producción.
2. **Jerga de Postgres en pantalla:** abrir el QR de un afiche cuya mascota ya volvió a casa mostraba "Cannot coerce the result to a single JSON object". `getPet` ahora usa `maybeSingle` y dice que el reporte ya no está disponible.
3. **Errores de auth en inglés:** salía "User already registered". Nuevo `src/lib/authErrors.ts` (+10 tests) conectado en las 4 pantallas de auth; **nunca** se filtra el texto original (si no se reconoce, mensaje genérico en español).

## 🏗️ Escala y seguridad (jul-18, tanda 4)
- **Búsqueda en el servidor (migs `0014` + `0015`)** — antes la app se traía TODOS los reportes activos al teléfono y filtraba en memoria: con 200 anda, con 50.000 se congela. Ahora Postgres hace el trabajo:
  - **PostGIS** con columna geográfica generada + índice **GIST**; índice de trigramas para el texto (`pelu` encuentra `Pelusa`); índice parcial para el orden por defecto.
  - `buscar_reportes(...)` (filtros + orden + **paginación por cursor**) y `buscar_coincidencias(...)`. `SECURITY INVOKER`, así la RLS se sigue aplicando.
  - Cliente: `services/busqueda.ts` + hook `useBusquedaReportes` (descarta respuestas tardías, no pide dos veces la misma página, deduplica por id). Lista con **scroll infinito** y búsqueda diferida 400 ms; Inicio pide 6; Mapa tope 100 pines.
  - Se **borraron** `matches.ts` y el filtrado en memoria de `petFilters.ts`: ya no se usan y no queremos dos fuentes de verdad.
  - ⚠️ **Dos bugs que solo aparecieron con datos reales** (por eso se cargaron 60 reportes de prueba): el cursor de distancia era un `double` y con punto flotante **repetía** la fila del borde; y el desempate por `id` iba en dirección contraria a la comparación del cursor, lo que además **saltea** filas en silencio. Arreglados en `0015` (redondeo a numeric + direcciones alineadas).
- **Validación en el servidor (mig `0016`)** — los límites los ponía SOLO el formulario, y la API de Supabase es pública: con la anon key y `curl` se podía guardar una descripción de 5 MB o una latitud de 9.999. Ahora hay restricciones CHECK en todas las columnas que escribe el usuario (largos, cantidad de fotos, rangos de lat/lng y radio), con los mismos números que el cliente.
  - ✅ **Verificado atacando la API de verdad** (saltándose la app, con un token de sesión real): **12/12** — 7 ataques a `pets`, 2 a `pet_tips`, 2 a `sightings`, todos rechazados; y el control de que un reporte y una pista **normales sí se guardan**.
  - `src/lib/dbErrors.ts` (+10 tests) traduce los errores de Postgres, que si no mostraban `new row for relation "pets" violates check constraint...` en pantalla. Cableado en las 10 pantallas que mostraban el mensaje crudo + Publicar. La clase `ErrorAmigable` marca los errores ya redactados por nosotros para que el traductor no los pise.
- **Lo que NO aplica a esta arquitectura** (revisado, no hace falta hacerlo): *inyección SQL* (no armamos SQL; PostgREST parametriza), *connection pooling* (la app no abre conexiones: habla HTTP con PostgREST y Supabase administra el pool), *CORS como defensa* (es una regla del navegador; `curl` la ignora y la anon key es pública por diseño — lo que protege es la RLS), y *"que cada usuario vea solo lo suyo"* (los reportes son públicos **a propósito**: es lo que permite el modo invitado; lo privado —mensajes, favoritos, preferencias, denuncias, zonas— ya lo es).

## 🗑️ BORRAR MI CUENTA (19-jul) — ✅ EN PRODUCCIÓN Y VERIFICADO 12/12

Construido con subagentes (5 tareas + revisión final). **239 tests, 32 suites, tsc limpio.** Spec en `docs/superpowers/specs/2026-07-19-borrado-cuenta-design.md`, plan en `docs/superpowers/plans/2026-07-19-borrado-cuenta.md`.

**Por qué importaba:** Apple y Google **exigen** que una app que permite crear cuenta permita borrarla desde adentro (App Store 5.1.1(v)) — sin esto no se puede publicar. Y la Ley 21.719 (Chile) entra en vigencia en **diciembre de 2026** con derecho de supresión.

**Qué hace:** lo que es solo tuyo se destruye; lo que además es de otro sobrevive sin vos. Se borran tus reportes (con sus fotos), tu zona de alerta, guardados, preferencias y tokens. Sobreviven anonimizadas tus pistas y avistamientos en reportes ajenos (firmados *"Un vecino"*) y tus conversaciones (*"Cuenta eliminada"*, sin poder responder). La fila de `profiles` queda como lápida y **se borra el usuario de `auth.users`**: eso es lo que lo hace irreversible (sin el correo, el uuid que queda no se puede reasociar a nadie) y además libera el correo para volver a registrarse.

**Lo que encontraron las revisiones** (vale la pena leerlo, fueron todos errores míos en el spec):
- 🔴 **Escalada de privilegios.** `pets.fotos` es texto que escribe el usuario: se podía guardar en el reporte propio la ruta de la foto de OTRA persona y, al borrarse la cuenta, la Edge Function (que corre con `service_role` y se saltea la RLS de Storage) se la borraba a esa otra persona. Ahora se filtra por `^<uid>/[^/]+$` en la RPC **y** en la función.
- 🔴 **El reintento perdía las fotos y devolvía éxito.** La RPC entregaba las rutas una sola vez; si Storage fallaba, el reintento la encontraba en su camino idempotente, recibía vacío, y las fotos quedaban **para siempre en un bucket público** mientras respondíamos "listo". Se separó `mis_fotos_a_borrar()` (solo lectura) y se reordenó.
- 🔴 **Las conversaciones se borraban con los reportes.** `messages.pet_id` tenía `on delete cascade` hacia `pets`, así que borrar los reportes propios se llevaba puesto el hilo entero, **incluidos los mensajes que escribió la otra persona**. Nadie lo vio hasta la revisión final. Ahora la FK es `on delete set null` y el hilo queda con "Reporte eliminado".
- 🟠 `create or replace` **no puede cambiar el tipo de retorno** de una función: la migración no se podía reaplicar.
- 🟠 Pedir `eliminado_en` en la misma consulta que `nombre` hacía que, con la migración sin aplicar, **todos** perdieran su nombre real (no solo las cuentas borradas). Resuelto con reintento escalonado.

### ✅ MIGRACIÓN `0017` APLICADA Y VERIFICADA (19-jul)

Aplicada por la API de administración de Supabase (`POST /v1/projects/<ref>/database/query`), que permite correr SQL con un Personal Access Token, sin necesidad de la contraseña de la base ni del SQL Editor. **Diagnóstico previo, todo en verde:**
- **`storage.objects` NO tiene FK hacia `auth.users`** → era el riesgo grande: si la tuviera, borrar el usuario habría fallado para cualquiera con fotos (y las de avistamientos se conservan a propósito). No existe, así que el paso final del borrado no se traba.
- `profiles_id_fkey` y `messages_pet_id_fkey` se llamaban como asumía la migración, y no había restos de intentos previos.

**Verificado después de aplicar:** la FK de `profiles`→`auth.users` ya no está; `eliminado_en` existe; las dos RPC son `security definer` y **con `args` vacío** (no aceptan destinatario); `messages.pet_id` quedó nullable con `on delete set null` (`confdeltype = n`); y `ruta_storage()` devuelve bien la ruta.

**Los tres ataques, probados contra la base real y todos rechazados:**
- Sin sesión, llamar a `anonimizar_mi_cuenta()` → `42501 permission denied` (el `grant` es solo a `authenticated`).
- Pasarle un `user_id` para borrar la cuenta de otro → `PGRST202`, esa firma **no existe**. Es la propiedad de seguridad central del diseño.
- Sin sesión, `mis_fotos_a_borrar()` → `42501`.

### ✅ PRUEBA END-TO-END EN PRODUCCIÓN (19-jul) — 12/12

Hecha con Playwright contra `https://encuentras-mascota.pages.dev` con dos cuentas descartables (A y B). Escenario: B publica un reporte, A publica otro, A deja una pista en el reporte de B, B le escribe a A **sobre el reporte de A**, y A borra su cuenta.

| Qué | Resultado |
|---|---|
| El reporte de A desaparece | ✅ (confirmado en la base, no solo en pantalla) |
| El reporte de B sobrevive | ✅ |
| La pista de A en el reporte de B sobrevive | ✅ |
| …firmada **"Un vecino"** | ✅ |
| …sin filtrar el nombre "Alberto" | ✅ |
| La conversación sobrevive | ✅ **valida el arreglo de la FK**: antes se borraba entera |
| Muestra **"Cuenta eliminada"** | ✅ |
| Muestra **"Reporte eliminado"** | ✅ |
| El chat no deja escribir | ✅ *"Esta persona borró su cuenta. La conversación queda como recuerdo."* |
| La clave vieja ya no entra | ✅ `Invalid login credentials` |
| El mismo correo se puede volver a registrar | ✅ (prueba de que `auth.users` se borró de verdad) |
| La cuenta nueva arranca vacía | ✅ no arrastra nada de la anterior |

**Lápida verificada en la base:** `nombre='Cuenta eliminada'`, y `telefono`, `red_social` y `foto_perfil` en `null`.

**Limpieza:** las dos cuentas de prueba se borraron con la propia función. La base quedó con **0 reportes y 0 pistas**, y ninguna de las dos puede entrar.

⚠️ **Residuo a propósito:** quedaron **3 filas lápida** en `profiles` y el hilo de mensajes entre ellas. Es el comportamiento correcto (por eso sobreviven), pero son datos de prueba. Para borrarlos del todo hace falta `service_role`, desde el SQL Editor:
```sql
-- Borra las lapidas de prueba y sus mensajes huerfanos.
delete from public.messages
 where from_user in (select id from public.profiles where eliminado_en is not null)
    or to_user   in (select id from public.profiles where eliminado_en is not null);
delete from public.profiles where eliminado_en is not null;
```

### 🔴 HALLAZGO DE PRIVACIDAD (anterior a este trabajo, sin resolver)

Durante la prueba quedó a la vista: la política de `profiles` es `for select to authenticated using (true)`, así que **cualquier persona con una cuenta puede leer el teléfono y la red social de todos los demás**. Se comprobó leyendo `+56959987786` y `@77.pvblo` (los de Pablo) desde una cuenta descartable recién creada. Merece su propia tanda: una vista o column-level security que exponga solo `id`, `nombre` y `eliminado_en`.

### ✅ WEB SUBIDA (19-jul) — build verificado en el navegador antes de desplegar

La app compilada todavía no tiene ni el borrado de cuenta ni la tanda 4. `npx expo export --platform web` → Cloudflare → Deployments → Create new deployment → arrastrar `dist`. Recordar que en producción ya aparecieron bugs que en dev no se veían: **verificar el sitio compilado, no solo el dev server**.

### ✅ LAS 3 EDGE FUNCTIONS DESPLEGADAS Y VERIFICADAS (19-jul)

`npx supabase functions deploy <nombre> --project-ref ywlrcfaybnikaurxsgtj` (no hace falta `link`).

- **`send-notifications`** — 🔓 **el agujero está cerrado**: un `OPTIONS` sin ninguna credencial devolvía `200` y **despachaba la cola entera**; ahora devuelve `204` con cuerpo vacío sin tocar la base. Comprobado que el camino legítimo sigue vivo: el `POST` de `pg_cron` con la publishable key responde `{"ok":true,"procesados":0,"fallidos":0}`.
- **`send-push`** — antes respondía **404 (nunca había estado desplegada**, o sea que el push del chat jamás funcionó y el `.catch(() => {})` lo tapaba). Ahora responde `401` sin sesión, que es lo correcto.
- **`delete-account`** — desplegada; `GET` da `405`. **Todavía no sirve** hasta que apliques la migración `0017`: falla en el primer paso, que es de solo lectura, sin tocar nada (falla cerrada, verificado en revisión).
- **CORS verificado en las dos que llama el navegador:** preflight desde `https://encuentras-mascota.pages.dev` devuelve `204` con `Access-Control-Allow-Origin` correcto, y un origen impostor (`encuentras-mascota.pages.dev.atacante.com`) recibe `204` **sin** esa cabecera → el navegador lo bloquea. `EXPO_PUBLIC_WEB_URL` ya estaba cargado en los Secrets (se dedujo: sin él, el dominio a secas no habría pasado el allowlist, porque el regex sólo acepta subdominios).

### Checklist de verificación (nada de esto se pudo probar sin la base real)

1. **🔴 Lo primero, porque puede romper todo:** ¿`storage.objects.owner` sigue teniendo FK a `auth.users`? Si la tiene sin `on delete`, **borrar el usuario falla** mientras le queden fotos (y las de avistamientos se conservan a propósito).
   `select conname, confdeltype from pg_constraint where conrelid='storage.objects'::regclass and confrelid='auth.users'::regclass;`
2. Antes de correr la migración, confirmar que la FK se llama así: `select conname from pg_constraint where conrelid='public.profiles'::regclass and contype='f';`
3. **El ataque:** con el token de A (del `localStorage`), intentar borrar la cuenta de B. Debe ser imposible — la RPC no acepta destinatario.
4. Con un token real, insertar un mensaje hacia una cuenta borrada → debe dar `42501`.
5. `select nombre, telefono, red_social, foto_perfil from profiles where eliminado_en is not null;` → todo null salvo `'Cuenta eliminada'`.
6. Registrarse de nuevo con el mismo correo → debe funcionar, con uuid **nuevo**.
7. Que las fotos propias desaparezcan del bucket y las de avistamientos ajenos **queden**.
8. Cuenta A publica reporte, B le escribe, A se borra → B debe seguir viendo el hilo con "Reporte eliminado" (esto valida el arreglo del tercer Critical).

**Riesgos aceptados, anotados a propósito:** (a) las fotos se borran antes de anonimizar, así que si falla ese paso la persona queda con la cuenta viva y los reportes con imágenes rotas — feo pero visible, y la pantalla empuja a reintentar; el estado que evitamos era peor y silencioso. (b) Borrar los reportes propios **también borra las pistas y avistamientos que otros dejaron ahí** (la pantalla ahora lo dice). (c) A partir de `0017`, borrar una cuenta desde el panel de Supabase deja un perfil sin `eliminado_en`, que se ve vivo: **las cuentas se borran solo por la app**.

## ⏭️ PARA RETOMAR (lo próximo, en orden)
1. **Subir la web actualizada a Cloudflare** — todo lo de la tanda 4 (búsqueda paginada, validación, mensajes traducidos) está commiteado pero **NO** está en producción. `npx expo export --platform web` → Cloudflare → proyecto `encuentras-mascota` → Deployments → Create new deployment → rama `main` → arrastrar `dist`.
2. **Brevo:** la cuenta sigue sin activar (`403 SMTP account is not yet activated`). Hasta que Brevo la habilite, ningún aviso por correo sale. Alternativa si se cansa: comprar dominio y volver a Resend — el código ya soporta los dos y cambia solo según qué variables estén cargadas.
3. ~~**CORS en las Edge Functions** y **caché por consulta**~~ — ✅ **HECHO EN CÓDIGO (19-jul)**, ⚠️ **falta desplegar** (ver 3.b). No era higiene: había un agujero real.
   - 🔓 **`send-notifications` se podía disparar SIN NINGUNA CREDENCIAL.** El gateway de Supabase deja pasar el preflight `OPTIONS` sin verificar el JWT (para que las funciones puedan contestarlo), y la función ignoraba el método HTTP: un `curl -X OPTIONS` desde cualquier parte devolvía `200 {"ok":true,...}` y **despachaba la cola entera**. Comprobado contra el proyecto real (`POST` y `GET` sin token sí daban 401, o sea que el único hueco era OPTIONS). No permitía *forjar* avisos (la cola la escriben los triggers), pero sí que un extraño gastara la cuota de correo. Arreglado: OPTIONS contesta 204 y corta antes de tocar la base; lo que no sea POST da 405.
   - 🌐 **Una función desplegada NO recibe cabeceras CORS del gateway.** El gateway solo se las pone a *sus* respuestas — por eso el 404 de una función inexistente sí trae `Access-Control-Allow-Origin: *` y confunde. Verificado: el preflight a `send-notifications` vuelve 200 sin una sola cabecera `access-control-*`. Como `send-push` **sí** se llama desde el navegador (`ChatScreen`), sin esto el navegador la bloquea. Nuevo `supabase/functions/_shared/cors.ts` con allowlist por **origen exacto** (nunca `*`, porque va la cabecera `Authorization`), contemplando las vistas previas de Cloudflare Pages. 9 tests, incluido el caso que mata a un allowlist mal escrito: `encuentras-mascota.pages.dev.atacante.com`.
   - 💀 **`send-push` nunca estuvo desplegada** (responde `404 NOT_FOUND`): el aviso push del chat **jamás funcionó**, y el `.catch(() => {})` de `ChatScreen` lo tapaba en silencio absoluto. Ahora ese catch deja un `console.warn`.
   - 🗑️ **Caché:** la respuesta no era "agregar caché por consulta" sino **borrar la que había**. `activePetsCache` + `listActivePets()` no los llamaba nadie desde que la búsqueda pasó al servidor (migs `0014`/`0015`); las invalidaciones en `createPet`/`closePet`/`updatePet`/`deletePet`/`markReunited` limpiaban algo que ya nadie leía. Se quitó todo, junto con `src/lib/cache.ts`. Si algún día hace falta, va **por consulta** (clave = filtros + cursor), no una lista global; el `ttlCache` queda en el historial de git.
   - **224 tests, 30 suites, tsc limpio.**
3.b ⚠️ **PENDIENTE TUYO — desplegar las funciones.** Hasta que lo hagas, en producción sigue corriendo la versión vieja y el agujero de OPTIONS sigue abierto. `supabase login` es interactivo, por eso no lo pude correr yo:
   ```
   cd C:\Users\pdani\encuentra-mascota
   npx supabase login
   npx supabase link --project-ref ywlrcfaybnikaurxsgtj
   npx supabase functions deploy send-notifications
   npx supabase functions deploy send-push
   ```
   Para que `send-push` acepte al navegador, cargale `EXPO_PUBLIC_WEB_URL=https://encuentras-mascota.pages.dev` en Dashboard → Edge Functions → Secrets.
   **Comprobación** (tiene que dar `204`, no `200` con JSON):
   ```
   curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
     https://ywlrcfaybnikaurxsgtj.supabase.co/functions/v1/send-notifications
   ```
4. **Bloqueo de cuenta por intentos fallidos:** recomendación es **no hacerlo tal cual**. Bloquear tras N intentos deja que cualquiera eche al dueño de un reporte tirando claves malas a propósito, justo cuando más necesita entrar. Supabase ya limita por IP. Si se hace, mejor con demora creciente que con bloqueo.
5. **Nombre de la app:** sin decidir, pero ya **investigado (19-jul)**. Dominios `.cl` verificados uno por uno en el WHOIS de NIC Chile; colisiones buscadas en Google Play / App Store. **INAPI NO se pudo verificar** (su buscador es un formulario ASP.NET que no acepta consultas por URL) — eso hay que hacerlo a mano en `buscadormarcas.inapi.cl`, búsqueda **literal y fonética**, clases **9** (software), **42** (SaaS) y **45** (servicios comunitarios).

   | Nombre | Colisión en tiendas | Dominio `.cl` | Observación |
   |---|---|---|---|
   | Volví | ninguna encontrada | **LIBRE** | la tilde divorcia marca y dominio; 1ª persona ("lo dice el perro") confunde al decirlo |
   | Trufa | *Trufario*, mismo rubro | tomado (2003) | se lee "chocolate" antes que "nariz"; no habla de gatos |
   | Bengala | no en mascotas | tomado | **Bengala SpA es una software house chilena**; además "gato bengala" es una raza |
   | Manada | **sí: Manada Animal, en Play y App Store** | tomado (2008) | cálida pero genérica y ya usada en el vertical mascotas |
   | Lumi | **sí: 4+ apps activas** | tomado (Lumi SpA) | suena a app de IA genérica, justo lo que no queremos |
   | **Cerquita** *(nuevo)* | ninguna encontrada | **LIBRE** | describe el mecanismo real: los vecinos *cerquita* tuyo ven el reporte |
   | Pichicho *(nuevo)* | ninguna encontrada | **LIBRE** | chilenísimo y tierno, pero deja fuera a los gatos |
   | Volvió *(nuevo)* | ninguna encontrada | **LIBRE** | igual que "Volví" pero en 3ª persona: se dice mucho mejor en una frase |

   **Recomendación: 1º Cerquita, 2º Volvió.** *Cerquita* es el único que junta `.cl` libre, cero colisión en tiendas y un significado que explica el producto, en registro chileno y cálido; sirve para perros y gatos, no lleva tilde y nadie lo escribe mal después de escucharlo. Riesgo a mirar: por ser diminutivo común, INAPI podría objetarlo por poco distintivo → se registra como **marca mixta** (logo + palabra).

   **Dato de contexto:** Chile ya tiene competidores en este nicho exacto — **Dogin** (dogin.cl, mapa + push, se vende como "la mayor red de mascotas perdidas de Chile"), **PetLoc**, **Fauna City** y **PeTrace**. Ninguno choca de nombre, pero hay que competirles en SEO.

## Cómo retomar / probar
- App web (dev): `cd C:\Users\pdani\encuentra-mascota` → `npx expo start --web` → abrir `http://localhost:8091`.
- Login de prueba: `probando779@gmail.com` / `probar123456` (la confirmación de correo está apagada).
- Tests: `npm test` (**130 en verde**, 20 suites). Typecheck: `npx tsc --noEmit` (0 errores).

## Qué está hecho
- **MVP completo:** auth, publicar (fotos múltiples + cámara), mapa, lista con filtros + "cerca de mí" + buscador, detalle, chat en tiempo real + bandeja de no leídos, perfil (foto, editar, reunidas, **teléfono + red social**), editar/borrar, compartir con link, denunciar/moderación, recuperar contraseña, privacidad/términos, anti-spam, robustez (carga/error/retry).
- **Rediseño de interfaz v3 "app amable"** aplicado a TODAS las pantallas: verde pino + coral + arena, fuente Hanken Grotesk, saludo/chips/tarjetas/FAB, perrito plano.
- **Pulido de UI (jul-17):** ocultos los headers de stack redundantes en Mapa/Lista/Conversaciones/Perfil; arreglado el chip "Tu barrio" que se cortaba; afinados espaciados en detalle/chat/publicar.
- **Función nueva: "Coincidencias perdido↔encontrado"** — en el detalle sugiere reportes del estado opuesto, misma especie (comodín "otro"), a ≤15 km, ordenados por cercanía. Lógica pura en `src/lib/matches.ts` con tests. No requiere migración ni config.
- **Función nueva (jul-18): "Afiche imprimible con QR"** — en el detalle de un reporte **propio** aparece el botón **"Crear afiche"**: genera un PNG (proporción carta) con foto, datos, recompensa, tu WhatsApp y un **QR** al reporte, para pegar en la calle o mandar por WhatsApp. En web descarga el PNG; en nativo abre la hoja de compartir. Guardia: si tu perfil no tiene WhatsApp, te lleva a completarlo. Archivos: `src/lib/afiche.ts` (+tests), `src/lib/qr.ts`+`QrCode.tsx`, `AfichePoster.tsx`, `aficheImage.ts`, `AficheGenerator.tsx`, botón en `PetDetailScreen.tsx`. Deps nuevas: `qrcode-generator`, `react-native-view-shot`, `expo-sharing`. Sin migración. Spec/plan en `docs/superpowers/`. Desarrollado con subagentes + revisión final (opus) "Ready to merge".
  - ⚠️ **Pendiente prueba visual (tuya, ~2 min):** verificado por tests (78/78) + typecheck + revisiones, pero el render real no se ejercitó en navegador (no había reporte de la cuenta de prueba y no quisimos escribir en prod). Para probar: abrí **un reporte tuyo** → **Crear afiche** → confirmá que el PNG se descarga, se ve bien y que el QR (con la web ya desplegada) abre el reporte. Recordá tener **WhatsApp cargado en tu perfil**.
  - Nota build nativo: `expo-sharing` trae un config plugin que no se auto-registró en `app.config.ts` (no afecta web ni el compartir saliente); si más adelante armás el build EAS, revisá si hace falta agregarlo.
- **3 funciones nuevas (jul-18), construidas en paralelo con 3 subagentes (una rama/worktree c/u) y fusionadas:**
  - **Alertas por zona** (`feat/alertas-zona` → migración `0006_alertas_zona.sql`): el usuario fija centro (su ubicación) + radio (chips 2/5/10 km) en Perfil → "Mi zona de alerta"; banner in-app amable en Inicio cuando hay reportes nuevos cerca desde su última visita. Push real NO cableado (queda `TODO(push)`); el aviso in-app degrada sin config. Lógica pura en `src/lib/alerts.ts` + `lastVisit.ts`, servicio `alertZones.ts`, `useZoneAlert`, `ZoneAlertBanner`, `AlertZoneScreen`. **Verificado en navegador** (pantalla se ve bien).
  - **Visto por acá** (`feat/visto-por-aca` → migración `0007_avistamientos.sql`): en el detalle, cualquiera marca dónde vio a la mascota (mapa + mi ubicación + nota/foto opcional) → rastro de avistamientos con pines secundarios (color sol) y resumen ("Último avistamiento a 1,2 km · hace 3 h"). `src/lib/sightings.ts`, `services/sightings.ts`, `AddSightingScreen`, sección en `PetDetailScreen`. RLS: borra el autor o el dueño del reporte.
  - **Verificación de reencuentro / final feliz** (`feat/reencuentro` → migración `0008_final_feliz.sql`, agrega columnas `reunida_en`/`final_feliz`/`final_foto` a `pets`): botón "¡Volvió a casa!" (solo dueño) → confirmación con nota+foto feliz opcionales → `markReunited` + **Confetti** + tarjeta de final feliz; badge "Final feliz" al ver un reporte ya reunido; tira "Finales felices" en Inicio. `src/lib/reunion.ts`, `services/reunions.ts`.
  - ⚠️ **Fix de integración (jul-18):** la tira "Finales felices" en Inicio degrada a vacío si su consulta falla (p. ej. migración 0008 sin aplicar), para no tumbar toda la pantalla de Inicio. Detectado en la verificación web.
  - ✅ **Prueba visual end-to-end HECHA (2026-07-18):** con Playlist/Playwright en el navegador se publicó un reporte de prueba y se ejercitó TODO con datos reales: **Visto por acá** (avistamiento creado → rastro con distancia "a 1,4 km" + resumen "Último avistamiento"), **¡Volvió a casa!** (panel de confirmación → **Confetti** animado → tarjeta "FINAL FELIZ" → aparece en la tira "Finales felices" de Inicio + "Ya van 1 vuelta a casa"), y "Mi zona de alerta". El reporte de prueba, su foto y avistamientos se borraron después (base limpia). Confirmado que `reunida_en` persiste en la base.
- **Code-review + pulido (jul-18):** revisión de alto esfuerzo (workflow multi-agente) de las 3 funciones nuevas → 8 hallazgos verificados, arreglados los que importan: Compartir/Crear afiche vuelven a estar en reportes reunidos, "Lo vi por acá" se oculta en reunidos (rastro = historia), AlertZone no pisa la ubicación no guardada al volver, AddSighting reusa `useMyLocation` (maneja GPS con try/catch), `useZoneAlert` memoiza el conteo, y se quitó `setActivo` (código muerto). Se dejó `deleteSighting` (respalda la política RLS de borrado, para una función futura). 128/128 tests, tsc limpio, fix del reporte reunido verificado en navegador.
- **4 funciones nuevas (jul-18, tanda 2), construidas en paralelo con 4 subagentes y fusionadas:**
  - **💚 Guardar/seguir reportes (favoritos)** (`feat/favoritos` → migración `0009_favoritos.sql`, tabla `favorites`): el corazón (antes muerto) en tarjetas + Inicio ahora guarda/quita; pantalla **"Guardados"** en Perfil. `FavoritesProvider` (contexto) montado en `App.tsx`; degrada sin la tabla (set vacío, no rompe).
  - **📝 Novedades del dueño** (`feat/novedades` → migración `0010_novedades.sql`, tabla `pet_updates`): sección "Novedades" en el detalle; el dueño publica notas, todos las leen. RLS: solo el dueño inserta. Degrada sin la tabla (lista vacía).
  - **🔎 Filtros avanzados en la Lista** (`feat/filtros`, SIN migración): chips nuevos "Con recompensa" + rango de tiempo (Hoy / Última semana / Todo). Lógica pura `src/lib/petFilters.ts` (+20 tests). **Verificado en navegador** (filtra bien).
  - **🕒 Historia del reporte** (`feat/historial`, SIN migración): línea de tiempo en el detalle (publicado → avistamientos → reencuentro), derivada de datos existentes. `src/lib/timeline.ts` (+10 tests). **Verificado en navegador**.
  - Conflicto de merge resuelto: novedades e historial insertaban su sección en el mismo lugar de `PetDetailScreen`; ahora conviven. **173/173 tests, 24 suites, tsc limpio.**
  - ✅ **Prueba visual de favoritos y novedades HECHA (2026-07-18)**, con las migraciones `0009`/`0010` ya aplicadas: se tocó el **corazón** de una tarjeta en Inicio (se llena de coral), el reporte apareció en **Perfil → Guardados**, y en un reporte propio se publicó una **novedad** (aparece con "recién", el campo se limpia y el botón se deshabilita). Después se borró el reporte de prueba y se vaciaron los favoritos (base limpia; empty states OK).
- **Guía de setup push/correo:** ver `SETUP-PUSH-CORREO.md` (pasos exactos + `eas.json` + plantillas de correo + handler de notificaciones en primer plano).
- Fix importante: pantalla blanca al iniciar sesión (resuelto).

- **3 funciones nuevas (jul-18, tanda 3), construidas en paralelo con 3 agentes y fusionadas (orden C → A → B):**
  - **📣 Avisos que salen de la app** (`feat/avisos` → migración `0011_avisos.sql`): tablas `notification_prefs` (qué avisos quiere cada uno y por qué canal) y `notification_events` (cola cruda). **La cola la escriben triggers de Postgres, nunca el cliente** — así nadie puede forjar avisos hacia otros. La lógica de "a quién le toca" vive en `src/lib/notifyTargets.ts` (pura, con tests) y la comparte la Edge Function `supabase/functions/send-notifications` (correo por Resend + push por Expo). Pantalla **"Avisos"** en Perfil con 4 interruptores de tipo y 2 de canal.
  - **💬 Pistas del barrio** (`feat/pistas` → migración `0012_pistas.sql`, tabla `pet_tips`): sección en el detalle entre Novedades e Historia. Lectura pública, escribe cualquiera con cuenta, borra el autor o el dueño, anti-spam de 10/hora. Novedades = voz del dueño; Pistas = voz del barrio (se distinguen visualmente).
  - **👋 Modo invitado** (`feat/invitado`, SIN migración): la app **ya no arranca en el login**. `RootNavigator` monta siempre el TabNavigator y el portero `useRequireAuth` pide cuenta recién al actuar (8 acciones, cada una con su mensaje), volviendo después a la pantalla exacta con `goBack`. Perfil sin sesión = bienvenida "Estás mirando de visita".
  - **Revisión mía sobre lo que entregaron los agentes (4 arreglos):** (1) el correo interpolaba sin escapar un extracto de pista escrito por cualquier vecino → **inyección de HTML**, ahora escapado; (2) test nuevo que falla si las dos copias de `notifyTargets` se desincronizan (la Edge Function no puede importar de `src/`); (3) `borrarTip` fallaba en silencio cuando la RLS rechazaba el borrado (PostgREST no devuelve error, solo borra 0 filas); (4) se quitó el parámetro `volverA`, que nunca se leía y dejaba `?volverA=[object Object]` en la URL.
  - **213/213 tests, 28 suites, tsc limpio.** Verificado en navegador ya fusionado: modo invitado (abre en Inicio, Perfil de visita), pantalla de Avisos completa, las dos secciones del detalle conviviendo, y el invitado tocando "Dejar una pista" → mensaje propio → registro.
  - ✅ **Migraciones `0011`/`0012` APLICADAS y VERIFICADAS end-to-end (2026-07-18):** RLS de la cola comprobada contra la base real (un anónimo recibe `42501` al intentar insertar en `notification_events` y lee `[]`); **los triggers funcionan** (publicar un reporte y dejar una pista no fallan, que es justo lo que rompería si el encolador tuviera un error de columna); **preferencias persisten** (apagué "Reportes en mi zona" y "Correo", salí y al volver seguían apagados); **pista real publicada** → tarjeta con firma "Pablo Prueba · recién", texto y tachito; **como invitado la misma pista firma "Un vecino"** (no filtra el nombre, `profiles` sigue cerrado); **borrado OK** (confirmación → desaparece → estado vacío). Datos de prueba borrados y preferencias restauradas.
  - ⚠️ **Lo único que sigue sin ejercitarse:** la Edge Function `send-notifications` (nunca se desplegó ni se corrió), o sea el envío real de correo y push. La cola se llena bien; falta el que la vacía.

## PENDIENTE — pasos del usuario (necesarios)
0. ~~Aplicar las 3 migraciones nuevas~~ — ✅ **APLICADAS y VERIFICADAS (2026-07-18)**: `0006` (tabla `alert_zones`), `0007` (tabla `sightings`), `0008` (columnas `reunida_en`/`final_feliz`/`final_foto` en `pets`). Verificado contra la base real vía API REST (esquema completo + RLS OK) y con prueba visual end-to-end en el navegador (ver abajo).
0.b ~~Aplicar las 2 migraciones de la tanda 2~~ — ✅ **APLICADAS y VERIFICADAS (2026-07-18)**: `0009_favoritos.sql` (tabla `favorites`) y `0010_novedades.sql` (tabla `pet_updates`), comprobadas contra la base real vía API REST y con prueba visual end-to-end en el navegador. Guardados y Novedades funcionan.
0.c ~~Aplicar las 2 migraciones de la tanda 3~~ — ✅ **APLICADAS y VERIFICADAS (2026-07-18)**: `0011_avisos.sql` y `0012_pistas.sql`. Comprobadas contra la base real (RLS de la cola cerrada, triggers funcionando) y con prueba visual end-to-end: preferencias que persisten, pista publicada/vista como invitado/borrada.
0.d Para que los avisos **lleguen de verdad**: desplegar la Edge Function `send-notifications` (ver `supabase/functions/send-notifications/README.md` y `SETUP-PUSH-CORREO.md`), con `RESEND_API_KEY`, `RESEND_FROM` y `EXPO_PUBLIC_WEB_URL` en el entorno, y agendarla cada minuto. Sin eso la cola se llena y no se envía nada (comportamiento esperado, no un bug).
1. ~~Migración 0005~~ — ✅ **APLICADA (2026-07-17)**: columnas `telefono` y `red_social` en `public.profiles`. El teléfono/red social del perfil ya se guardan.
2. **Config opcionales (cada una activa algo ya programado):**
   - ~~Correo/SMTP~~ — ✅ **CONFIGURADO (2026-07-17)**: Resend SMTP en Supabase, remitente `onboarding@resend.dev`. Registro + "olvidé mi clave" envían correo y el enlace abre la pantalla de nueva clave (se corrigió `detectSessionInUrl` en web). **En modo prueba solo entrega a `pdanielespinozavega@gmail.com`**; para enviar a cualquiera falta **verificar un dominio** en Resend y cambiar el sender. "Confirm email" sigue APAGADO.
   - Push real → `eas init` + `EAS_PROJECT_ID` en `.env` + build APK + deploy de la Edge Function `send-push`. Ver `SETUP-PUSH-CORREO.md`.
   - Google Maps API key (`GOOGLE_MAPS_API_KEY` en `.env`) → mapa en build Android.
   - Sentry DSN (`EXPO_PUBLIC_SENTRY_DSN`) → monitoreo de errores.
   - Desplegar la web + `EXPO_PUBLIC_WEB_URL` → links compartidos abren desde afuera.

## Ideas / siguientes
- **Probar el afiche en el navegador** (ver ⚠️ arriba) y, si todo bien, dar por cerrada la función.
- ~~alertas por zona · "visto por acá" · verificación de reencuentro~~ ✅ **CONSTRUIDAS y verificadas (jul-18)**, ver arriba.
- ~~Fusionar `feat/mvp-encuentra-mascota` → `master`~~ ✅ **HECHO (jul-18)**.
- Crear remoto en GitHub y `push -u origin master` cuando quieras respaldo/PRs.
- Terminar de conectar el push (EAS) y el correo (dominio) siguiendo `SETUP-PUSH-CORREO.md`.
- Ver ROADMAP.md para el estado de las 15 mejoras (todas hechas en código).

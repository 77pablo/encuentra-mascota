# Estado del proyecto — Encuentra tu Mascota

## 👉 DÓNDE RETOMAR (1-ago-2026, madrugada — sesión autónoma)

Pablo se fue a dormir y la tanda 9 se hizo entera sin aprobaciones intermedias, a pedido suyo.
**Todo lo de esta sesión está commiteado y pusheado** (`41b8334` en `feat/mvp-encuentra-mascota`).
Cada decisión que tomé solo está marcada como **[decisión mía]** en
`docs/superpowers/specs/2026-08-01-tanda-9-retencion-y-agujeros-design.md`.

**Lo único que te toca a vos, en este orden:**
1. ✅ **WEB SUBIDA Y VERIFICADA EN PRODUCCIÓN (1-ago-2026).** Pablo la subió y se comprobó contra el
   sitio real: el bundle servido es exactamente el exportado
   (`index-3ba0ee06703d7af84028a8bf43452176.js`), Inicio ya **no** promete "Cerca de ti" sin
   ubicación —dice "Lo último publicado" y ofrece "Usar mi ubicación"—, los 4 chips salen apagados
   como corresponde sin ubicación, el QR de una placa inexistente da el mensaje correcto,
   `/privacidad` se sigue sirviendo, un deep link a una mascota que no existe no rompe nada, y
   **0 errores JS** y ninguna respuesta ≥400 inesperada en todo el recorrido.
2. **Elegir el nombre.** Informe completo en `docs/nombre-de-la-app.md`. Recomendación: **Cerquita**
   (`cerquita.cl` libre, verificado hoy en NIC Chile). ⚠️ **Antes de comprar, mirá INAPI a mano** —
   es el riesgo más caro y no se puede verificar automáticamente. Instrucciones exactas en ese doc.
3. **Brevo:** escribirle a `contact@brevo.com` pidiendo la activación de la cuenta SMTP. La cadena de
   avisos funciona entera y muere en un `403` de activación. Sin eso ningún correo sale.
4. **Probar el panel de moderación**, que nadie usó nunca, y limpiar la denuncia de prueba que quedó.
   Requiere entrar como `pdanielespinozavega@gmail.com` (ya tiene `es_admin = true`); **no sabemos la
   contraseña**, hay que resetearla con "olvidé mi clave" desde ese Gmail.
5. **Revocá el token de Supabase** que me pasaste (<https://supabase.com/dashboard/account/tokens>).
   Yo borré el archivo, pero estaba en OneDrive, así que se sincronizó a la nube.

✅ **La migración `0045` está APLICADA y VERIFICADA en producción.** Se comprobó ejecutando las
funciones de verdad como admin dentro de `begin … rollback`, 6/6 y sin residuo: la bandeja ve la
cuenta suspendida · reactivar un id inexistente **lanza** en vez de devolver éxito mudo · el camino
feliz funciona · reactivar dos veces lanza la segunda · deja de aparecer en la bandeja ·
`suspendido_en` queda realmente en `null`. Además `anon` no puede ejecutar ninguna de las dos.
⚠️ Ojo para la próxima: llamar estas funciones desde la Management API **no** prueba el guardrail
interno, porque entra como `postgres`, no es admin, y `es_admin()` corta antes. Hay que simular al
admin con `set local role authenticated` + `set local request.jwt.claims`.

**Trabajo de código pendiente, decidido y sin empezar:** bajar de `docs/legal/*.md` la promesa de
avisar por correo y de permitir apelar al suspender —hoy no pasa ninguna de las dos—, regenerar las
páginas con `npm run legales` y sumar el caso al test `legalCoherencia`. Decisión de Pablo del 30-jul:
no prometer un canal que no existe todavía (el correo de contacto depende del dominio, que depende del
nombre de la app).

✅ **`send-push` REDESPLEGADA Y VERIFICADA (1-ago).** El interruptor "Notificación al teléfono" de
Avisos ahora **sí** apaga los push del chat: `send-notifications` respetaba `notification_prefs` desde
la 0011 pero `send-push` no la leía nunca. La decisión vive en `_shared/prefsPush.ts`, pura y probada
desde jest (las Edge Functions están fuera del typecheck y de la suite). Humo en producción:
`OPTIONS` → 204 con el origen real permitido, `POST` sin credenciales → 401.

### 📋 TANDA 11 — elegida por Pablo el 1-ago, pendiente de arrancar
Va **después** de cerrar la tanda 10 (radio por especie · plan de búsqueda · antiestafa · Cuadrilla),
porque se solapan: "avisar sin cuenta" comparte terreno con la Cuadrilla (las dos tratan la escritura
anónima) y "cierre de casos" toca el ciclo de vida que tocan el radio y el plan.

1. **Cierre de casos.** Preguntar "¿apareció?" a los 3, 7 y 21 días con tres botones, y archivar como
   "sin confirmar" lo que no responde. Los avisos zombis son el defecto estructural del rubro (es la
   queja dominante contra el líder del mercado). Premio escondido: **genera el dato que nadie tiene
   en Chile** —cuántas mascotas se reencuentran de verdad—, que es material de prensa y la carta de
   presentación para un municipio. ⚠️ El tono es todo: preguntarle "¿apareció?" a quien no la
   encontró duele.
2. **Avisar sin cuenta.** Quien encuentra un animal en la calle es un desconocido sin ninguna razón
   para instalar una app, y hoy le pedimos registro para todo. El camino técnico ya está probado en
   el repo: `avisar_escaneo_collar` (0027) es `security definer` con `grant … to anon` y rate-limit
   por ficha — el único punto de escritura anónima que existe.
3. **Bandeja de avisos in-app.** Hoy **nada en `src/` lee `notification_events`**: si el push y el
   correo fallan —y el correo está fallando ahora mismo por lo de Brevo— el aviso se pierde y nadie
   se entera nunca. Además, coincidencias y escaneos de collar no tienen ninguna superficie dentro
   de la app, y el onboarding promete "te llega un aviso, no hace falta estar mirando".
4. **Cerrar la deuda de adopción.** Búsqueda por texto y por edad (la columna existe y no filtra), el
   filtro de radio que el servicio acepta y la pantalla manda siempre en `null`, guardar búsquedas,
   ciclo de vida para las publicaciones abandonadas, y que `perfil_publico` cuente adopciones (hoy un
   refugio con 40 publicaciones aparece como "no tiene reportes activos").

### Pulido posterior a la tanda 9 (1-ago, ya en producción)
Commits `47be414` y `4406d80`. **1496 tests / 120 suites, tsc 0.** Verificado en el sitio real.
- **El "Publicar un reporte" del vacío salteaba el portero de invitados.** El portero de la pestaña
  es un listener de `tabPress`, que **no** se dispara en una navegación programática: el invitado
  llenaba el formulario entero —fotos, pin en el mapa, descripción— y se enteraba recién al enviar.
- **El vacío prometía un aviso que no siempre llega** (ver el pendiente de abajo). Se bajó la promesa
  a lo que sí cumplimos.
- **Conceder la ubicación tapaba Inicio con un spinner** en vez de actualizarlo abajo.
- **La tarjeta de impacto no concordaba en número:** "1 mascotas buscando" y, peor, "1 encontraron
  familia". Nueva `lib/plural.ts`; ojo que la regla en español es `n === 1`, no `n > 1` (con cero va
  el plural).
- **"Mis publicaciones en adopción"** (pantalla nueva): `listMyAdoptions` existía desde la tanda de
  adopción **sin un solo llamador**, así que se podía publicar un animal y no tener dónde verlo.
  Marca cuál encontró familia y cuál está **oculta** (si no se dice, parece borrada). Su botón de
  publicar navega **anidado** a la pestaña Adopción: con nombre pelado habría sido la **séptima**
  aparición del bug de navegación.

**Pendiente chico que necesita migración** (anotado el 1-ago): el aviso de "seguir una comuna" y el
listado **no miran lo mismo**. `buscar_reportes` trae los reportes cuya comuna es esa **o** que la
tienen en `comunas_alcance`; el trigger del aviso solo mira `new.comuna`. O sea que un reporte
publicado en Recoleta con alcance a Independencia **aparece en la lista de Independencia y no manda
ningún aviso**. Por ahora se bajó la promesa del texto ("te avisamos cuando alguien publique ahí",
que es lo que sí cumplimos); emparejar las dos puntas es tocar el trigger.

**Lo primero de la próxima tanda** (las dos necesitan migración, por eso quedaron fuera):
**la bandeja de avisos in-app** —hoy nada en la app lee `notification_events`, así que si el push y
el correo fallan el aviso se pierde para siempre— y **las señas estructuradas** (color, tamaño,
sexo, chip, fecha de pérdida), que es lo único que subiría la CALIDAD del matching en vez de su
plomería: hoy una coincidencia es "misma especie + 15 km".
Y hay una tercera, nueva, que salió de la investigación de competencia y es más grande que las dos:
**organizar la búsqueda física del barrio** (ver abajo).

**Sigue trabando todo lo demás:** el **nombre de la app** → dominio `.cl` → correo de contacto →
páginas legales definitivas (28 marcadores `[[PENDIENTE]]`) → tiendas. Dominios `.cl` verificados
libres: cerquita, volvio, volvi, pichicho. Y el camino crítico de Google son **~21 días** (12 testers
reales durante 14 días seguidos), que no se acelera programando.

## 🗓️ SESIÓN 2026-08-01 — Tanda 9: retención y agujeros (sesión autónoma)

Pablo fijó el encuadre (retención + cerrar agujeros; retener a los tres públicos; avisos solo por
**hechos reales** más un resumen apagable, **nada de "hace rato que no entrás"**) y se fue a dormir.
El resto lo hice solo. **1139 tests / 98 suites → 1475 tests / 117 suites**, `tsc` 0 errores.
Commits `721e93d` → `41b8334`. **Pusheado.**

**Recorte que hice por presupuesto:** Pablo tenía 71% de la cuota semanal consumida (se reinicia el
3-ago). Bajé de 4 implementadores a **3** y saqué el revisor dedicado por rama, pero **mantuve la
revisión final adversarial**, que es la que siempre encuentra lo que se cae entre las tareas. Trabajé
en orden de valor decreciente y commiteando en cada paso, para que un corte por cuota dejara todo
entero en vez de tres cosas a medias.

**El hallazgo que ordenó la tanda:** los agujeros y la retención eran el mismo problema. Nada de esto
era una función faltante, eran promesas incumplidas.

**Lo que se arregló:**
- 🔴 **El botón "Contactar" de la página pública estaba MUERTO.** Navegaba al tab `'Mapa'`, que dejó
  de existir en la reorganización de 5 pestañas de julio. Es el destino de **todo push de reporte y
  todo link compartido**: o sea el vecino que escanea el QR de un afiche, tiene al animal en la mano,
  toca "Contactar" y no pasa nada. **Sexta aparición** de esta familia de bug.
- **"Ya apareció" desde el Perfil no registraba el reencuentro** (solo `activo=false`, sin
  `reunida_en`), así que no sumaba al contador de Inicio, ni a la tarjeta de impacto, ni a la galería
  "Volvieron a casa". Con la base casi vacía, cada reencuentro perdido era prueba social que no
  teníamos. Y el Perfil etiquetaba **"REUNIDA"** a cualquier reporte cerrado, fuera cual fuera el
  motivo.
- **Inicio mentía dos veces:** "Cerca de ti" pedía reportes sin ubicación (mostraba todo Chile) y los
  cuatro chips no filtraban nada.
- **El vacío culpaba al usuario:** una comuna sin datos recibía "soltá algún filtro" en vez de una
  salida. Ahora ofrece seguir la comuna, publicar o ampliar.
- Retry real donde no había ninguno: **el QR del collar** (la única pantalla del repo sin reintento,
  y la más urgente), "Encontré una mascota" (un error la dejaba **en blanco e irreintentable**),
  "Mis búsquedas" y el Perfil.
- **Una denuncia que sí se registró se informaba como fallida** (el `bloquear` iba dentro del `try`
  de `denunciar`), lo que llevaba a denunciar de nuevo.
- Nuevas: **"Mis comunas"** (seguías comunas, te llegaban avisos y no había dónde verlas ni sacarlas),
  **insignias propias** en el Perfil (solo se veían en el perfil AJENO), **agradecer a los vecinos**
  que ayudaron en un reencuentro, **banner de vigencia** del reporte, y **salir de la pantalla** tras
  borrar la cuenta.

**Los tres Criticals que encontró la revisión final** (ninguna revisión por tarea podía verlos,
viven en las costuras — es el mismo patrón que en todas las tandas anteriores):
1. **Se apagó el aviso de zona de alerta.** `ZoneAlertBanner` se alimentaba de la misma consulta que
   la tira de Inicio, y esa consulta pasó a estar acotada a 25 km **del teléfono** y ordenada por
   distancia. La zona de alerta es un lugar **fijo** —la casa— y ahí importa lo más **nuevo**: quien
   abría la app desde el trabajo dejaba de recibir el aviso de un reporte publicado al lado de su
   casa. Ahora son dos consultas, porque son dos preguntas distintas.
2. **Borrado fantasma de avistamientos.** `deleteSighting` no comprobaba haber borrado algo, y cuando
   la RLS rechaza un delete **PostgREST no devuelve error**: borra 0 filas y responde 204. Con la
   baja optimista de la pantalla, una sesión vencida sacaba el dato de la lista, no avisaba nada, y
   seguía ahí para todo el mundo. El gemelo `borrarTip` ya estaba arreglado por esto mismo.
3. **El guardián de navegación no cazaba destinos inexistentes**, que es exactamente cómo sobrevivió
   el bug de `'Mapa'`. Necesitaba su propio parser: el que había matchea cualquier `.push('x')`, o
   sea también un `array.push` común. Ahora caza las dos formas (pelada y anidada), comprobado
   contra mutación.

**Un rojo que no era de la tanda:** `__tests__/legales.test.js` fallaba en cualquier **clon nuevo**.
Comparaba byte a byte un archivo del disco contra la salida del generador (que emite LF), y sin
`.gitattributes` y con `core.autocrlf=true` un checkout limpio los materializa con CRLF. Pasaban acá
por accidente histórico. Lo encontró un agente al medir la línea de base en su worktree y dar
1137/1139 donde yo había medido 1139/1139 en el principal. Arreglado normalizando los dos lados;
comprobado que sigue poniéndose rojo si alguien edita `docs/legal/*.md` sin regenerar.
*(Un agente diagnosticó esto como "el contenido legal está desfasado". Lo verifiqué corriendo
`npm run legales`: no genera ningún cambio. No había desfase.)*

**Verificado en el navegador** (Playwright, no solo tests): Inicio ya no promete cercanía sin
ubicación · el vacío ya no dice "soltá algún filtro" · **el collar con la red caída dice "No pudimos
conectarnos" con botón Reintentar** en vez de "esta placa no existe" · "Mis comunas" aparece en el
Perfil con sesión · **cero errores JS** en todo el recorrido.

**Documentos nuevos:**
- `docs/nombre-de-la-app.md` — investigación de naming. **Cerquita** recomendado, `cerquita.cl` libre
  verificado en el WHOIS de NIC Chile. Con lo que **no** se pudo verificar (INAPI e Instagram) bien
  separado, para que la decisión no se tome creyendo que está todo chequeado.
- `docs/competencia-y-oportunidades.md` — **reordena la estrategia del producto.** La búsqueda física
  del barrio resuelve el **30-49%** de los casos y la base de datos el **2-6%**: somos muy buenos en
  lo segundo y no tenemos casi nada de lo primero. También deja por escrito por qué **no** vamos a
  hacer reconocimiento de hocico (el "99%" sale de un paper coescrito por el CTO del proveedor; el
  único benchmark independiente da 86,67% AUC) y quién es el competidor real en Chile: **SOSAFE**,
  con 2,5M de usuarios y 27 comunas, que no es una app de mascotas.

## 🗓️ SESIÓN 2026-07-30 — Una suspensión se puede deshacer (migración 0045)

Commit `da7d2a9`, TDD (cada test se vio fallar antes). **1139 tests / 98 suites, tsc 0.**
⚠️ **En la rama: la `0045` NO está aplicada y la web NO está subida.**

**El agujero:** `moderar_suspender` (0040) ponía `suspendido_en = now()` y **nada lo volvía a null**.
El panel lo opera una sola persona a mano, con "Suspender" al lado de "Descartar": una suspensión
equivocada solo se arreglaba entrando al SQL Editor. Y como al suspender la denuncia queda resuelta y
sale de la bandeja, la cuenta suspendida **no aparecía en ninguna pantalla**, así que tampoco se podía
saber a quién se había suspendido. No lo tenía anotado ninguna nota; salió de grepear el repo.

**Lo nuevo (migración `0045`, aditiva):**
- `moderacion_suspendidos()` → cuentas suspendidas, más reciente primero, **sin las eliminadas**
  (una cuenta borrada deja su fila lápida de la 0017; sin ese filtro quedaría para siempre en la
  bandeja y "reactivarla" no significaría nada).
- `moderar_reactivar(p_usuario_id uuid)` → pone `suspendido_en = null`. **Exige que estuviera
  suspendida y lanza si no cambió nada:** sin eso, reactivar un id inexistente devolvería éxito
  habiendo hecho cero (la forma del bug de la 0017) y el panel diría "reactivada" sobre una cuenta
  que sigue suspendida. Recibe el id del **usuario**, no de una denuncia: al reactivar ya no hay
  denuncia de donde derivarlo.
- Las dos son `security definer` con el gate `es_admin()` **adentro**, porque `authenticated` no puede
  leer `profiles` (grants por columna desde la 0018) y `suspendido_en` de la 0036 no se le concedió a
  nadie: una función definer es la única vía.
- `ModeracionScreen` suma la sección "Cuentas suspendidas" con botón Reactivar. **"No se pudo leer" y
  "no hay ninguna" son estados DISTINTOS**, con reintento — tercera aparición de la misma trampa (el
  perfil degradado que guardaba `''` encima del teléfono real y `AlertZoneScreen` mostrando los
  valores por defecto como si fueran la config guardada), y acá es peor porque al lado de la lista hay
  un botón para actuar. Las dos lecturas son independientes: si falla la de suspendidos, la bandeja de
  denuncias sigue funcionando (por ejemplo mientras la 0045 no esté aplicada).
- **Comprobado contra mutación:** forzando el estado de fallo a `false`, 2 tests se ponen rojos.

**Un flake propio, encontrado y cerrado:** el test nuevo pasaba en aislamiento y fallaba dentro de la
suite completa. No era lógica: montar una pantalla real con todo el stack de react-native tarda ~5 s
sueltos y llegó a 24 s bajo carga, o sea que se pasaba del **timeout de 5 s de jest**. Se fijó
`jest.setTimeout(30000)` (los otros tests de pantalla del repo lo hacen con `}, 30000)` por test) y el
montaje ahora espera a que el panel esté en pantalla en vez de suponer los ticks. Verificado con
**5 corridas completas seguidas en verde**. Lección repetida: cuando un test falle de forma
intermitente, leer el mensaje antes de teorizar — era un timeout, no una aserción.

**Decisiones de producto confirmadas de paso** (estaban en el código, mi nota decía lo contrario):
- **Bloqueo + coincidencias:** el aviso de `coincidencia` **llega igual** aunque haya bloqueo
  (`notifyTargets.ts` lo exime a propósito; todo el resto sí filtra bloqueados).
- **Bloquear NO esconde los reportes** del bloqueado.
- **Suspender ≠ remover:** frena lo nuevo, el contenido anterior sigue visible. La pantalla ahora lo
  dice con todas las letras en cada fila.

## 🗓️ SESIÓN 2026-07-29 (2) — El sitio real vuelve a poder llamar a las Edge Functions

Cierre del bug de CORS que se encontró el mismo día pero quedó sin commitear ni desplegar.
Commits `854914d` (arreglo + 3 tests) y `258dca3` (comentario del guardrail de la `0042`, que decía
que la migración no estaba aplicada cuando sí lo está desde el 28-jul).
**1114 tests / 96 suites, tsc 0**, revalidados antes de commitear.

**Qué pasaba:** `_shared/cors.ts` aceptaba producción solo si venía en `permitidos`, que sale de
`EXPO_PUBLIC_WEB_URL` — variable que nunca se definió. El comodín de respaldo exigía subdominio, así
que cubría cualquier vista previa de Cloudflare pero **no el dominio pelado del sitio real**. O sea:
`delete-account`, `send-push` y `moderar-borrar-foto` estaban rotas desde el sitio publicado,
probablemente desde el 19-jul. Borrar la cuenta in-app es requisito de Apple 5.1.1(v) y de Google.

**Desplegado y verificado en producción — medido, no razonado:**
- Las 3 funciones redesplegadas. Matriz de `curl -X OPTIONS`: dominio real → `Allow-Origin` ✅ (antes
  del deploy: 204 **sin** la cabecera), vista previa `abc123.` → ✅, `x.y.` → rechazado,
  `…pages.dev.atacante.com` → rechazado. `POST` sin token → **401** en las 3.
- **Prueba end-to-end del arreglo:** las 2 cuentas de prueba que ese mismo día **no habían podido
  autoborrarse** por este bug se borraron desde el sitio real. El diálogo ahora dice **"Cuenta
  borrada"** donde antes decía "No terminamos de borrarla". Controles: la clave vieja ya no entra en
  ninguna de las dos (`auth.users` se borró de verdad) y "PRUEBA TECNICA" desapareció del feed.
- **El 403 en consola al borrar la cuenta es esperado:** es `POST /auth/v1/logout?scope=global`, la
  sesión cerrándose contra un usuario que la función ya borró. Identificado registrando toda respuesta
  ≥400 con una cuenta descartable. `DeleteAccountScreen` ya lo trata a propósito (el `signOut()` va
  fuera del `try`) y la sesión local se limpia igual. Cosmético pendiente si molesta:
  `signOut({ scope: 'local' })` en ese camino — ojo que `ProfileScreen` hace `onPress={signOut}`, así
  que sumarle un parámetro al hook le pasaría el evento del táctil.

**Por qué la suite no lo vio, que es la lección:** `cors.test.ts` hacía `[PROD, ...ORIGENES_DEV]`, o
sea le **inyectaba** producción a la lista y después comprobaba que la lista lo acepta. Los 3 tests
nuevos pasan lista **vacía**. Regla: si un test tiene que armar la configuración que en producción
viene de otro lado, no está probando producción. Y un allowlist se prueba con `curl` contra el origen
real, no se razona.

**Residuo a propósito:** cada borrado deja su fila lápida en `profiles` (por diseño: así el otro lado
del chat ve "Cuenta eliminada"). Se sumaron 3 hoy — las 2 cuentas de prueba y una descartable que se
usó para identificar el 403.

## 🗓️ SESIÓN 2026-07-22 (5) — Tanda "moderación + push web + fotos chat + impacto" (4 agentes en paralelo)

Spec `docs/superpowers/specs/2026-07-22-tanda-moderacion-push-fotos-impacto-design.md`, plan
`docs/superpowers/plans/2026-07-22-tanda-moderacion-push-fotos-impacto.md`. Subagent-driven con
**4 implementadores en paralelo** (worktrees manuales `em-agente-a8/b/c/d`, junction de node_modules)
+ revisión por rama + fixers + **revisión final adversarial (opus)** + fix wave único.
**799 tests / 77 suites, tsc limpio.** Fusionado en `feat/mvp-encuentra-mascota` (merges
`88fef0e` D → `bc84c63` C → `75285bd` B → `15bf8c5` A; HEAD tras fixes `bb8d2fa`).

**Lo nuevo (migraciones `0036`→`0040`):**
1. **Panel de moderación (A):** `profiles.es_admin` + `suspendido_en`; `denuncias` gana ciclo de
   estado (`estado`/`resuelto_en`/`resuelto_por`/`accion`). Funciones `security definer`
   `es_admin()`/`estoy_suspendido()` (gate); las 6 policies de INSERT (pets/adoptions/pet_tips/
   sightings/adoption_questions/messages) suman `and not estoy_suspendido()` conservando su
   condición previa VERBATIM. RPCs `moderacion_bandeja()` (bandeja enriquecida con snapshot del
   contenido + contador de reincidencia), `moderar_retirar`/`moderar_descartar`/`moderar_suspender`
   (todas gatean `es_admin()` adentro). Helper `_denunciado_de(tipo,pet_id,objeto_id,usuario)`
   resuelve el autor del contenido → "Suspender" funciona en los 7 tipos. `es_admin` expuesto por
   `mi_perfil()` (recreada conservando `fecha_nacimiento` de 0024). `ModeracionScreen` en
   `ProfileStack`, entrada en Perfil visible solo si `es_admin`. Migs `0036`/`0036c`/`0040`.
2. **Push web real VAPID (B):** tabla `web_push_subscriptions` (mig `0037`, RLS solo-dueño),
   `_shared/webpush.ts` con **`npm:web-push@3.6.7` (corre en Deno — spike verificado)**, handlers
   `push`/`notificationclick` en `sw.js` (v2→v3), cliente `src/lib/webPush.ts`, botón "Activar
   notificaciones en este dispositivo" en Perfil→Avisos (solo-web, 4 estados). `send-notifications`
   y `send-push` despachan Web Push junto al Expo (best-effort, borran suscripciones 404/410).
   Reusa el canal `canal_push` (no cambia targeting → notifyTargets intacto). `anonimizar_mi_cuenta()`
   recreada limpia las suscripciones web.
3. **Fotos en el chat (C):** `messages.imagen_url` (mig `0038`, CHECK `texto_o_imagen` permite
   solo-foto/foto+texto); `sendMessage(...imagenUrl?)`; ChatScreen con botón adjuntar (cámara/
   galería, reusa `uploadPetPhoto` que borra EXIF), burbuja con imagen tocable→visor fullscreen;
   `resolverUrlFoto` (lib pura) evita re-subir en reintento; `mis_fotos_a_borrar()` recreada incluye
   las fotos de chat.
4. **Impacto de la comunidad (D):** RPC pública `impacto_comunidad()` (mig `0039`): reencuentros/
   buscando/adopciones/aportes; tarjeta "Lo que logramos juntos" en Inicio, visible para invitados.

**Lo que cazó la revisión (el patrón se repite — todo arreglado antes de mergear):**
- A: "Suspender" no servía para 5/7 tipos (usuario_denunciado null) → helper `_denunciado_de`;
  `denuncias.resuelto_por` sin `on delete set null` habría bloqueado el borrado de cuenta de un
  admin; **fuga real**: el fix dejó `_denunciado_de` con grant a `authenticated` → leía `from_user`
  de cualquier mensaje ajeno → cerrado (revoke total, solo lo usan funciones definer).
- B: un fallo de la API de Expo hacía `throw` antes del bloque Web Push y cortaba el loop de
  destinatarios → envuelto en try/catch (web corre siempre; solo re-lanza si nada entregó).
- C: reintento tras `sendMessage` fallido re-subía la URL remota → foto huérfana en Storage →
  `resolverUrlFoto` distingue uri local de URL ya subida.
- Fix wave final: I-1 (`countReunidas` alineada a `reunida_en not null and oculto=false`, ya no
  choca con la tarjeta de impacto), M-1 (contador de reincidencia cuenta por autor resuelto en los
  7 tipos), M-2 (toast según activar/desactivar).

**Diferidos anotados (follow-ups, NO bloquean):** I-2 **retirar un mensaje con foto no borra el
archivo del bucket** (Storage no se borra desde SQL; necesita sumar un borrado vía Edge Function
service_role al pipeline de moderación) — para reportes/adopciones el retiro sí oculta bien;
M-3 dispositivo compartido (subscribe() ajeno → catch desuscribe, borde raro); M-4 "mascotas
buscando" cuenta perdidas+encontradas (del brief); M-5 adjuntar foto con onSend en vuelo puede
pisar (preexistente); M-6 suspendido puede subir foto huérfana antes del 42501; M-7 suspender NO
oculta el contenido viejo del usuario (decisión de producto: suspensión ≠ remoción).

**⚠️ PENDIENTE DE PABLO — orden de despliegue OBLIGATORIO:**
1. **Generar claves VAPID** una vez: `npx web-push generate-vapid-keys`. La pública va al entorno
   de build como `EXPO_PUBLIC_VAPID_PUBLIC_KEY`; la privada + un `mailto:` van como secretos de las
   Edge Functions: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
2. **Redesplegar** `send-notifications` + `send-push` (traen el canal Web Push).
3. **Aplicar migraciones en orden de nombre:** `0036`→`0036c`→`0037`→`0038`→`0039`→`0040` (el
   renombre de las RPCs de moderación a `0040` hace que el orden lexicográfico sea seguro: `0040`
   referencia `messages.imagen_url` que crea `0038`).
4. **Subir la web** (drag-and-drop de `dist` a Cloudflare) — con `EXPO_PUBLIC_VAPID_PUBLIC_KEY` en
   el build; sin ella, el push web degrada a "no soportado" sin romper nada.
5. **Hacerte admin:** `update profiles set es_admin=true where id='<tu uuid>'`. Sin eso, la fila
   "Moderación" no aparece para nadie.
Verificación E2E de las 4 funciones en la app real queda para post-despliegue (los RPC/columnas no
existen en prod hasta aplicar las migraciones; la app degrada en silencio mientras tanto).

## 🗓️ SESIÓN 2026-07-22 (4) — Tanda "difusión + PWA" (3 agentes en paralelo)

Spec `docs/superpowers/specs/2026-07-22-tanda-difusion-pwa-design.md`, plan
`docs/superpowers/plans/2026-07-22-tanda-difusion-pwa.md`. Subagent-driven (3 implementadores
en worktrees + revisor por rama + revisión final adversarial + fix wave + verificación
integrada). **773 tests / 72 suites, tsc limpio.** En `feat/mvp-encuentra-mascota`
(merges `tanda7/*`; HEAD `c1dfe24`). **⚠️ Lista para subir: falta el drag-and-drop de Pablo.**

1. **Vista previa al compartir links (`public/_worker.js`, Cloudflare advanced mode):** OG/Twitter
   tags con foto para `/mascota/:id` y `/adopcion/:id` (PostgREST anon + RLS decide qué se ve;
   reunida → "¡Volvió a casa!", adoptada → "¡Ya encontró familia!"). Escapado XSS en TODO dato
   de usuario (primer HTML server-side de la app), fail-open 2s, fallback SPA (rol de
   `_redirects`), 5 cabeceras de seguridad + `no-cache` en HTML, `immutable` para
   `/_expo/static/` (solo respuestas OK), pass-through explícito de `/borrar-cuenta`, e
   inyección de las tags PWA en todo HTML. **Hechos verificados:** drag-and-drop soporta
   `_worker.js` (la carpeta `functions/` NO); en advanced mode `_headers`/`_redirects` dejan de
   regir (quedan como rollback: borrar `dist/_worker.js` y re-subir). **Dato del runtime real:**
   Workers rechaza named exports no-función (todo cuelga del default) y un handler llamado
   `fetch` sombrea al global — jest no lo ve, `wrangler pages dev` sí.
2. **PWA instalable:** `manifest.webmanifest` (colores = lightColors reales), íconos
   180/192/512/maskable desde `assets/icon.png`, `sw.js` conservador (nunca intercepta
   Supabase; cache-first solo hasheados con tope LRU 60; navegación network-first, fallback
   offline SOLO desde `/`; espejo `estrategiaPara` con `src/lib/pwa/decisionCache.ts` protegido
   por test de sincronía que lee ambos archivos), `registrar-sw.js`, captura de
   `beforeinstallprompt` en el arranque web (App.tsx), tarjeta descartable en Inicio + fila en
   Perfil, modal iOS de 2 pasos.
3. **Tarjetas nuevas:** `DatosTarjeta` genérico (la de reportes NO cambió su comportamiento,
   tests sin cambios de expectativa); adopción "BUSCA HOGAR [EN COMUNA]" (#17654B, QR a
   `adopcionUrl`, botón para cualquiera en el detalle + oferta post-publicar) y final feliz
   "¡VOLVIÓ A CASA!" (#1E8A63, `final_foto ?? fotos[0]`, "X días después" vía `diasEntre`,
   oferta post-confetti + botón en detalle propio).

**Verificación integrada (wrangler + Playwright, TODO PASA):** worker sirviendo manifest/sw/
íconos con content-types correctos; OG real con un reporte de prod; SPA byte-idéntico; 5
cabeceras; tarjeta de instalación (aparece con el evento, ✕ persiste); fila de Perfil
capturada; tarjeta de adopción real descargada 1080×1080 ("BUSCA HOGAR EN SANTIAGO") con
adopción de prueba creada y borrada; 0 errores de consola.

**Diferidos anotados:** 4xx/5xx sin fallback a caché (decisión documentada en sw.js); `esIos`
no ve iPad-desktop; `diasEntre` asume ISO con TZ; el worker titula reunida solo con
`reunida_en` (cliente exige además `activo=false` — hoy coherentes); caché del feed de
adopción no se invalida al publicar/borrar en la misma sesión (preexistente).

**Post-deploy a verificar (checklist):** pegar un link `/mascota/:id` en WhatsApp → vista
previa con foto; `curl -I` a `/manifest.webmanifest`, `/sw.js` y un bundle (content-types y
qué headers aplica Pages en advanced mode REAL); instalar la app desde Chrome Android;
Lighthouse instalabilidad; y el pendiente heredado: tarjeta CON foto en navegador real.
Residuo local: `C:\Users\pdani\em-agente-a\.wrangler` bloqueado por un handle (borrar tras
reiniciar). En prod sigue el reporte de prueba viejo de Pablo (a propósito).

## 🗓️ SESIÓN 2026-07-22 (3) — Tanda de 6 funciones + pulido de adopción (4 agentes en paralelo)

Spec `docs/superpowers/specs/2026-07-22-tanda-6funciones-pulido-design.md`, plan
`docs/superpowers/plans/2026-07-22-tanda-6funciones-pulido.md`. Ejecutado subagent-driven con
**4 implementadores en paralelo** (worktrees manuales `em-agente-a..d`, junction de node_modules,
puertos 8092-8095) + revisión por rama + fixers + **revisión final de rama adversarial** + fix
wave único. **700 tests / 69 suites, tsc limpio.** Fusionado en `feat/mvp-encuentra-mascota`
(merges `67e6102` C → `2e22157` B → `fa5ca8f` D → `c02da2f` A; HEAD `b53cd70`).

**Lo nuevo:**
1. **Tarjeta compartible 1080×1080** (F1): `TarjetaCompartir` (vista pura, paleta CLARA fija) +
   `TarjetaGenerador` (contenedor dueño de ref/captura/compartir, patrón AficheGenerator) +
   `compartirTarjeta` (Web Share con archivo gateado por canShare → fallback descarga; nativo
   expo-sharing; cancelar = silencio). Entradas: detalle + post-publicar. PNG verificado con
   Pillow (1080×1080, banda "PERDIDA EN SANTIAGO").
2. **Búsqueda guardada con aviso** (F2, mig `0031`): tabla con RLS solo-dueño, tope 5 (trigger),
   índice único `busquedas_guardadas_unicas`, trigger `enqueue_busquedas_guardadas` (security
   definer, `target_user_id`, dedup `distinct on`); CHECK de la cola con 6 tipos; notifyTargets
   ×2 espejo (opt-in: no filtra por pref zona, sí canales); dispatcher con branch propio — e
   incluye un fix real: **pedía las prefs del AUTOR en vez del buscador**. UI: botón "Avisarme
   de esta búsqueda" en Explorar (requiere comuna + estado concreto) + "Mis búsquedas" en Perfil.
3. **Preguntas públicas en adopciones** (F3, mig `0032`): 1 respuesta del dueño por pregunta,
   grant columnar (update solo `respuesta`/`respondido_en`, patrón 0018), lectura hereda la RLS
   de adoptions vía exists, moderarTexto en preguntar/responder, denuncias tipo
   `'pregunta_adopcion'` (drop robusto por pg_constraint).
4. **Guía "encontré una mascota"** (F4): espejo de la de perdida, 7 pasos, CTAs anidados
   absolutos, tests de navegación NO tautológicos (leen los navigators reales con readFileSync).
5. **Filtro por comuna en Adopción** (F5, mig `0033`): `buscar_adopciones` recreada (drop con
   firma completa de 10 params) con `p_comuna`; cuerpo verificado VERBATIM contra la 0030 (el
   cursor no se tocó); chip de comuna en el feed.
6. **Carnet "Mi mascota"** (F6, mig `0034`): fecha_nacimiento + 3 próximas dosis (CHECKs con
   fechas fijas, no current_date); libs puras `edadDesde`/`recordatorios` (hoy como parámetro);
   formulario día/mes/año (patrón RegisterScreen, no hay DateTimePicker), carnet en la ficha,
   banner en Mis mascotas e Inicio.
7. **Pulido adopción:** `EditAdoptionScreen` (moderación también al editar; campos editables por
   tipo; sin zombi: goBack+navigate, headerLeft custom, BackHandler, gestureEnabled:false,
   `initial:false` al abrirlo), encabezado del chat de adopción → detalle (navigate pelado hacia
   ARRIBA, correcto), y **push data.ruta**: `rutaANavegacion` (adopcion/mascota/mis-mascotas) +
   listener nativo + **tap pendiente en arranque frío** (destino guardado y consumido en onReady).

**Lo que cazó la revisión final (el patrón se repite):** 1 Critical — CTA muerto: la firma del
autor de una pregunta navegaba a `PublicProfile` con nombre pelado desde el stack raíz (tercera
vez que aparece esta clase de bug; fix = anidada absoluta). Además: 6 restricciones nuevas sin
traducción en dbErrors; y **una regla de despliegue nueva**: la Edge Function `send-notifications`
se redespliega **ANTES** de aplicar la 0031, porque el dispatcher viejo consume los eventos
`busqueda_guardada` marcándolos `enviado` sin enviarlos (sin reintento). De la reconciliación
del merge salió otro hallazgo: `navigate('Mapa')` post-publicar era un **destino muerto
preexistente** desde las 5 pestañas → 'Explorar'.

**Verificación visual pre-migración (Playwright, 7/7 PASA):** guía encontrada + preselección
"Encontrada"; portero al publicar como invitado; tarjeta descargada y medida; degradaciones
amables SIN jerga Postgres en Mis búsquedas y el feed de adopción (que falla a propósito hasta
la 0033 porque el cliente ya manda p_comuna); carnet renderiza; modo oscuro OK en lo nuevo.
⚠️ En headless la foto de la tarjeta no rasteriza (bloque verde) — mismo mecanismo del afiche
que ya anda en prod; **confirmar con navegador real tras subir la web**.

**Diferidos anotados (menores):** timeout de `fotoParaCaptura` sin race; tipos MyPet sin modelar
`undefined` pre-migración; `crearEstilos` sin usar colors en GuardarBusquedaButton; copy "tu
zona" con match solo por alcance; "Responde quien la publicó" vs "Un vecino"; 2 focus listeners
en AdopcionDetail; el dueño puede preguntar en su propia adopción; mensaje del tope-5 cuando el
duplicado también choca con el índice único.

**✅ DESPLEGADO (22-jul, con el PAT de Pablo):**
1. **Edge Functions redesplegadas** `send-notifications` + `send-push` (ANTES de la 0031, según
   la regla nueva). Guardianes verificados: OPTIONS→204, GET sin token→401.
2. **Migraciones `0031`→`0034` aplicadas** (HTTP 201 ×4) **+ `0035`** (revoca escrituras de
   `anon` en las 2 tablas nuevas, defensivo — la RLS ya bloqueaba: PATCH masivo como anon con
   `return=representation` → `[]`). Verificado contra la base: CHECK cola 6 tipos, índice único,
   1 sola firma de `buscar_adopciones` con `p_comuna`, 4 columnas carnet, RLS+triggers (el del
   tope se llama `trg_limite_busquedas_guardadas`), grant columnar OK, ataques anon rechazados.
3. **E2E visual post-migración: 5/5 PASA** (Playwright contra la base real, datos de prueba
   creados y borrados): búsqueda guardada guardar/duplicado-409-amable/borrar; feed adopción
   con chip comuna; pregunta+respuesta+borrar; carnet con edad "2 años y 4 meses" + estados
   vencida/vence-pronto + banner en Inicio; editar adopción refrescado y sin zombi.
4. **`dist` regenerado** (bundle `index-084db396…js` + chunk de code-splitting del
   `import()` de expo-sharing — los DOS archivos en `_expo/static/js/web/` son correctos),
   `borrar-cuenta` quitado, `_headers`/`_redirects` presentes.

**✅ WEB SUBIDA (22-jul, Pablo)** — verificada en produccion: bundle `index-084db396…` servido, ruteo SPA 200, chunk de expo-sharing 200, cabeceras de seguridad presentes, onboarding aparece en primer arranque y al saltarlo estan las 5 pestañas + guia nueva, 0 errores JS. Instrucciones originales: — drag-and-drop de `dist` a Cloudflare (manual de
Pablo): Deployments → Create new deployment → rama `main` → arrastrar la carpeta `dist`.
Sube TODO lo acumulado: adopción, 5 pestañas, modo oscuro y esta tanda.
**Tras subir, probar en el navegador de verdad:** que la TARJETA salga con la FOTO (en headless
no rasterizaba — mismo motor del afiche que anda en prod, pero confirmarlo).

**Observaciones menores nuevas del E2E (diferidas):** el feed de adopción no invalida su caché
justo después de publicar (aparece tras reload); la URL de EditAdoption muestra
`?adoption=%5Bobject%20Object%5D` (cosmético, los datos viajan por navigation state); un
textarea huérfano invisible persiste en el DOM al navegar del detalle a Editar. Sigue en la
base el reporte de prueba viejo de Pablo ("REPORTE DE PRUEBA (Playwright)", pre-tanda, se dejó
a propósito como huella — borrable desde Perfil).

**Infra/aprendizajes de la sesión:** los subagentes ya NO pueden escribir archivos de informe
(política del harness) → los informes vuelven inline y el orquestador los persiste él mismo;
`expo-font`/`expo-asset` y `@types/react-test-renderer` FALTAN en node_modules → los tests de
componentes importan `../ui/AppText` directo (NO "arreglar" al barrel `../ui`: rompe jest) y hay
un `src/types/react-test-renderer.d.ts` ambient; residuo en prod: una 2ª cuenta de prueba del
agente C sin autoborrar (el CORS de delete-account bloquea localhost — correcto en prod).

## 🗓️ SESIÓN 2026-07-22 (2) — Modo oscuro (refactor transversal)

Spec/plan en `docs/superpowers/*/2026-07-22-modo-oscuro*`. Ejecutado **subagent-driven** (infra
inline + 4 subagentes en paralelo para la conversión mecánica + gate + ajuste visual).
**554 tests, tsc limpio.** Fusionado en `feat/mvp-encuentra-mascota` (`ca609d6`).

- **Enfoque A (de verdad):** `ThemeProvider` + hook `useColors()` reemplazan al `colors`
  estático. **~54 archivos** pasaron de `StyleSheet.create` a nivel de módulo al patrón
  DINÁMICO (`const colors = useColors(); const styles = useMemo(() => crearEstilos(colors), [colors])`).
  Dos paletas en `src/theme` (light = la de siempre; dark = cálida, no negro puro). Sigue el
  sistema por defecto (`useColorScheme`), cambio **en vivo**, y **selector Automático/Claro/
  Oscuro** en Perfil (invitado y autenticado; pref en `src/lib/temaPref.ts`).
- **Navegación + StatusBar** siguen el tema (`NavigationContainer` theme, headers/fondo
  dinámicos, tabBar). **Assets imprimibles** (`AfichePoster`, `CollarTag`) quedan fijos en
  paleta CLARA (un afiche/placa impreso no puede salir oscuro).
- **Red de seguridad que funcionó:** al quitar el alias `colors` estático, `tsc` dio **0
  errores** → prueba de que NINGUNA pantalla quedó sin convertir. Auditoría de `colors.white`:
  los restantes son texto sobre color, puntos del carrusel (sobre foto) o la placa imprimible.
- **Verificado visual** (Playwright, `prefers-color-scheme: dark`): Inicio, Explorar, Registro,
  Perfil y onboarding en oscuro — paleta equilibrada, buen contraste, tono cálido; no necesitó
  ajustes de valores.
- ⚠️ **Falta subir la web** (drag-and-drop de `dist` a Cloudflare); regenerar `dist` con
  `npx expo export --platform web` (borrar `dist/borrar-cuenta` hasta tener el correo).

## 🗓️ SESIÓN 2026-07-22 — 3 mejoras de comunidad + arreglos de UX

Spec en `docs/superpowers/specs/2026-07-22-mejoras-comunidad-design.md`. `tsc` limpio, **550
tests**. Fusionado en `feat/mvp-encuentra-mascota`. Modo oscuro queda para una tanda aparte
(refactor transversal del sistema de colores).

- **🏥 Ayuda rápida (`AyudaScreen`):** en vez de una lista curada que se desactualiza, abre el
  mapa del teléfono con la búsqueda hecha (veterinarias / urgencia 24h / refugios, vía
  `Linking` + `src/lib/mapas.ts`) + recursos nacionales (Registro Nacional de Mascotas) + qué
  tener a mano. Enlazada desde la guía "recién se me perdió" (paso de vets) y desde Perfil.
- **👋 Onboarding (`OnboardingScreen`):** 4 slides de bienvenida solo en el primer arranque
  (flag local en `src/lib/onboarding.ts`; gate en `RootNavigator`). Saltable. Verificado en
  vivo (aparece, se cierra a Inicio).
- **🏡 "Volvieron a casa" (`VolvieronACasaScreen`):** galería completa de reencuentros
  (foto + historia `final_feliz`), con "Ver todas" desde la tira de Inicio.

**Arreglos de UX de esta sesión (feedback de Pablo):**
- **Botón de volver** en las pantallas empujadas al stack raíz que no eran tab y quedaban sin
  volver (`Mensajes`/`AdopcionDetail`/`MascotaPublica`/`Collar`).
- **Filtros colapsables en Explorar:** botón "⚙ Filtros" (con contador) que despliega/oculta
  el panel de chips; cerrado por defecto (antes eran 6 filas siempre visibles).
- **`SafeAreaProvider` en la raíz** (`App.tsx`): el onboarding se renderiza fuera del
  `NavigationContainer`; sin esto `<Screen>` reventaba con "No safe area value available".
- ⚠️ **Falta subir la web** (drag-and-drop de `dist` a Cloudflare); el `dist` se regenera con
  `npx expo export --platform web` (recordar borrar `dist/borrar-cuenta` hasta tener el correo).

## 🗓️ SESIÓN 2026-07-21 (noche 2) — Navegación de 5 pestañas (tab bar apretado)

Con la 8ª pestaña (Adopción) el tab bar quedó apretado. Se pasó a **5 pestañas**
(`Inicio · Explorar · Publicar(+) · Adopción · Perfil`). Ejecutado **inline** (executing-plans),
7 tareas, `tsc` limpio, **547 tests**, verificado visual con Playwright. Spec/plan en
`docs/superpowers/*/2026-07-21-navegacion-5-pestanas*`. Fusionado (`cbb3d1c`).

- **`ExplorarScreen`** unifica las viejas Mapa + Lista + Comunidad: dueña de los filtros +
  un **toggle Lista/Mapa** (abre en Lista); ambos cuerpos comparten el mismo `filtros`, así
  alternar de vista conserva la búsqueda. Se extrajeron `ReportesLista`, `ReportesMapa` (ahora
  **respeta los filtros**, antes traía todo) y `SeguirComunaButton` (el "Avisarme de [comuna]"
  de Comunidad, aparece cuando hay filtro de comuna). Se **borraron** `ListScreen`, `MapScreen`,
  `ComunidadScreen`.
- **Mensajes** dejó de ser pestaña: `MensajesButton` (ícono chat + badge de no leídos) en el
  encabezado de Inicio/Explorar/Adopción; abre la bandeja `MsgStack`, ahora registrada en el
  **stack raíz** como `Mensajes`. Portero para invitados mantenido.
- **Destinos reapuntados** (`'Mapa'`/`'Lista'`/`'Comunidad'` → `'Explorar'`): `PublishScreen`,
  `HomeScreen` (con la comuna preseteada desde "En tu comuna"), y la guía (`guiaPerdida`).
- **Sin migración ni cambios de datos.** Verificado en el navegador: barra de 5 con aire, el
  ícono de Mensajes arriba, Explorar abre en Lista, el toggle a Mapa conserva los filtros.
- **Ajustes post-feedback (22-jul):** (1) **botón de volver** en las pantallas empujadas al
  stack raíz que no eran tab y quedaban sin volver — `MascotaPublica`/`Collar`/`AdopcionDetail`
  activan el header nativo (ya tenían title), y `ConversationsScreen` (Mensajes) suma una flecha
  de volver en su encabezado propio (`goBack`); (2) **filtros colapsables en Explorar** — botón
  "⚙ Filtros" (con contador de activos) que despliega/oculta el panel de chips, cerrado por
  defecto, así la lista/mapa se ve enseguida (antes eran 6 filas de chips siempre visibles).
  Verificado visual: colapsado limpio + abierto con todos los chips. 547 tests, tsc limpio.
- ⚠️ **Falta subir la web** para que salgan a producción (drag-and-drop de `dist` a Cloudflare).
  El `dist` ya está regenerado con los dos ajustes (bundle `index-c83d98ba…`).

## 🗓️ SESIÓN 2026-07-21 (noche) — Apartado de Adopción (feed tipo Instagram)

Construido **subagent-driven** (12 tareas: implementer + revisión por tarea + revisión
final de rama). Spec `docs/superpowers/specs/2026-07-21-adopcion-design.md`, plan
`docs/superpowers/plans/2026-07-21-adopcion.md`. **547 tests, tsc limpio.** Fusionado en
`feat/mvp-encuentra-mascota` (`6256ec7`).

- **Sección aparte** (tabla `adoptions`, mig `0030`): no contamina los reportes; en el feed
  solo aparecen animales en adopción. Campos: especie/nombre/descripción/fotos + edad,
  tamaño, esterilizado, vacunas (`al_dia/no/no_se`), convive niños/perros/gatos, requisitos.
  Ubicación difuminada. RLS: pública solo de activas/no-ocultas/no-adoptadas **o** del dueño.
  RPC `buscar_adopciones` (cursor con el arreglo de la 0015). La `0030` también amplía
  `denuncias.tipo` con `'adopcion'` (drop robusto por `pg_constraint`, no por nombre).
- **Feed tipo Instagram** (8ª pestaña "Adopción"): fotos grandes + carrusel, corazón para
  guardar, "Quiero conocerlo" (chat), chips de especie/tamaño, recientes/cerca, scroll
  infinito, pull-to-refresh. Publicar (FAB) con moderación de texto + confirmación de imagen.
  Detalle público `/adopcion/:id` (modo invitado) con "¡Ya encontró familia!" (Confetti) +
  borrar + denunciar. Guardar (tabla `adoption_saves` + provider) y sección en "Guardados".
- **Chat generalizado a `HiloCtx`** (lo delicado): `messages` suma `adoption_id`; el mismo
  chat sirve reportes y adopciones. La trampa del `.is('pet_id', null)` (un mensaje de
  adopción tiene `pet_id` null y podría colarse en un hilo de reporte-borrado) quedó cerrada
  en los 4 caminos (listMessages, markThreadRead, realtime, agrupado). Verificado por la
  revisión adversarial dedicada.
- **Los 2 Critical que cazó la revisión (ambos de navegación, ninguno lo vio un test):**
  (1) la RLS de `adoptions` arrancó con `using(true)` y exponía por la API REST las ocultas/
  adoptadas → cerrada como `0004_public_read`; (2) el botón "Quiero conocerlo" del **detalle**
  usaba `navigate('Chat')` relativo desde el stack raíz (CTA muerto, incluido el único camino
  de contacto de un link compartido) → arreglado con navegación anidada absoluta, patrón de
  `PublicPetScreen`. Ambos arreglados y verificados.

**⚠️ PENDIENTE del usuario / deploy:**
1. **Aplicar la migración `0030`** a Supabase (API admin con PAT). **OBLIGATORIO antes de
   subir la web**: el chat generalizado usa `adoption_id` sin degradación, así que sin la
   `0030` aplicada se rompería el chat de reportes existente en producción.
2. **Redesplegar `send-push`** (cambió: ahora manda `data.ruta`) y **subir la web**.
3. Menores para v1.1: editar una publicación de adopción (hoy: borrar + marcar adoptada);
   cablear el encabezado del chat de adopción al detalle; consumir `data.ruta` del push.

## 🗓️ SESIÓN 2026-07-21 (tarde) — Tanda de 4 funciones nuevas en paralelo

Cuatro funciones construidas **en paralelo con 4 agentes** (una rama/worktree cada una),
fusionadas con revisión final de rama. Specs en `docs/superpowers/specs/2026-07-21-*` (uno
por función + nota de coordinación); plan en `docs/superpowers/plans/2026-07-21-tanda-4funciones.md`.
**`tsc` limpio, 455 tests (49 suites)**, todo en `feat/mvp-encuentra-mascota`.

1. **Aviso proactivo de coincidencias** (mig `0026`): al publicarse un reporte, un trigger
   `enqueue_coincidencias` encola avisos `tipo='coincidencia'` para el dueño de cada reporte
   opuesto que calza (misma lógica que `buscar_coincidencias`) y uno al que recién publicó.
   Reusa la cola + dispatcher + cron ya desplegados. Preferencia `coincidencias` (ya existía
   en 0011) por fin cableada. Texto en `notifyTargets.ts` (+ espejo).
2. **Ficha "Mi mascota" + collar con QR** (mig `0027`): tabla `my_pets` (RLS solo-dueño,
   `collar_token` de 128 bits del servidor); pantalla "Mis mascotas" en Perfil; "Reportar
   como perdida" pre-carga Publicar (col nueva `pets.origen_my_pet`); etiqueta de collar
   imprimible con QR; pantalla pública `/collar/:token` (RPC `mascota_por_collar` que **nunca
   filtra contacto/chip/señas**, guardrail de privacidad con test) + "avisar que la vi" (RPC
   `avisar_escaneo_collar` → aviso `tipo='escaneo_collar'` al dueño; la cola sumó `pet_id`
   nullable + `target_user_id`).
3. **Ciclo de vida del reporte** (mig `0028`): col `renovado_en`; **auto-archivado perezoso
   sin cron** — `buscar_reportes` (recreada desde la **0021**, conservando el arreglo del
   cursor de la 0015 + `p_comuna`) excluye lo no renovado en 45 días; nudge in-app a los
   14/30 días ("¿ya volvió?") en el detalle propio y realce de vencidos en "Mis reportes";
   `renovarReporte`/`archivarReporte`.
4. **Guía "recién se me perdió"** (sin migración): `GuiaPerdidaScreen` con checklist (estado
   local, degrada si falla), entrada desde Inicio y ofrecida tras publicar una perdida.

**Reconciliación en el merge** (lo que se cae ENTRE tareas): unión de `'coincidencia'` +
`'escaneo_collar'` en las 2 copias de `notifyTargets.ts` (test-espejo verde) y en el CHECK de
`notification_events.tipo`; navegación (`GuiaPerdida` + `Collar`); `PublishScreen`
(`origenMyPet` + oferta de guía). **Mig `0029`** de reconciliación: un reporte vencido no
genera ni recibe coincidencias (filtro de vigencia en `enqueue_coincidencias` y
`buscar_coincidencias`; va después de la 0028 porque `renovado_en` nace ahí).

**Revisión final de rama (adversarial) — 2 hallazgos, ambos arreglados:**
- 🟠 **ALTO-1**: los botones de la guía navegaban a los tabs por **nombre pelado** desde el
  stack raíz → React Navigation burbujea hacia arriba y no los encontraba (**CTAs muertos**);
  el test que lo "cubría" era **tautológico** (whitelist local). Fix: `navigate('App',
  {screen, params})`, el patrón de `PublicPetScreen`. **Verificado en vivo con Playwright**:
  Inicio → Guía → "Publicar mi reporte" abre el tab Publicar con "Perdida" pre-seleccionada.
- 🟠 **MEDIO-1**: `PublishScreen` leía `route.params` solo en los inicializadores de
  `useState`, así que reportar desde una ficha con el tab Publicar ya montado **perdía la
  pre-carga y `origenMyPet`** (el vínculo ficha↔reporte). Fix: `origenMyPet` pasa a estado +
  `useEffect` que re-aplica la pre-carga con params nuevos.
- Los 7 puntos SQL/lógica (buscar_reportes conserva cursor+comuna, CHECK unión, espejo
  idéntico, privacidad del collar, `pet_id` nullable sin romper triggers, `createPet`/guía,
  0029) quedaron **correctos**.

**✅ DESPLEGADO (21-jul):**
1. **Migraciones `0026`→`0027`→`0028`→`0029` APLICADAS y VERIFICADAS** contra la base real
   (API admin con PAT): CHECK de `tipo` con los 5 valores; `my_pets` con RLS solo-dueño +
   `origen_my_pet` + token 128-bit del servidor; `pet_id` nullable + `target_user_id`; 2 RPCs
   del collar; `renovado_en` + backfill (0 filas sin renovar); `buscar_reportes` recreada con
   14 params (comuna+cursor) devolviendo `renovado_en`; filtro de vigencia en las 2 funciones
   de coincidencia. **Ataque de privacidad del collar PASADO:** como `anon`, leer `my_pets`
   directo → 0 filas y chip secreto no sale (RLS); `mascota_por_collar` → solo nombre/especie/
   foto, nunca chip/señas/contacto. Fila de prueba borrada.
2. **Edge Function `send-notifications` REDESPLEGADA y verificada:** `OPTIONS` → 204 (guardián
   de método cerrado), `GET` → 401 (gateway pide auth).

**⚠️ PENDIENTE del usuario:**
3. **Subir la web** (`npx expo export --platform web` → Cloudflare → arrastrar `dist`) — es
   manual (drag-and-drop). Hasta entonces la web en producción tiene el bundle viejo.
4. Verificación end-to-end de func.1/2/3 en la app real (ya con base + función listas): solo
   se probó visualmente la func.4 (guía). Recordar: Brevo/Resend en modo prueba, así que los
   avisos por correo solo llegan a `pdanielespinozavega@gmail.com` hasta verificar un dominio.

## 🗓️ SESIÓN 2026-07-21 — Bloqueos de tienda (3 de 3 construidos)

De los requisitos que **impiden publicar** en App Store / Play, se resolvieron los tres
que **no dependen de datos del usuario** (correo, nombre legal, dominio quedan fuera).
Spec en `docs/superpowers/specs/2026-07-21-bloqueos-tienda-design.md`. Commit `db3b9e8`.
`tsc` limpio, **375 tests** (+11), verificado en navegador.

1. **Filtro proactivo al publicar** (Apple 1.2). `src/lib/moderarTexto.ts` — función pura
   con **11 tests**, **conservadora a propósito**: bloquea odio/discriminación, sexual
   explícito y **venta de animales** (co-ocurrencia verbo-de-venta + término-de-animal).
   Anti-falso-positivo por diseño: **NO** filtra el coloquial chileno (weón, etc. — no es
   "objetable" para Apple y frenaría gente de buena fe), match por **palabra completa**
   (evita Scunthorpe), y `sexo`/`sexual` a secas **excluidos** porque un reporte legítimo
   dice "sexo: macho". Enganchado en `PublishScreen.onSubmit` (antes de subir fotos) **y**
   en `EditPetScreen.onSubmit` (editar era el bypass obvio).
2. **Control de imagen SIN IA** (decisión del usuario): **casilla de confirmación** sin
   premarcar en Publicar ("la foto es de la mascota y respeta las reglas de la comunidad",
   enlaza a Legal). El control real de imagen sigue siendo denunciar+bloquear (Tanda B) +
   retiro. Cero costo, ninguna API externa, nada que declarar (Ley 21.719).
3. **Página web de borrado** `public/borrar-cuenta/index.html` — pública, **sin login**
   (la exige Google, no Apple). HTML autocontenido con estilo de marca; espejo de
   `DeleteAccountScreen` (qué se borra / qué queda) + método in-app + método por correo +
   plazo 30 días. Se sirve en `/borrar-cuenta/` (Cloudflare sirve estáticos antes del
   catch-all SPA).
4. **`app.config.ts`**: `POST_NOTIFICATIONS` (sin esto no llega push en Android 13+),
   `blockedPermissions: [ACCESS_BACKGROUND_LOCATION]`, `NSPhotoLibraryUsageDescription`, y
   los 3 purpose strings alargados (fórmula que Apple acepta: qué + para qué + beneficio).
   Validado con `npx expo config --type public`.

**Verificación visual (Playwright, 21-jul):** la página de borrado renderiza bien con el
marcador `[[CORREO_CONTACTO]]` resaltado; login OK; la casilla renderiza sobre Publicar;
publicar con texto ofensivo → **bloqueado** con el diálogo exacto *"Revisá el texto — El
texto tiene términos ofensivos o discriminatorios."* (sin subir foto ni escribir en la base).

**⚠️ Pendientes de estos bloqueos (dependen del usuario, NO son bugs):**
- **La página de borrado NO es subible** hasta reemplazar `[[CORREO_CONTACTO]]` por el
  correo real (mismo bloqueo que los 36 `[[PENDIENTE]]` legales, no uno nuevo).
- Los cambios de `app.config.ts` recién aplican **al armar el build nativo (EAS)**; la web
  no los usa.
- **Bloqueos de tienda que siguen abiertos:** filtro proactivo de **imagen** más fuerte (se
  eligió no hacerlo), y el **correo de contacto** visible in-app (`LegalScreen`, ya
  parametrizado con `CORREO_CONTACTO = null`).

## 🗓️ SESIÓN 2026-07-20 — Tandas 1, 2 y 3

Plan de **3 tandas** (1 → 2 → 3): **las tres construidas** esta sesión.

### 🟣 Tanda 3 — Comunidad por comuna (A+B+C+D)

Sistema de comunas. Construida en fases; C y D con **agentes en paralelo**. `tsc` limpio, **324 tests**.
- **Fundación** (commit `59daabe`): `src/data/comunas.ts` (345 comunas de Chile con centro, de datos abiertos geo-chile, Recoleta/Coltauco corregidas); helpers puros `src/lib/comunas.ts` con TDD (`comunaDeCoords`, `comunasCercanas`, `buscarComunas`); **migración `0020`** (pets.comuna + comunas_alcance + índices, notification_prefs.comunas_seguidas, el evento reporte_nuevo lleva la comuna); **publicar con comuna** auto-sugerida del punto + selector buscable + chips de comunas vecinas (**sub-feature B**).
- **Fase 2 — Feed (A)** (commit `9f16b39`): **migración `0021`** (`buscar_reportes` con filtro `p_comuna`, casa o alcance, sin tocar el cursor); `contarReportesEnComuna`; componente `ComunaPickerModal` (reusado, PublishScreen migrado); **pestaña Comunidad** (`ComunidadScreen`: feed + conteo + seguir comuna); `comunasSeguidas.ts`; selector de comuna en la Lista; sección "En tu comuna" en Inicio. ⚠️ Quedaron **7 pestañas** (apretado en pantallas chicas; se puede consolidar).
- **Fase 3 — Aviso por comuna (C)** (commit `a1f2c71`): `resolverDestinatarios` suma un 2.º camino en `reporte_nuevo` — quien **sigue** la comuna recibe el aviso, ADEMÁS del de zona GPS. Opt-in explícito → NO se filtra por la preferencia `zona`; sí dedup con zona, excluye al actor, respeta canales. Cambiado en las **dos copias espejo** de `notifyTargets` + la Edge Function (`armarContexto` consulta `comunas_seguidas`). Test-espejo verde.
- **Fase 4 — Compartir (D)** (commit `46a0cf6`): `buildShareText` dice "🔴 PERDIDA en [comuna]" cuando hay comuna.

**Pendiente del usuario para la Tanda 3:**
1. ✅ **Migraciones `0020` y `0021` APLICADAS y VERIFICADAS (20-jul)** contra la base real: `pets.comuna`/`comunas_alcance` existen, `buscar_reportes` acepta `p_comuna`, `notification_prefs.comunas_seguidas` existe.
2. ✅ **Edge Function REDESPLEGADA y verificada (20-jul)**: `OPTIONS` sin credenciales → 204; `POST` con la clave pública → `{"ok":true,"procesados":0,"fallidos":0}`. El aviso por comuna está activo.
3. ✅ **Web SUBIDA y verificada (20-jul)**: producción sirve el bundle nuevo `index-503de3bd…js` y el ruteo SPA funciona (`/mascota/…` → 200). Las tandas 1/2/3 + B/C(edad)/D están en producción.
4. ✅ **Smoke test visual con Playwright (20-jul) contra producción — COMPLETO, todas las tandas ejercitadas:**
   - **Tanda 1:** saludo "¿Buscamos juntos, Pablo Prueba?" (nombre, no correo) + inicial "P".
   - **Tanda 3:** pestaña Comunidad + selector (búsqueda "maip" sin tilde → Maipú/Isla de Maipo/San José de Maipo) + "Maipú · 0 reportes activos" + botón "Avisarme de Maipú"; chip "Filtrar por comuna" en Lista; **publicar** con "Comuna: Santiago" auto-sugerida + chips de vecinas → reporte publicado OK.
   - **Tanda C:** rechazo por edad <14 con mensaje en español y sin crear cuenta; y registro con edad válida OK.
   - **Tanda B:** con una 2.ª cuenta, abrir el reporte → "Publicado por Pablo Prueba" → perfil público → botones **Denunciar + Bloquear** → bloqueo confirmado ("Persona bloqueada").
   - **Tanda 2:** perfil público con portada, tiles (Reencuentros 0 · Reportes 1 · Aportes 0) y secciones.
   - ⚠️ **Datos de prueba que quedaron en producción:** un reporte de Pablo ("Perro… REPORTE DE PRUEBA" + su foto), la cuenta `pwvecino…@example.com` ("Vecino Prueba"), y un bloqueo (Vecino → Pablo). Borrables desde la app si se quiere; o quedan como huella.

### 🏪 Tandas B, C(edad) y D — construidas con 3 agentes en paralelo (20-jul)

Sobre la base de las tandas 1-3, tres tandas más **en paralelo** (agentes, archivos disjuntos, migraciones asignadas). `tsc` limpio, **364 tests**. Revisé a mano la RLS de bloqueo y las funciones compartidas antes de commitear.
- **Tanda B — bloquear + denunciar** (commit `14e0cca`): bloqueador de tiendas. Migración `0022` (tabla `bloqueos` con **RLS asimétrica** —nadie sabe quién lo bloqueó—, `hay_bloqueo_con(otro)` security definer de un parámetro, y la policy de insert de `messages` rechaza al bloqueado en el servidor) + migración `0025` (denuncias generalizadas: `tipo/objeto_id/usuario_denunciado/detalle`, `pet_id` nullable — **la creé yo**, ningún agente la tenía asignada). `bloqueos.ts` + `moderation.ts` (denunciar reporte/usuario/mensaje/pista/avistamiento), botones en perfil público/chat/detalle, ocultado de contenido de bloqueados.
- **Tanda C (solo EDAD)** (commit `1a728b6`): mínimo 14 + fecha de nacimiento en el registro. Migración `0024` (`profiles.fecha_nacimiento` privada, `handle_new_user()` la guarda, `mi_perfil()` la devuelve). **El resto de C (legal, correo de contacto, página de borrado de Google) sigue PARADO** esperando: correo de contacto, nombre legal, y revisar los `[[PENDIENTE]]` de los docs legales.
- **Tanda D — rendimiento/costos** (commit `ae69795`): migración `0023` (purga de la cola de avisos, solo `estado='enviado'` >90 días, nunca los `error`), cron del despachador a cada 5 min, `listConversations` paginado. Las **fotos huérfanas ya estaban resueltas** en `deletePet`.

**Pendiente del usuario (B/C/D):**
1. ✅ Migraciones **`0022`, `0023`, `0024`, `0025` APLICADAS y VERIFICADAS (20-jul)** contra la base: `bloqueos`+`hay_bloqueo_con` OK; `fecha_nacimiento` privada (42501 directo) y `mi_perfil()` la devuelve; `denuncias` con las columnas nuevas. (El aviso `spatial_ref_sys` del Advisor es un falso positivo de PostGIS: aceptarlo, no se arregla.)
2. Agendar la purga de avisos (opcional): SQL en `docs/purga-avisos.sql` (semanal, separado del despachador).
3. **Follow-ups menores anotados** (no urgentes): `anonimizar_mi_cuenta()` (0017) no limpia las filas de `bloqueos` del que se borra; y no se ocultan las *novedades* del dueño bloqueado (sí sus pistas/avistamientos).

### Tandas 1 y 2

**🟢 Tanda 1 — commit `f8ea67f`** (código listo, falta verificación visual en navegador):
- **Saludo con el nombre** del perfil en Inicio (antes usaba la parte local del correo) + inicial del avatar; también se arregló la inicial en Perfil.
- **Red social pinchable:** en Perfil se elige plataforma (Instagram/Facebook/TikTok/Otro) + usuario; se guarda como **URL** en la columna `red_social` (sin migración) y se muestra como link tocable. Helper puro `src/lib/redSocial.ts` (14 tests).

**🔵 Tanda 2 — commit `b9f839e`** (código listo + migración aplicada y verificada; falta verificación visual):
- **Perfil público** (`PublicProfileScreen`): portada, 3 stats tocables (reencuentros/reportes/aportes), insignias sobrias, red social como link, secciones de reportes y reencuentros. La ve cualquiera, incluso invitado. **Fail-closed** si el RPC no está.
- **Migración `0019` APLICADA y VERIFICADA (20-jul) contra la base real:** RPC `perfil_publico(user_id)` `security definer` — devuelve stats + red social, **nunca `telefono`** (comprobado: la respuesta ni siquiera trae esa columna, y pedir `telefono` directo sigue dando `42501`); `user_id` inexistente/borrado → 0 filas; responde a invitado y a autenticado. Incluye política aditiva para que el invitado también vea reencuentros (y de paso la tira "Finales felices" de Inicio). ⚠️ Al aplicarla, el `grant ... to anon, authenticated` en una línea se rompió al copiar (perdió `authenticated;`) → se partió en dos `grant` (commit `da…`); la versión del repo ya es la robusta.
- **Insignias** `src/lib/insignias.ts` (8 tests): "Reencuentros logrados"→"Vecino de confianza" (≥5), "Colabora con el barrio" (≥5)→"Colaborador constante" (≥20). Tono de **señal de confianza, no gamificación** (pedido explícito: "no tan infantil ni tan IA").
- **Entradas al perfil:** "Publicado por [nombre] →" en el detalle, firma de pistas tocable (no "Un vecino"), y encabezado tocable en el chat. `PublicProfile` registrado en los 5 stacks. `profile.getNombrePublico`.
- **Desvíos anotados:** los avistamientos NO se hicieron tocables (la UI no muestra su autor); "desde el chat" se resolvió como encabezado en `ChatScreen`, no en la lista de Conversaciones (ahí tocar la fila abre el chat).
- Spec: `docs/superpowers/specs/2026-07-20-tanda2-perfil-publico-design.md`.

**Estado de verificación:** `tsc` limpio, **302 tests** verdes. Migración `0019` verificada contra la base. **Falta: prueba visual en el navegador** (saludo, red social tocable, y las tres entradas al perfil público).

**⏭️ Pendiente de las tandas 1 y 2:** verificación visual en el navegador. La fuga de contacto de `profiles` **ya estaba cerrada** por `0018` (ver más abajo; el punto que decía lo contrario en "PARA RETOMAR" estaba desactualizado y se corrigió). La **Tanda 3 ya se construyó** (ver arriba).

---

Última sesión: 2026-07-19 (**borrar mi cuenta** en producción y verificado end-to-end; las 3 Edge Functions desplegadas; migración `0017` aplicada) · Rama de trabajo: `feat/mvp-encuentra-mascota`. El repo no tiene remoto en GitHub todavía. ✅ **`master` ya tiene TODO fusionado** (merge local `--no-ff`; ambas ramas idénticas en `a657fe7`), incluidas las 3 funciones nuevas de esta sesión (alertas por zona, visto por acá, reencuentro).

## 🔒 TANDA A — PRIVACIDAD (19-jul) — ✅ EN PRODUCCIÓN Y VERIFICADA

**Web subida** (producción sirve el bundle `index-92a9093d…js`, comprobado por `curl`) y
**migración `0018` aplicada**, en ese orden. Verificación contra la base real, 9/9:

| Prueba | Resultado |
|---|---|
| Permisos antes de aplicar | `anon` y `authenticated` leían `telefono` y `red_social` — la fuga era real |
| ¿`PUBLIC` tenía el permiso? | **No** (los grantees eran `anon`, `authenticated`, `postgres`, `service_role`), así que el `revoke` a `public` era defensivo |
| Permisos después | Solo `creado_en, eliminado_en, foto_perfil, id, nombre` — **el contacto ya no figura** |
| `mi_perfil()` en la base | Sin argumentos, `security definer`, `search_path=public, pg_temp`, sin `execute` para `anon` |
| Pedir `telefono,red_social` de todos | `42501` ✅ (el ataque original, cerrado) |
| `select=*` | `42501` ✅ |
| **Control:** `id, nombre, eliminado_en` | **200 con datos** ✅ — el chat y las pistas siguen vivos |
| `mi_perfil()` sin sesión | `42501` ✅ |
| `mi_perfil()` con `user_id` de otro | `PGRST202`, **la firma no existe** ✅ — la propiedad central del diseño |
| `mi_perfil()` con sesión propia | Devuelve **solo** la fila propia ✅ |
| Camino feliz completo | Escribir contacto → `204`; leerlo por `mi_perfil()` → **sí**; leerlo desde otra cuenta → `42501` |

**Los datos de los usuarios siguen intactos** (comprobado con `service_role`): dejaron de ser
legibles por terceros, no se borraron. Datos de prueba limpiados; queda 1 mensaje de la
prueba E2E del borrado de cuenta, entre dos lápidas (ver más abajo).

### Las seis piezas

Seis piezas con un tema común: dejar de exponer datos que no hace falta exponer. Plan en
`docs/superpowers/plans/2026-07-19-tanda-a-privacidad.md`. **260 tests, 35 suites, tsc limpio.**

1. **Contacto privado** (mig `0018`): se le quita a `authenticated` el permiso de leer las
   **columnas** `telefono` y `red_social` de `profiles` — para todos, incluido su dueño. La
   política de filas no cambia (nombre y foto siguen públicos: firman las pistas, aparecen
   en los chats y sostienen el modo invitado). El dueño las recupera con `mi_perfil()`,
   **sin parámetros**: no existe firma para pedir la fila de otro.
2. **Ubicación difuminada** (`src/lib/difuminarUbicacion.ts`): se publica un punto movido al
   azar ~250 m, aplicado en `createPet` y `addSighting`. **La coordenada precisa no se
   guarda en ninguna parte** — lo que no se guarda no se puede filtrar. Aleatorio y no
   redondeo, porque el redondeo se revierte cruzando varios reportes de la misma persona.
3. **Fotos no enumerables** (`src/lib/idAleatorio.ts`): las rutas pasaron de
   `${userId}/${Date.now()}.jpg` (adivinable) a `${userId}/${idAleatorio()}.jpg`. El prefijo
   `userId/` se conserva porque es lo que protege el borrado de cuenta.
4. **EXIF verificado**: las fotos subidas **no** llevan metadatos GPS. Comprobado con una
   foto con GPS real, subida por la app y descargada del bucket; el input traía `APP1/Exif`
   y la salida solo `APP0/JFIF` + ICC. `manipulateAsync` los limpia al recomprimir.
   ⚠️ Solo cubre el camino **web**; el nativo usa otra implementación y no se probó.
5. **Aviso antiestafa** en el chat, en el detalle, al publicar y en la vista pública.
6. **Aviso de contacto privado** en el formulario de perfil.

**Lo que encontró la revisión final de rama** (otra vez lo que se cae ENTRE las tareas):
- 🔴 **Pérdida silenciosa de datos.** La pieza 1 introdujo un perfil "degradado"
  (`telefono`/`red_social` en `null` cuando `mi_perfil()` no responde) que el editor
  preexistente no distinguía de uno vacío: al guardar escribía `''` **encima del dato
  real**, sin ningún error, porque supabase-js manda `Prefer: return=minimal`.
- 🟠 El primer arreglo dejó **un segundo camino al mismo bug** (`profile === null` por el
  `.catch(() => {})` de `ProfileScreen`), y había un test que lo bendecía. Se cazó con
  *mutation testing*: revertir el arreglo y confirmar que el test se pone rojo.
- 🟠 El aviso antiestafa faltaba justo en `PublicPetScreen`, la **única vista sin sesión**
  y por lo tanto el blanco del timo de la recompensa.

### Por qué el orden importaba (para la próxima migración de permisos)
Se desplegó **web primero, migración después**. Al revés, con la migración aplicada y la app
vieja arriba, el `select('*')` habría fallado entero (PostgREST no devuelve datos parciales)
y **todos** los usuarios habrían perdido su perfil.

Antes de subir se probó el `dist` compilado contra la Supabase real, **en la ventana exacta
de despliegue** (`mi_perfil()` todavía inexistente, devolviendo `PGRST202`): el escalón de
respaldo mostró el aviso en español y **no renderizó** los campos de contacto, así que el
borrado silencioso no era alcanzable. También se comprobó ahí que el pin quedó a **235 m**
del punto enviado, coherente con el radio de 250.

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

### ✅ HALLAZGO DE PRIVACIDAD — RESUELTO por la Tanda A (mig `0018`)

Durante la prueba quedó a la vista: la política de `profiles` era `for select to authenticated using (true)`, así que cualquier persona con una cuenta podía leer el teléfono y la red social de todos los demás (se comprobó leyendo `+56959987786` y `@77.pvblo` desde una cuenta descartable). **Cerrado por la migración `0018` (column-level security):** `revoke select` de `public/anon/authenticated` y `grant select` solo de `id, nombre, foto_perfil, creado_en, eliminado_en`; el dueño recupera su contacto por `mi_perfil()` **sin parámetros**. En producción y verificado 9/9 (ver sección "TANDA A — PRIVACIDAD" arriba).

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

> Lo de hoy (19-jul) quedó **todo cerrado**: borrado de cuenta en producción y verificado 12/12, las 3 Edge Functions desplegadas, migración `0017` aplicada, y la web subida. El detalle está en las secciones de arriba.

1. ✅ ~~**Cerrar la fuga de datos de contacto en `profiles`**~~ — **YA HECHO** por la Tanda A (mig `0018`, en producción y verificada). Se revisó el 20-jul que **ningún flujo quedó roto**: `messages.ts` lee solo `id, nombre, eliminado_en`; `tips.ts` solo `nombre, eliminado_en`; el afiche usa el perfil **propio** (`getMyProfile`); y ninguna pantalla de detalle mostraba el contacto de otra persona. **Decisión de producto (20-jul):** el chat interno + el afiche alcanzan para contactarse; NO se expone el teléfono a quien tiene un chat abierto (se descartó esa idea a propósito, no es un pendiente).
2. ~~Limpiar el residuo de la prueba end-to-end~~ — **NO se borra (decisión 20-jul): quedan como "huella".** Las 3 filas lápida + su hilo se dejan a propósito. No intentar limpiarlas en el futuro.
3. **Brevo:** la cuenta sigue sin activar (`403 SMTP account is not yet activated`). Hasta que la habiliten, ningún aviso por correo sale. Alternativa: comprar dominio y volver a Resend — el código ya soporta los dos y elige según qué variables estén cargadas.

4. **Bloqueo de cuenta por intentos fallidos:** recomendación es **no hacerlo tal cual**. Bloquear tras N intentos deja que cualquiera eche al dueño de un reporte tirando claves malas a propósito, justo cuando más necesita entrar. Supabase ya limita por IP. Si se hace, mejor con demora creciente que con bloqueo.
5. **Nombre de la app — SIN DECIDIR.** Pablo consideró **"Huella" y lo descartó (21-jul)**
   porque `huella.cl` está TOMADO (y `mihuella.cl`/`huellapp.cl` también). **Filtro duro:
   el dominio `<nombre>.cl` debe estar LIBRE de verdad.** Candidatos con `.cl` LIBRE ya
   verificados: **Cerquita, Volvió, Volví, Pichicho**. Investigación 19-jul abajo: Dominios `.cl` verificados uno por uno en el WHOIS de NIC Chile; colisiones buscadas en Google Play / App Store. **INAPI NO se pudo verificar** (su buscador es un formulario ASP.NET que no acepta consultas por URL) — eso hay que hacerlo a mano en `buscadormarcas.inapi.cl`, búsqueda **literal y fonética**, clases **9** (software), **42** (SaaS) y **45** (servicios comunitarios).

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

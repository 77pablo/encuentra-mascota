# Tanda "difusión + instalable" — Diseño

**Fecha:** 2026-07-22 · **Aprobado por:** Pablo
**Ejecución:** 3 agentes en paralelo (A worker OG · B PWA · C tarjetas) + revisión final adversarial.
**Sin migraciones en toda la tanda.** La app ya está EN PRODUCCIÓN: nada de esto puede romper lo que anda.

## Objetivo

Que cada cosa que pasa en la app pueda salir a redes con foto (links con vista previa, tarjetas
de adopción y de final feliz) y que la app se pueda instalar en el teléfono sin pasar por las
tiendas (PWA).

---

## F1 · Vista previa al compartir links — `public/_worker.js` (agente A)

**Hechos verificados (Cloudflare Pages, deploy por drag-and-drop):**
- `_worker.js` en la raíz del `dist` SÍ funciona con drag-and-drop; la carpeta `functions/` NO.
- En advanced mode, `_headers` y `_redirects` **dejan de aplicar**: el worker asume ambos roles.

**Comportamiento del worker (`public/_worker.js`, JS plano sin build step):**
1. Si la ruta apunta a un asset estático existente (`/_expo/*`, `/assets/*`, archivos con
   extensión, `/manifest.webmanifest`, `/sw.js`, etc.) → `env.ASSETS.fetch(request)` tal cual.
2. Si la ruta es `/mascota/:id` o `/adopcion/:id` (uuid) → pedir los datos públicos por
   PostgREST con la **anon key** (que es pública por diseño; ya viaja en el bundle JS):
   - `pets?id=eq.<id>&select=nombre,especie,estado,comuna,fotos,descripcion,reunida_en` /
     `adoptions?id=eq.<id>&select=nombre,especie,edad,tamano,comuna,fotos,descripcion,adoptada_en`.
   - La RLS decide qué se ve: si devuelve 0 filas (borrado/oculto), servir el index sin tags
     especiales. Un reporte reunido titula "¡Volvió a casa!"; una adopción con `adoptada_en`
     titula "¡Ya encontró familia!".
3. Inyectar en el `<head>` del index.html: `og:title` ("🔴 PERDIDA en Maipú — Perro «Luna»" /
   "🟢 ENCONTRADA…" / "PELUSA busca hogar en Ñuñoa"), `og:description` (descripción recortada
   ~150 chars), `og:image` (fotos[0]), `og:url`, `og:type=website`, `og:site_name`,
   `twitter:card=summary_large_image` + equivalentes twitter.
4. Cualquier otra ruta sin extensión → index.html (fallback SPA, rol del viejo `_redirects`).
5. Todas las respuestas HTML llevan **las 5 cabeceras de seguridad copiadas de
   `public/_headers`** (verificarlas contra ese archivo, no inventarlas).
6. **Inyección PWA (interfaz con B, nombres FIJOS):** en TODO HTML inyectar
   `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color" ...>`,
   `<link rel="apple-touch-icon" href="/icons/icono-180.png">` y
   `<script src="/registrar-sw.js" defer></script>`.

**Reglas duras:**
- **Escapar TODO dato de usuario** antes de meterlo en HTML (`&<>"'`): nombre y descripción
  son texto libre de usuarios — este worker es el primer HTML generado en servidor de la app
  y un `"><script>` en una descripción no puede ejecutar. Función pura `escaparHtml` +
  armadora de tags **con tests** (el worker es JS plano: testearlo desde jest importándolo
  como módulo — exportar las funciones puras además del `export default { fetch }`).
- **Fallar abierto:** timeout de ~2 s a Supabase (`AbortSignal.timeout`) y `try/catch`
  alrededor de TODO el camino OG: ante cualquier error se sirve el index.html pelado. Un
  hipo de la base jamás tira el sitio.
- La respuesta OG es el MISMO index.html + tags (los crawlers leen el head; los humanos
  hidratan la app normal). No hay HTML alternativo que mantener.

**Verificación:** `npx wrangler pages dev dist` local: (a) `/` sirve la app; (b)
`/mascota/<uuid inexistente>` sirve index pelado; (c) con un reporte real, `curl` muestra las
meta tags con la foto y el título correcto y los caracteres escapados; (d) rutas de assets
intactas; (e) cabeceras presentes; (f) un id con caracteres raros no rompe.

## F2 · PWA instalable (agente B)

**Archivos (nombres FIJOS — el worker de A los inyecta):**
- `public/manifest.webmanifest`: name "Encuentra tu Mascota" (cambia cuando Pablo decida el
  nombre), short_name, start_url "/", display "standalone", background/theme del tema claro
  (valores reales de `src/theme`), lang "es-CL", íconos 192/512 normales + maskable.
- `public/icons/`: generados desde `assets/icon.png` con Pillow (script one-off en el
  scratchpad, los PNG se commitean): 192, 512, maskable (con margen de seguridad 20%), 180
  para apple-touch.
- `public/sw.js`: **conservador a propósito** — cache-first SOLO para `/_expo/static/*` y
  `/icons/*` (assets hasheados/inmutables), network-first con fallback a caché para
  navegaciones (HTML), **NUNCA** intercepta `*.supabase.co` ni otros orígenes. Versionado del
  caché + limpieza en `activate`. Sin push, sin background sync (no corresponde acá).
- `public/registrar-sw.js`: registra el SW solo si `serviceWorker in navigator`.

**UI (React Native web-only, degrada a nada en nativo):**
- `src/lib/instalarPwa.ts`: captura `beforeinstallprompt` (Chrome/Android), expone
  `puedeInstalar()`, `pedirInstalacion()`, `esIos()`, `estaInstalada()` (display-mode
  standalone). Módulo con tests (mockear window).
- Tarjeta descartable en Inicio ("📲 Llevá la app en tu teléfono") — flag de descarte
  persistido (patrón `lib/onboarding.ts`); en Android dispara el prompt nativo; en iOS abre
  un modal con los 2 pasos (Compartir → Agregar a inicio). Oculta si ya está instalada.
- Entrada permanente en Perfil ("Instalar la app"), misma lógica, no descartable.

## F3 + F4 · Tarjetas de adopción y de final feliz (agente C)

**Generalización previa (sin romper lo que anda):** `TarjetaCompartir`/`TarjetaGenerador`
pasan a recibir un shape genérico `DatosTarjeta = { banda: string; bandaColor: string;
titulo: string; subtitulo: string | null; fotoUrl: string | null; qrUrl: string | null;
nombreArchivo: string }`. El camino actual de reportes se adapta con un armador
`datosDeReporte(pet)` (que envuelve el `tarjetaTextos` existente) — **los tests actuales de
la tarjeta de reportes deben seguir verdes sin cambios de comportamiento**.

- **F3 — adopción:** `datosDeAdopcion(adopcion)`: banda "BUSCA HOGAR" + comuna si hay
  ("BUSCA HOGAR EN ÑUÑOA"), color `colors.brand` (el violeta/acento de la marca — verificar
  el token real en `src/theme`), título = nombre, subtítulo "Perro · Cachorro · Mediano"
  (especie + edad + tamaño, los que existan), QR a `/adopcion/:id` (helper de URL espejo de
  `petUrl` — si no existe `adopcionUrl` en `src/lib/links.ts`, crearlo). Entradas: botón
  "Compartir tarjeta" en `AdopcionDetailScreen` (para CUALQUIERA, no solo el dueño) y oferta
  tras publicar adopción.
- **F4 — final feliz:** `datosDeFinalFeliz(pet)`: banda "¡VOLVIÓ A CASA!" color
  `colors.found` (verde), foto `final_foto ?? fotos[0]`, subtítulo "X días después" si
  `reunida_en - creado_en` da ≥1 día (helper puro `diasEntre` con tests; si <1 día u orden
  raro → null), QR a `/mascota/:id`. Entradas: ofrecida tras confirmar el reencuentro
  (después del confetti, en el flujo de `marcarReunida` de `PetDetailScreen`) y botón en el
  detalle PROPIO de un reporte con `reunida_en`.
- Paleta CLARA fija en las tarjetas (regla de assets compartibles, sin cambios).

## Coordinación

| Agente | Piezas | Archivos calientes |
|---|---|---|
| A | `_worker.js` + tests puros | `public/_worker.js`, `src/lib/ogWorker*` o tests junto al worker |
| B | manifest/sw/íconos/registro + UI instalar | `public/*` (PWA), `HomeScreen`, `ProfileScreen`, `src/lib/instalarPwa.ts` |
| C | tarjetas F3+F4 + generalización | `TarjetaCompartir/Generador`, `compartirTarjeta`, `tarjeta.ts`, `AdopcionDetailScreen`, `PetDetailScreen`, `PublicarAdopcionScreen`, `links.ts` |

- Interfaz A↔B: SOLO los nombres fijos de archivos/tags de la sección F2 (ninguno toca los
  archivos del otro).
- Solapes con cuidado: A y B no tocan pantallas; C no toca `public/`. `HomeScreen` solo B.
- Reglas transversales de siempre: colores dinámicos en UI (`useColors`+`crearEstilos`),
  español chileno cálido, tests donde haya lógica, sin `Date.now()` en lógica testeable
  (`hoy`/`ahora` como parámetro).

## Despliegue y verificación final

1. Merge (C → B → A) + suite completa + `tsc` + revisión final de rama adversarial.
2. `npx expo export --platform web` (verificar que `_worker.js`, `manifest.webmanifest`,
   `sw.js`, `registrar-sw.js`, `icons/` llegan a `dist/`; borrar `dist/borrar-cuenta`).
3. **Prueba local con `npx wrangler pages dev dist`** (worker + SPA + OG + tags PWA juntos).
4. Drag-and-drop de Pablo. Post-deploy: pegar un link de reporte en WhatsApp (vista previa
   con foto), Lighthouse/instalabilidad en Chrome, y el check pendiente de la tarjeta con
   foto en navegador real.
5. Riesgo aceptado y reversible: si el worker diera problemas en prod, se borra
   `dist/_worker.js` y se re-sube (vuelven a regir `_headers`/`_redirects`); Rollback de
   Cloudflare también disponible.

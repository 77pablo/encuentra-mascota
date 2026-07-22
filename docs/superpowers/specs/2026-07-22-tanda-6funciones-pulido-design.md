# Tanda de 6 funciones + pulido de adopción — Diseño

**Fecha:** 2026-07-22 · **Aprobado por:** Pablo
**Ejecución:** 4 agentes en paralelo (A/B/C/D) + reconciliación y revisión final de rama por el orquestador.

## Objetivo

Seis funciones nuevas centradas en difusión y retención, más tres pulidos menores del
apartado de adopción que quedaron anotados en la v1.1.

---

## F1 · Tarjeta compartible con foto (agente A)

**Problema:** compartir un reporte hoy manda solo texto (`buildShareText`). Una imagen
(foto + estado + comuna + QR) se difunde mucho mejor en WhatsApp/Instagram, y la difusión
es el producto.

**Diseño:**
- Componente nuevo `src/components/TarjetaCompartir.tsx`: **cuadrada 1080×1080** (se decidió
  1:1 único formato: sirve para WhatsApp, feed IG y Facebook). Contenido: foto grande del
  reporte, banda superior "🔴 PERDIDA en [comuna]" / "🟢 ENCONTRADA en [comuna]" (sin comuna:
  solo el estado), nombre + especie/raza, QR al link público (`petUrl`), marca de la app.
- **Paleta CLARA fija** — regla existente de assets compartibles/imprimibles
  (`AfichePoster`, `CollarTag`): una tarjeta compartida no puede salir en modo oscuro.
- Captura reusando el mecanismo del afiche: `captureRef` de `react-native-view-shot`
  (`src/lib/aficheImage.ts`; si hace falta parametrizar tamaño, extenderlo sin romper al
  afiche).
- Compartir:
  - **Web:** `navigator.share({ files })` cuando exista (Web Share API Level 2); fallback:
    descarga del PNG (`<a download>`). **Nota:** `wa.me` no acepta imagen, así que la
    tarjeta NO va por el camino de texto actual; son dos botones distintos.
  - **Nativo:** `expo-sharing` con el archivo capturado.
- Entradas: botón "Compartir tarjeta" en el detalle del reporte (junto al compartir de
  texto, que se conserva) y ofrecida en la confirmación tras publicar.
- Alcance: **solo reportes** (perdida/encontrada). Adopción podrá reusar el componente en
  otra tanda.

**Tests:** helper puro que arma los textos/props de la tarjeta (estado+comuna, sin comuna,
sin nombre); render del componente; el flujo de captura/compartir se verifica visual.

## F2 · Búsqueda guardada con aviso (agente B)

**Problema:** las coincidencias automáticas solo funcionan si publicaste un reporte. Quien
busca sin haber publicado ("aviso si aparece un gato en Ñuñoa") no tiene nada.

**Migración `0031_busquedas_guardadas.sql`:**
- Tabla `busquedas_guardadas`: `id`, `user_id` (fk profiles, cascade), `tipo`
  (`perdida`/`encontrada`), `especie` (nullable = cualquiera; valores del enum como texto),
  `comuna` (**obligatoria** — sin comuna sería "avisame de todo Chile" = spam),
  `creado_en`. CHECKs de largo/valores (la API es pública, patrón 0016).
- RLS solo dueño (select/insert/delete propios). **Tope 5 por usuario** con trigger
  `before insert` (una policy no puede contar filas).
- Trigger `after insert` sobre `pets` → función `enqueue_busquedas_guardadas()`: encola en
  `notification_events` un evento `tipo='busqueda_guardada'` por cada usuario con una
  búsqueda que calce (`tipo` igual, `comuna` igual a `pets.comuna` o dentro de
  `comunas_alcance`, `especie` igual o null), **excluyendo al que publica**. Dedup por
  usuario si le calzan varias búsquedas con el mismo reporte.
- Recrear el CHECK de `notification_events.tipo` con la **lista UNIÓN** vigente
  (`reporte_nuevo`, `avistamiento`, `pista`, `coincidencia`, `escaneo_collar`) +
  `'busqueda_guardada'` (patrón 0026/0027: drop + add).

**Cliente / Edge Function:**
- `resolverDestinatarios`/textos en **las dos copias espejo** (`src/lib/notifyTargets.ts` y
  `supabase/functions/send-notifications/notifyTargets.ts`) — el trigger ya trae el
  destinatario (`target_user_id`, patrón escaneo_collar), así que el dispatcher solo arma
  el texto y respeta canales. **Opt-in explícito** al guardar la búsqueda → NO se filtra
  por la preferencia `zona` (mismo criterio que comunas seguidas). **El test-espejo debe
  cubrir el tipo nuevo.**
- UI: en `ExplorarScreen`, con filtros activos que incluyan comuna, botón "🔔 Guardar esta
  búsqueda" (portero de invitado). Pantalla "Mis búsquedas" en Perfil: lista + borrar
  (borrado con `.select()` — regla RLS/PostgREST conocida).
- Servicio `src/services/busquedasGuardadas.ts` con tests.

## F3 · Preguntas públicas en adopciones (agente C)

**Problema:** las dudas de adopción ("¿se lleva bien con gatos?") se repiten por chat
privado; públicas sirven a todos, como los comentarios de IG.

**Migración `0032_preguntas_adopcion.sql`:**
- Tabla `adoption_questions`: `id`, `adoption_id` (fk `adoptions`, cascade), `user_id`
  (fk profiles), `pregunta` (CHECK largo 1–500), `respuesta` (nullable, CHECK ≤1000),
  `creado_en`, `respondido_en`. Lectura pública (anon incluido — el detalle `/adopcion/:id`
  es público); insert autenticado (solo `pregunta`); **update solo el dueño de la adopción
  y solo `respuesta`/`respondido_en`** (with check que no toque la pregunta); delete: autor
  de la pregunta o dueño de la adopción.
- `denuncias.tipo` suma `'pregunta_adopcion'` con el **drop robusto por `pg_constraint`**
  (patrón 0030, no por nombre).

**Cliente:**
- Sección "Preguntas" en `AdopcionDetailScreen`: lista (firma con `getNombrePublico` →
  cuentas borradas = "Un vecino"), input para preguntar (pasa por `moderarTexto`), el dueño
  responde inline (también moderado), denunciar pregunta (tachito para autor/dueño).
- Servicio `src/services/adoptionQuestions.ts` con tests.

## F4 · Guía "encontré una mascota" (agente D)

Espejo de `GuiaPerdidaScreen`, sin migración. `GuiaEncontradaScreen` con checklist (estado
local, degrada si falla): asegurala sin arriesgarte, revisá si tiene chip gratis en una
vet (link a Ayuda rápida), sacale fotos claras, publicala como "encontrada", avisá en la
comuna, cuidado temporal responsable, Registro Nacional de Mascotas. Entradas: tarjeta en
Inicio junto a la guía de perdida, y ofrecida tras publicar una "encontrada" (simétrico a
la oferta actual). **Navegación anidada absoluta** (`navigate('App',{screen,params})`) para
todo CTA — regla confirmada dos veces: desde el stack raíz un nombre pelado de tab es un
botón muerto.

## F5 · Filtro por comuna en Adopción (agente C)

`adoptions.comuna` **ya existe** y `buscar_adopciones` ya la devuelve; falta filtrar.

**Migración `0033_adopcion_comuna.sql`:** recrear `buscar_adopciones` con `p_comuna text
default null` (`and (p_comuna is null or a.comuna = p_comuna)`). **`drop function` con la
firma completa ANTES del `create`** — agregar un parámetro crea una sobrecarga y PostgREST
falla por ambigüedad. Conservar intacto el arreglo del cursor (0015: `round(::numeric,6)` +
desempate alineado).

**Cliente:** chip "Comuna" en `AdopcionFeedScreen` reusando `ComunaPickerModal`;
`services/adopciones` pasa `p_comuna`. Verificar que `PublicarAdopcionScreen` guarde
`comuna` (la columna existe; si el formulario no la sugiere, sumarla con el patrón de
PublishScreen).

## F6 · Ficha "Mi mascota" viva (agente D)

**Decisión de Pablo:** vacuna + antiparasitarios, aviso **solo in-app** (sin push ni correo:
el push nativo no está en producción y Resend sigue en modo prueba).

**Migración `0034_mi_mascota_carnet.sql`:** `my_pets` suma `fecha_nacimiento date`,
`vacuna_proxima date`, `antiparasitario_interno_proximo date`,
`antiparasitario_externo_proximo date`, con CHECKs de rango razonable (nacimiento no
futuro ni >40 años; próximas dosis dentro de ±5 años). RLS solo-dueño ya cubre todo.

**Libs puras con TDD:**
- `src/lib/edadDesde.ts`: edad legible en español ("2 años y 3 meses", "8 meses",
  "3 semanas"); borde: fecha futura → null.
- `src/lib/recordatorios.ts`: dado un carnet y "hoy", devuelve estado por ítem
  (`al_dia` / `vence_pronto` (≤14 días) / `vencida`) y el resumen para el banner
  ("A Luna le toca la vacuna"). Recibe `hoy` como parámetro (testeable, sin `Date.now()`
  suelto).

**UI:** campos nuevos en el formulario de MyPets (date pickers que funcionen en web);
carnet en la ficha (edad calculada + 3 fechas con su estado en color); banner en
`MyPetsScreen` y en Inicio (solo si hay sesión y algo `vence_pronto`/`vencida`; tocarlo
abre Mis mascotas).

## Pulido de adopción (agente C y D)

1. **Editar publicación de adopción** (C): `EditAdoptionScreen` con el patrón de
   `EditPetScreen`; **pasa por `moderarTexto`** (editar es el bypass conocido); entrada
   solo para el dueño en `AdopcionDetailScreen`; servicio `updateAdoption` restringido a
   campos editables (nunca `user_id`/`adoptada`/`oculta` por este camino).
2. **Encabezado del chat de adopción tocable** (C): en `ChatScreen`, si el hilo es de
   adopción, el encabezado navega a `AdopcionDetail` (navegación anidada absoluta).
3. **Consumir `data.ruta` del push** (D): función pura `src/lib/rutaANavegacion.ts`
   (`/adopcion/:id`, `/mascota/:id`, desconocida → null) **con tests**, + listener de
   `expo-notifications` (`addNotificationResponseReceivedListener`) que navega al tocar.
   **Solo nativo; en web no-op.** No hay forma de probarlo end-to-end sin build nativo:
   se testea la función pura y el cableado queda anotado como pendiente de verificación
   en el primer build EAS.

---

## Reparto y coordinación

| Agente | Piezas | Migraciones | Archivos calientes |
|---|---|---|---|
| A | F1 tarjeta | — | `TarjetaCompartir`, `aficheImage.ts`, `PetDetailScreen`, `PublishScreen` |
| B | F2 búsqueda guardada | `0031` | `ExplorarScreen`, Perfil, `notifyTargets` ×2, `ProfileScreen` |
| C | F3 preguntas + F5 comuna + editar + encabezado chat | `0032`, `0033` | `AdopcionDetailScreen`, `AdopcionFeedScreen`, `ChatScreen`, `PublicarAdopcionScreen` |
| D | F4 guía + F6 carnet + data.ruta | `0034` | `GuiaEncontradaScreen`, `MyPetsScreen`, `HomeScreen`, navegación raíz |

- **Solapes conocidos a reconciliar en el merge:** `HomeScreen` (D: guía + banner),
  `PublishScreen` (A: oferta de tarjeta; D: oferta de guía encontrada) — el orquestador
  resuelve; navegación raíz (D registra pantallas nuevas; C registra `EditAdoption`).
- **Numeración de migraciones fija por agente** (0031 B, 0032/0033 C, 0034 D); ninguna
  depende de otra de esta tanda.
- Reglas transversales obligatorias: patrón dinámico de colores (`useColors` +
  `crearEstilos`); textos en español chileno cálido; `moderarTexto` en todo texto público
  nuevo; borrados con `.select()`; navegación anidada absoluta desde el stack raíz;
  cuentas borradas firman "Un vecino".

## Orden de despliegue

**Migraciones primero, web después** (al revés que la 0018): los cambios son aditivos,
pero la app nueva pide columnas/params nuevos (`my_pets` carnet, `p_comuna`,
`adoption_questions`) y PostgREST falla la consulta ENTERA si no existen. La app vieja
contra la base migrada no se ve afectada.

## Verificación

- Por agente: tests de sus libs/servicios + `tsc` limpio + suite completa verde.
- Orquestador: merge + test-espejo de `notifyTargets` + revisión final de rama
  **adversarial** (obligatoria: es la que históricamente caza lo que se cae entre tareas)
  + verificación visual con Playwright contra `localhost:8091` de: tarjeta (render),
  guardar búsqueda + Mis búsquedas, pregunta+respuesta en adopción, guía encontrada,
  filtro comuna en feed, carnet + banner, editar adopción.

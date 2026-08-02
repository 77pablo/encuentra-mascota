# Privacidad del contacto + 4 funciones — decisiones tomadas

**Fecha:** 2-ago-2026 · **Estado:** ⚠️ **BORRADOR. Decisiones tomadas con Pablo en el
brainstorming, PERO el diseño no está aprobado y no hay plan de implementación.** No empezar a
codificar desde acá sin cerrar lo que queda abierto (al final del documento).

---

## Lo que se descubrió al revisar, antes de diseñar nada

La mitad del pedido original ya estaba hecho, y conviene que quede escrito para no volver a
construirlo:

- **El teléfono ya es privado.** La tanda A (19-jul) revocó `telefono` y `red_social` a nivel de
  COLUMNA: pedirlas de otra persona devuelve `42501`, verificado contra la base. Ninguna pantalla se
  lo muestra a un tercero.
- **El correo no se expone nunca.** No existe en `profiles`. Lo único que hay es tu propio Perfil
  mostrándote tu mail a vos (`user?.email`, `ProfileScreen.tsx:388`).
- **Lo único realmente público es la red social:** `perfil_publico` la devuelve (`0058:145,163`) y
  `PublicProfileScreen` la muestra con enlace, a cualquiera, incluso sin cuenta.
- **El afiche es el otro lugar donde el número sale a la luz**, y ahí es a propósito: el dueño lo
  imprime para pegarlo en la calle.

**Hallazgo suelto, arreglar de paso:** `AfichePoster.tsx:59` tiene un respaldo escrito a mano,
`https://encuentratumascota.app`, **que no es nuestro dominio**. En web nunca se usa (`baseUrl()`
toma `window.location.origin`), pero en la app compilada, si faltara `EXPO_PUBLIC_WEB_URL`, el afiche
imprimiría un QR apuntando a un dominio ajeno. Si alguien lo registra, se queda con esos escaneos.

---

## Función 0 — Ocultar el contacto (el pedido original)

Tres piezas independientes. **Decisión de Pablo: cada control vive donde se usa**, no agrupados en
una sección de Privacidad.

### 0.a El número en el afiche
- Interruptor **al generar el afiche**, **prendido por defecto** (decisión de Pablo).
- Apagado: `armarAfiche` devuelve el afiche sin `whatsappDigits`, sin `waLink` y sin número visible.
- **El QR pasa ARRIBA del número** (decisión de Pablo), y su texto cambia: de *"Escaneá para ver
  más"* a algo que diga a dónde va y que no hay trámite — *"Escaneá para ver su ficha y avisar. No
  hace falta crear cuenta."* Es lo que de verdad frena a un vecino: no saber qué le van a pedir.
- Al apagarlo, una línea honesta: sin número puede avisar menos gente, sobre todo quien no escanea QR.
- **Tocar `faltaWhatsapp`** (`lib/afiche.ts:36`): hoy le avisa al dueño "te falta el WhatsApp"; si lo
  ocultó a propósito, ese aviso pasa a ser ruido.

**Por qué NO se puso el link escrito tipeable:** hoy la dirección del reporte es un UUID largo
(`/mascota/1c3e1a03-…`). Impreso no lo tipea nadie y se lee peor que no poner nada. Un código corto
(`/m/AB12`) es lo que daría confianza de verdad —se lee ANTES de escanear— pero **luce recién cuando
haya dominio propio**: hoy diría `encuentras-mascota.pages.dev/m/AB12`. Queda pendiente, atado a la
decisión del nombre.

### 0.b La red social del perfil público
- Interruptor al editar el perfil, **visible por defecto** (es el comportamiento actual; cambiarlo
  sorprendería a quien ya la cargó).
- 🔑 **El filtro va DENTRO de `perfil_publico`, no en el cliente.** La columna está revocada desde la
  `0018`, así que la RPC es el único camino por el que sale: filtrando ahí, apagarla es real incluso
  contra `curl`. Filtrarlo en la pantalla sería un interruptor que miente.
- Migración: columna `mostrar_red_social boolean not null default true`, `perfil_publico` recreada
  **desde la `0058`**, y la columna sumada al whitelist de `UPDATE` de la `0057`.
- ⚠️ El guardián `migracion0057.test.ts` cruza ese whitelist contra la firma de `updateMyProfile` y
  **se va a poner rojo hasta que las dos coincidan**. Es el guardián funcionando, no un problema.

### 0.c El correo en tu propio Perfil
Enmascarado (`p***@gmail.com`) con un toque para revelarlo. Solo cliente, sin migración.

### Orden de despliegue de la 0.b: MIGRACIÓN PRIMERO, obligatorio
Si sube la web antes, `updateMyProfile` mandaría una columna que la base no conoce y **PostgREST
rechaza el update ENTERO**: guardar el perfil se rompe para todos, no solo la parte nueva. Es la
misma trampa que ya rompió el perfil una vez en este proyecto.

---

## Función 1 — El afiche en dos toques

Lo que encarece hoy el camino "perdí a mi perro → tengo 20 afiches en la mano" no es generar el PNG,
es todo lo de antes. Botón **"Hacer afiche"** en el detalle del reporte propio y en la guía de "qué
hacer ahora", que genere sin pasos intermedios, más un texto de impresión listo para copiar (tamaño
carta, qué pedirle a la fotocopiadora). Sin migración, todo cliente. Va junto con los cambios de
layout de la 0.a.

**Por qué esta función y no otra:** `docs/competencia-y-oportunidades.md` dice que la búsqueda física
del barrio resuelve el **30-49%** de los casos y la base de datos el **2-6%**. La app es buena en lo
segundo y floja en lo primero.

---

## Función 2 — La bandeja de moderación que avisa

Los Términos publicados prometen plazos de retiro (24 h / 72 h / 7 días) y hoy **nada avisa** que
entró una denuncia: la bandeja hay que abrirla a mano. Es un compromiso escrito sin nada detrás.

- Se reusa la cola: `tipo = 'denuncia_nueva'` con `target_user_id` = cada admin, encolado por
  **trigger sobre `denuncias`**. Cero infraestructura nueva.
- Badge con el conteo en la fila de Moderación del Perfil.
- ⚠️ **El correo muere si Brevo no está activo, que es el estado de hoy.** Así que el badge in-app no
  es un extra: es el único canal que funciona ahora.
- El dispatcher (`send-notifications/index.ts:30-38`) tiene una unión de tipos: **hay que sumarlo ahí
  y redesplegar ANTES de aplicar la migración**, o el despachador consume los eventos nuevos sin
  saber qué son.

---

## Función 3 — Cerrar el círculo con quien avisó

Hoy alguien avisa desde el afiche, la mascota aparece, y esa persona nunca se entera. Es el momento
de mayor emoción del producto y se está tirando.

**El problema que no se ve desde el enunciado:** los avistamientos (`sightings`) tienen `user_id not
null`, o sea identidad. Pero **quien avisa desde el afiche sin cuenta no deja ninguna**: `actor_id`
va en `null` a propósito (`0050:55`) y ni siquiera crea fila en `sightings`. Justo el caso más
emotivo es el único al que no había a quién avisarle.

**Decisión de Pablo: correo opcional, solo para eso.** Campo opcional al avisar ("¿querés que te
avisemos si aparece?").

Requisitos que arrastra, y ninguno es negociable:
- **Finalidad única y opt-in explícito** (Ley 21.719). Hay que sumarlo a la política de privacidad.
- **Tabla propia con purga propia.** NO puede vivir en `datos` de `notification_events`: esa cola se
  purga a los 90 días de enviada (`0023`), y el correo se necesita hasta que el caso se cierre. Se
  borra cuando el reporte se cierra, se reencuentra o vence.
- Hay que sumarlo a `anonimizar_mi_cuenta` **no** (es de alguien sin cuenta), pero sí a la purga y al
  borrado del reporte.

---

## Función 4 — Foto en el aviso anónimo

**El problema técnico:** la policy de Storage es `for insert to authenticated` (`0001:116`). Un
anónimo no puede subir nada, y abrir el bucket a `anon` sería un depósito de basura mundial en
minutos. Única vía segura: **Edge Function con `service_role`** que reciba la imagen, valide tamaño y
tipo, la suba, y aplique el mismo tope que el aviso (10/hora, 30/día por reporte, `0055`).

**El problema de fondo, que es peor:** una foto de un desconocido sin cuenta es el mayor vector de
abuso de la app, y no hay cuenta que suspender. La decisión de la tanda B fue moderación de imagen
**sin IA**, con casilla de confirmación y denuncia — herramientas que suponen una cuenta detrás.

**Decisión de Pablo: la foto solo la ve el dueño, nunca es pública.** No va al mapa ni a la ficha
pública. Si es basura, la ve una persona y la borra. El daño máximo es una foto fea a una persona, no
contenido publicado en una app de mascotas.

---

## Lo que NO se hace, y por qué

- **Reconocimiento de hocico.** Ya analizado en `docs/competencia-y-oportunidades.md`: el "99%" sale
  de un paper coescrito por el CTO del proveedor y el único benchmark independiente da 86,67% AUC.
  Con 1 reporte en la base no resuelve ningún problema que exista hoy.
- **Nombre y dominio.** Pablo pidió expresamente no tratarlo todavía; él decide cuándo.
- **Código corto tipeable en el afiche.** Atado al dominio propio (ver 0.a).

---

## ⚠️ Lo que queda ABIERTO antes de implementar

1. **El diseño no está aprobado.** Falta que Pablo lea esto y diga que sí.
2. **No hay plan de implementación.** Corresponde `writing-plans` después de la aprobación.
3. **Faltan decisiones finas** de las funciones 1 a 4: dónde vive exactamente el botón del afiche, qué
   dice el texto de impresión, cuánto dura el correo de seguimiento antes de purgarse, y el tamaño
   máximo de la foto anónima.
4. **Números de migración:** hay que confirmar cuál es la próxima libre al momento de escribirlas (la
   `0058` está aplicada; la `0056` quedó libre a propósito).

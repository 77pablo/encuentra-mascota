# Hogar temporal — diseño (tanda 15)

**Fecha:** 4-ago-2026 · **Estado:** APROBADO por Pablo (4-ago) · **Implementación:** tanda 15,
después de cerrar la tanda 14.

## Qué es

Un apartado nuevo donde la gente **se ofrece a cuidar mascotas temporalmente** y quien necesita
un hogar temporal **lo pide desde la app**. Cierra el hueco entre "Encontré un animal y no puedo
tenerlo en mi casa" y el módulo de adopción: hoy ese animal vuelve a la calle o cae en un refugio
saturado.

## Decisiones de Pablo (4-ago), con su porqué

1. **Las 4 variantes del caso de uso, por fases** — encontrados, refugios, registro único y
   viaje/emergencia del dueño. La arquitectura es el **registro único de cuidadores**: una sola
   oferta de cuidado; lo que cambia por fase es quién la consume.
2. **Plata jamás; todo voluntario.** La app solo conecta, igual que la cuadrilla. Nada de
   comisiones ni "acuerdos por fuera" sugeridos. Aviso explícito: *"la app no cobra ni paga;
   desconfiá de quien pida plata"*. Coherente con el ADN antiestafa (seña secreta, recompensa sin
   monto, alerta ante pedidos de dinero en el chat).
3. **Confianza = perfil + historial, no barrera de entrada.** Cualquier cuenta puede ofrecerse;
   el perfil del cuidador muestra señales: antigüedad de la cuenta, teléfono cargado,
   **"N transitorios completados"** (confirmados por la otra parte, nunca auto-declarados) y aval
   **opcional** de una institución verificada (reusa la insignia de la 0057). Quien pide decide
   con esa información.
4. **Matching por pedido → aviso por radio. Sin catálogo público de cuidadores.** Quien necesita
   publica un pedido ("gata adulta, ~2 semanas, Ñuñoa"); les llega un aviso a los cuidadores
   registrados dentro del radio; los interesados se ofrecen y **recién ahí** las partes se ven y
   chatean. Nadie sabe quién recibe animales en su casa salvo que esa persona se ofrezca a un
   pedido concreto.

## Fase 1 (la tanda 15): registro + pedidos desde "Encontré"

### La cara del voluntario — "Me ofrezco a cuidar"

- Registra: comuna, qué animales acepta (especie, tamaño, ¿se lleva con otros animales?), por
  cuánto tiempo puede, y notas libres. **Nunca su dirección.**
- El registro se puede pausar y reactivar (viaje, casa llena) sin borrarlo.
- Recibe avisos de pedidos dentro de su radio, por los canales de aviso que ya existen
  (push/bandeja, respetando `notification_prefs`).

### La cara del que necesita — pedido de cuidado

- En fase 1 se pide **desde un reporte "Encontré"** propio y activo.
- El pedido lleva: qué animal (referencia al reporte, no datos duplicados), duración estimada,
  comuna. Se publica → aviso por radio a cuidadores → llegan ofertas → el que pidió ve cada
  oferta con las señales de confianza del perfil → elige → chat interno.
- Un pedido sin ofertas **vence solo** (mismo patrón de vigencia/renovación de los reportes).

### El cuidado concretado

- La **entrega** y la **devolución** se registran en la app con confirmación de **ambas partes**.
  Eso alimenta el historial ("N transitorios completados") y deja rastro si algo sale mal.
- **Acuerdo simple de cuidado temporal descargable**, con la responsabilidad del tenedor dicha de
  frente (Ley 21.020 de tenencia responsable).
- Mientras el cuidado está activo, el reporte "Encontré" **sigue activo y buscando a la familia**:
  el hogar temporal es un puente, no un final. Aparece la familia → se registra la devolución y el
  reencuentro se celebra como siempre. Termina sin familia → el animal puede pasar al módulo de
  adopción existente.

## Fases siguientes (no se construyen en la tanda 15)

- **Fase 2 — refugios:** las instituciones verificadas piden transitorios para sus animales en
  adopción, contra el mismo registro.
- **Fase 3 — viaje/emergencia del dueño:** cualquier dueño pide cuidado para su propia mascota.
- La estructura de datos de la fase 1 ya contempla el **tipo de pedido**
  (`encontrado | refugio | dueno` — **sin tilde en los valores de la base y del código**, la
  lección del `'apareció'`/`'aparecio'` de la tanda 11), así que las fases 2 y 3 agregan
  consumidores, no re-arquitectura.

## Lo que NO es (anti-alcance)

- **Sin plata.** Jamás, en ninguna fase.
- **Sin catálogo público** de cuidadores; sin dirección publicada en ninguna parte.
- **Sin gamificar:** "3 transitorios completados" es información, no puntaje. Nada de rankings,
  medallas ni niveles.
- **Sin verificación de identidad fuerte** (RUN/cédula): guardaría justo los datos sensibles que
  la app evita por diseño.

## Restricciones heredadas del proyecto (obligatorias)

- `pets` **no suma columnas**; todo lo nuevo va en tablas propias.
- Toda escritura pide `.select(...)` con columnas explícitas y mira `data.length === 0`
  (la RLS de PostgREST rechaza en silencio; los tests no mockean `42501`).
- Registro chileno, tú-form. No gamificar, no sonar a "nadie te ayudó".
- Bloqueos, moderación y denuncias: **los mismos mecanismos que ya existen**, aplicados a
  cuidadores, pedidos y ofertas.
- Los avisos nuevos entran por la cola/despachador existente (`notification_events` +
  `send-notifications`), con sus tipos sumados al CHECK y a los espejos carácter por carácter.

## Riesgos nombrados (para el plan)

- **El apartado es un vector de robo si se diseña mal**: alguien se "ofrece" para quedarse con un
  animal. Mitigaciones de diseño: sin catálogo (el ladrón no puede ir a buscar animales, tiene que
  esperar pedidos), señales de confianza, entrega/devolución con confirmación doble, historial,
  chat interno con la alerta antiestafa ya existente, y moderación/denuncia sobre cuidadores.
- **Oferta fantasma / spam de ofertas**: topes por cuenta y por pedido (patrón de rate-limit ya
  usado en avisos anónimos), y el bloqueo se respeta.
- **Privacidad del cuidador**: comuna y radio sí; dirección y ubicación exacta jamás. El punto de
  encuentro lo acuerdan por chat.
- **Historial confirmado**: la confirmación doble evita el historial inflado; qué pasa si una
  parte no confirma (timeout, estado "sin confirmar") lo define el plan.

## Criterio de éxito de la fase 1

Un reporte "Encontré" real consigue un hogar temporal sin que ninguna de las dos personas exponga
dirección ni dinero, y el reporte sigue buscando a la familia durante el cuidado.

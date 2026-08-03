# Política de privacidad

**App:** [[PENDIENTE: nombre de la app]] · **Última actualización:** [[PENDIENTE: fecha de publicación]] · **Versión:** 1.0

> ⚠️ **Esto no es asesoría legal.** Es un texto escrito en serio, con la Ley 21.719 de Chile
> a la vista, para que se entienda de verdad cómo funciona la app y qué pasa con tus datos.
> **Antes de publicarlo en las tiendas debería revisarlo un abogado.**

---

## Léelo en 30 segundos

- Publicamos tu reporte para que tus vecinos lo vean. Eso es todo el producto.
- **Tu teléfono y tu red social son privados**: solo los ves tú. No los publicamos, no los
  vendemos, no se los damos a nadie.
- **La ubicación que se ve en el mapa no es la exacta.** La movemos al azar unos 250 metros
  y la precisa nunca se guarda.
- La app es **gratis y sin publicidad**. No hacemos perfiles publicitarios ni te rastreamos
  entre sitios.
- **Tus conversaciones del chat no las leemos.** Solo se revisa un hilo puntual si alguien
  lo denuncia.
- Puedes **borrar tu cuenta desde la app**, cuando quieras, sin pedirle permiso a nadie.

Lo que sigue es lo mismo, pero completo, porque la ley pide que esté todo escrito.

---

## 1. Quién trata tus datos

| | |
|---|---|
| **Responsable** | Pablo Espinoza, persona natural, domiciliado en Chile |
| **Nombre de la app** | [[PENDIENTE: nombre de la app]] |
| **RUT / razón social** | [[PENDIENTE: si opera como persona natural con su RUT o si constituye una sociedad — hay que decidirlo antes de publicar, porque también es el nombre que aparece público como vendedor en la App Store]] |
| **Domicilio para notificaciones** | [[PENDIENTE: domicilio — la ley pide un dato de contacto; puede bastar el correo, pero conviene confirmarlo con un abogado]] |
| **Correo de contacto y canal de derechos** | [[PENDIENTE: correo de contacto]] |
| **Sitio web** | [[PENDIENTE: dominio definitivo]] (hoy: `https://encuentras-mascota.pages.dev`) |

No hay un Delegado de Protección de Datos: la app la opera una sola persona, y esa persona
es quien responde.

[[CANAL: cualquier duda sobre tus datos]]

---

## 2. Qué datos tratamos, para qué, con qué base legal y cuánto los guardamos

Esta es la tabla que la ley pide. Está ordenada por lo que tú haces en la app.

### 2.1 Cuando te creas una cuenta

| Dato | Para qué | Base de licitud | Cuánto lo guardamos |
|---|---|---|---|
| **Correo electrónico** | Identificar tu cuenta, entrar, recuperar la contraseña, avisarte de cosas de tu reporte | **Ejecución del servicio** que pediste al registrarte | Mientras tengas cuenta. Al borrarla, se elimina de verdad de nuestro sistema de autenticación |
| **Contraseña** | Entrar a tu cuenta | Ejecución del servicio | Nunca la vemos: la guarda Supabase cifrada con un hash. No es recuperable, solo reemplazable |
| **Nombre** (el que tú escribas) | Firmar tus reportes, pistas y mensajes, para que tus vecinos sepan con quién hablan | Ejecución del servicio | Mientras tengas cuenta |
| **Fecha de nacimiento** | Verificar que cumples la edad mínima (ver §7) | **Cumplimiento de una obligación legal** (no podemos tratar datos de menores de 14 sin autorización de su madre, padre o tutor) | Mientras tengas cuenta. **Es privada: nadie más la ve, ni siquiera aparece en tu perfil público** |
| **Foto de perfil** (opcional) | Que te reconozcan en el chat y en las pistas | **Tu consentimiento** — es opcional y puedes quitarla cuando quieras | Hasta que la borres o borres tu cuenta |
| **Teléfono / WhatsApp** (opcional) | Que aparezca en el **afiche imprimible** que tú generas y decides compartir | **Tu consentimiento** | Hasta que lo borres o borres tu cuenta |
| **Red social** (opcional) | Lo mismo que el teléfono | **Tu consentimiento** | Hasta que la borres o borres tu cuenta |

> 🔒 **El teléfono y la red social son privados.** Desde el 19 de julio de 2026 nuestro
> servidor **no permite que nadie los lea, salvo tú**. No es una promesa de buena voluntad:
> es un permiso a nivel de columna en la base de datos. Ni otro usuario con cuenta, ni
> alguien que use nuestra API por fuera de la app, puede pedirlos.
>
> Si tú pones tu teléfono en el afiche y compartes el afiche por WhatsApp o lo pegas en un
> poste, eso ya es una decisión tuya y sale de nuestro control. Está bien: para eso sirve el
> afiche. Solo queremos que quede claro quién lo publica.

### 2.2 Cuando publicas un reporte de mascota perdida o encontrada

| Dato | Para qué | Base de licitud | Cuánto lo guardamos |
|---|---|---|---|
| **Fotos de la mascota** | Que la reconozcan | Ejecución del servicio (lo pediste tú al publicar) | Hasta que borres el reporte o tu cuenta |
| **Descripción, especie, raza, color, nombre de la mascota** | Que la busquen y la encuentren | Ejecución del servicio | Ídem |
| **Ubicación aproximada** | Mostrar el reporte a la gente que vive cerca | Ejecución del servicio | Ídem |
| **Recompensa** (opcional, monto informativo) | Que se sepa que ofreces una | Tu consentimiento | Ídem |
| **Fecha del reporte y de la última actualización** | Ordenar los reportes y decirte si son recientes | Ejecución del servicio | Ídem |

> 📍 **La ubicación que se publica no es la exacta.** Antes de guardarla, la desplazamos a
> una distancia y en una dirección elegidas **al azar**, dentro de un radio de unos **250
> metros**. La coordenada precisa **no se guarda en ninguna parte** — ni en la base de
> datos, ni en un registro, ni "por si acaso". Lo que no se guarda no se puede filtrar ni
> pedir por orden judicial.
>
> Lo hacemos porque el reporte es público y se ve **sin cuenta**: si publicáramos el punto
> exacto, estaríamos publicando en un mapa abierto la cuadra donde vives. Eso habilita
> acoso, robo y estafas dirigidas. Para buscar una mascota, un error de 250 metros no
> cambia nada.
>
> Y desplazamos **al azar**, no redondeamos. El redondeo se puede revertir cruzando varios
> reportes de la misma persona; un desplazamiento aleatorio distinto en cada reporte, no.

> 🖼️ **Las fotos se recomprimen antes de subirse**, y ese proceso **borra los metadatos
> EXIF** — incluidas las coordenadas GPS que tu teléfono le pone a cada foto. Verificado
> subiendo una foto con GPS real y revisando el archivo que quedó guardado. Sin esto, la
> foto delataría tu casa con mucha más precisión que el mapa.
>
> *Nota honesta:* esa verificación se hizo sobre la versión **web** de la app. La versión
> nativa (Android/iOS) usa otra implementación de la misma librería y todavía no se
> comprobó con la misma prueba. [[PENDIENTE: repetir la verificación de EXIF en el build
> nativo antes de publicar en las tiendas, y corregir esta nota]]

### 2.3 Cuando participas: pistas, avistamientos, novedades, mensajes

| Dato | Para qué | Base de licitud | Cuánto lo guardamos |
|---|---|---|---|
| **Pistas que dejas en reportes ajenos** | Ayudar a quien busca | Ejecución del servicio | Mientras exista el reporte. **Si borras tu cuenta, la pista sobrevive firmada como "Un vecino"** (ver §5) |
| **Avistamientos** ("lo vi por acá"): ubicación, nota y foto opcional | Armar el rastro de dónde estuvo la mascota | Ejecución del servicio | Ídem. La ubicación del avistamiento **también se difumina 250 m** |
| **Novedades** que publica el dueño del reporte | Contar cómo va la búsqueda | Ejecución del servicio | Mientras exista el reporte |
| **Mensajes del chat 1:1** | Que puedan coordinar la devolución | Ejecución del servicio | Mientras exista la conversación. **No los leemos**, salvo que alguien nos denuncie una conversación y tengamos que revisarla para moderar |
| **Favoritos / reportes guardados** | Tu lista privada de seguimiento | Ejecución del servicio | Mientras tengas cuenta. Es privada: nadie ve qué guardaste |

### 2.4 Avisos

| Dato | Para qué | Base de licitud | Cuánto lo guardamos |
|---|---|---|---|
| **Tus preferencias de avisos** (qué te avisamos y por qué canal) | Mandarte solo lo que pediste | Ejecución del servicio | Mientras tengas cuenta |
| **Tu zona de alerta** (centro y radio, si la configuras) | Avisarte cuando aparece un reporte cerca tuyo | Tu consentimiento — es opcional | Hasta que la borres o borres tu cuenta |
| **Token de notificación push** del dispositivo | Mandarte el aviso al teléfono | Tu consentimiento (el sistema operativo te pregunta primero) | Mientras tengas la app instalada y los push activados |
| **Cola interna de eventos** (qué aviso hay que mandar y a quién) | Que el aviso salga | Ejecución del servicio | Mientras el aviso esté pendiente de salir. [[PENDIENTE: fijar el plazo de borrado de la cola de avisos — hoy no se limpia; lo razonable es borrar lo ya procesado a los 30 días]] |

### 2.5 Moderación y seguridad

| Dato | Para qué | Base de licitud | Cuánto lo guardamos |
|---|---|---|---|
| **Denuncias** (qué denunciaste, por qué, cuándo) | Revisar y actuar sobre contenido o conductas que rompen las reglas | **Interés legítimo** en mantener la app segura, y cumplir lo que exigen las tiendas de apps | Mientras sirvan para sostener la decisión de moderación que motivaron. [[PENDIENTE: fijar plazo — recomendado 2 años, porque el registro de "actuamos rápido al ser notificados" es justamente lo que nos defiende si algo termina en tribunales]] |
| **Registro de las acciones de moderación** (qué se retiró, cuándo, por qué) | Poder demostrar que actuamos con diligencia | Interés legítimo / defensa ante reclamos | Ídem |
| **Registros técnicos** de Supabase y del hosting (IP, hora, tipo de petición) | Detectar abuso y ataques, y depurar errores | Interés legítimo en la seguridad del servicio | Lo que retenga cada proveedor por defecto. [[PENDIENTE: confirmar la retención de logs en el plan de Supabase y en Cloudflare y ponerla acá]] |

### 2.6 Cuando avisas desde el link público sin tener cuenta

Si escaneas el código del afiche y avisas que viste a la mascota sin entrar a la app, tu
nota acompaña al aviso. Dos datos de este camino son distintos y merecen su propia
explicación:

- **Correo de seguimiento (opcional).** Si al avisar dejas tu correo, lo guardamos con
  una sola finalidad: mandarte un único correo si esa mascota se reencuentra con su
  familia. No se lo mostramos a nadie —tampoco a la familia—, no se usa para nada más, y
  se borra en cualquiera de estos casos: se manda ese único correo de reencuentro, el
  reporte se cierra sin reencuentro o vence solo, o el reporte se borra.
- **Foto (opcional).** Si adjuntas una foto, solo la ve la familia del reporte. No se
  publica en el mapa, ni en la ficha, ni en ningún otro lado, y se borra junto con el
  reporte.

**No hacemos:** publicidad, perfilamiento comercial, venta o cesión de datos a terceros,
rastreo entre sitios ni apps, cookies de terceros, ni analítica que te identifique.

---

## 3. Quién más ve tus datos

### 3.1 Otros usuarios

Los reportes son **públicos y se ven sin tener cuenta**. Eso no es un descuido: es lo que
hace que funcione. Cualquier persona con el enlace —o que llegue por Google— puede ver:

- Las fotos y los datos de la mascota.
- Tu **nombre** y tu **foto de perfil**, porque firman el reporte.
- La **ubicación aproximada** (difuminada).
- Las pistas, avistamientos y novedades del reporte.

**Nadie ve:** tu correo, tu teléfono, tu red social, tu fecha de nacimiento, tus mensajes
privados, tus reportes guardados, tu zona de alerta ni tus preferencias de avisos.

### 3.2 Proveedores que nos prestan servicio

No les "vendemos" nada: son la infraestructura sobre la que corre la app. Cada uno trata
datos por encargo nuestro y solo para lo que le encargamos.

| Proveedor | Qué hace | Qué datos toca | Dónde está |
|---|---|---|---|
| **Supabase** (base de datos, cuentas, fotos) | Es donde vive la app entera | Todos los de §2 | Servidores de **AWS fuera de Chile**. [[PENDIENTE: confirmar la región exacta del proyecto en el panel de Supabase y escribirla acá]] |
| **Cloudflare Pages** | Sirve el sitio web | Datos técnicos de conexión | Red global de Cloudflare |
| **Proveedor de correo** | Manda los correos de aviso y de recuperación de contraseña | Tu correo y el texto del aviso | **Resend: Estados Unidos.** Brevo: Unión Europea. [[PENDIENTE: confirmar si el envío de correos queda en Resend o pasa a Brevo]] |
| **Expo (Expo Push Notifications)** | Manda las notificaciones al teléfono | El token del dispositivo y el texto del aviso | Estados Unidos |
| **Google Play / App Store** | Distribuyen la app | Los datos de tu cuenta de tienda, que **nosotros no vemos** | Estados Unidos |
| **Sentry** (solo si se activa) | Reporta errores de la app | Datos técnicos del error | Hoy no está activado. [[PENDIENTE: si se activa, declarar región y qué datos manda]] |

### 3.3 Autoridades

Entregamos datos a un tribunal, al Ministerio Público o a Carabineros **solo si nos llega
un requerimiento formal** que estemos obligados a cumplir. Si podemos avisarte, te avisamos.

Ten presente lo que ya dijimos: **la ubicación exacta no la tenemos**, así que no podemos
entregarla aunque nos la pidan.

---

## 4. Transferencias internacionales de datos

**Sí, tus datos salen de Chile.** La app corre sobre servicios que están fuera del país, y
la ley nos obliga a decírtelo con claridad:

- **Supabase**, que guarda la base de datos, las cuentas y las fotos, corre sobre
  infraestructura de **Amazon Web Services fuera de Chile**.
- El **correo** se envía a través de un proveedor que está en **Estados Unidos** (Resend) o
  en la **Unión Europea** (Brevo), según cuál esté activo.
- Las **notificaciones push** pasan por **Expo**, en Estados Unidos.

Esto significa que datos como tu correo, tu nombre y tus reportes se **almacenan y procesan
fuera de Chile**, en países cuya legislación de protección de datos puede ser distinta a la
chilena.

Lo que hacemos al respecto:

1. Elegimos proveedores con compromisos contractuales de protección de datos y que se
   comprometen a tratarlos solo por encargo nuestro.
2. **Minimizamos lo que sale del país.** La coordenada exacta no se guarda; los metadatos
   EXIF se eliminan; el teléfono y la red social no se pueden leer ni siquiera desde nuestra
   propia API.
3. Todo viaja cifrado (HTTPS/TLS) y se guarda cifrado en reposo.

> [[PENDIENTE: revisar con un abogado bajo qué mecanismo del capítulo de transferencias
> internacionales de la Ley 21.719 se ampara esto — cláusulas contractuales tipo, modelo
> contractual aprobado por la Agencia, o consentimiento expreso — y revisar el DPA (acuerdo
> de tratamiento de datos) que ofrecen Supabase y el proveedor de correo. Esto es de lo más
> importante que tiene que mirar el abogado.]]

---

## 5. Qué pasa cuando borras tu cuenta

Puedes borrarla desde la app: **Perfil → Borrar mi cuenta**. Es inmediato e irreversible.
No hay que escribir a nadie ni esperar.

**Se destruye lo que es solo tuyo:**

- Tus reportes, con todas sus fotos (se borran del almacenamiento, no solo de la lista).
- Tu zona de alerta, tus reportes guardados, tus preferencias de avisos y tus tokens push.
- Tu usuario del sistema de autenticación, **incluido tu correo**. Eso es lo que hace que el
  borrado sea de verdad irreversible: sin el correo, el identificador que queda ya no se
  puede asociar a ninguna persona. Y como efecto secundario, **ese correo queda libre** por
  si algún día quieres volver.

**Sobrevive, pero anónimo, lo que también es de otra persona:**

- Las **pistas y avistamientos** que dejaste en reportes ajenos quedan firmados como
  **"Un vecino"**, sin tu nombre ni tu foto. Si se borraran, le arrancaríamos información a
  alguien que todavía está buscando a su mascota.
- Tus **conversaciones** quedan visibles para la otra persona, con tu nombre reemplazado por
  **"Cuenta eliminada"** y sin posibilidad de responderte.

**Dos cosas que conviene que sepas antes de apretar el botón:**

1. Si borras tu cuenta, **también se borran las pistas y avistamientos que otros dejaron en
   tus reportes**. Se van con el reporte.
2. Lo que ya compartiste fuera de la app (un afiche que mandaste por WhatsApp, una captura
   de pantalla que alguien guardó) no lo podemos borrar. No está en nuestras manos.

📄 **También puedes pedir el borrado sin instalar la app**, desde la página pública de
solicitud de borrado del sitio web: [[PENDIENTE: URL pública de solicitud de borrado — ver
el spec, hay que crearla en `/borrar-cuenta`]].

---

## 6. Tus derechos (ARCOP)

La Ley 21.719 te da estos derechos sobre tus datos. Son gratis y los puedes ejercer las
veces que quieras.

| Derecho | Qué significa | Cómo lo ejerces |
|---|---|---|
| **A**cceso | Saber qué datos tuyos tenemos y qué hacemos con ellos | En la app ves casi todo, directamente. Lo que falte, por el canal de contacto |
| **R**ectificación | Corregir datos equivocados o incompletos | Perfil → **Editar perfil**. Tu nombre, foto, teléfono y red social los cambias tú, al instante |
| **C**ancelación (supresión) | Que borremos tus datos | Perfil → **Borrar mi cuenta**, al instante |
| **O**posición | Que dejemos de tratar tus datos para una finalidad | Perfil → **Avisos**, para apagar los avisos por canal y por tipo |
| **P**ortabilidad | Que te entreguemos tus datos en un formato que puedas llevarte | Por el canal de contacto: te mandamos un **JSON** con tus reportes, pistas, avistamientos y mensajes |

**El canal:** [[CANAL: ejercer cualquiera de estos derechos]]

**Qué te comprometemos cuando ese canal exista:**

- Acusar recibo dentro de **5 días hábiles**.
- Responderte **como máximo en 30 días corridos**, que es el plazo que fija la ley.
  Normalmente vamos a ser mucho más rápidos: la app la opera una persona y casi todos estos
  pedidos ya están resueltos con un botón.
- **Para confirmar que eres tú, respondemos al correo con el que está registrada la cuenta.**
  A propósito **no te vamos a pedir foto de tu cédula ni de tu RUT**: pedirte un documento de
  identidad para probar quién eres significaría que nos quedamos con un dato mucho más
  sensible que los que ya tenemos. Si el pedido llega desde otro correo, te vamos a pedir que
  lo repitas desde el correo de la cuenta.
- Si no podemos hacer lo que pides, te explicamos **por qué**, con el fundamento, y te
  decimos qué puedes hacer al respecto.

**Si no te gusta nuestra respuesta**, puedes reclamar ante la **Agencia de Protección de
Datos Personales** de Chile. No hace falta que nos avises antes, pero preferimos arreglarlo
directamente contigo.

---

## 7. Menores de edad

**La edad mínima para tener cuenta es 14 años.**

Por qué 14 y no 18: porque los que más buscan a una mascota perdida son justamente los
cabros chicos de la casa, y porque la ley chilena distingue entre **niños** (menores de 14)
y **adolescentes** (de 14 a 17). Para tratar datos de un niño necesitamos la autorización de
su madre, padre o tutor, y no tenemos ninguna forma seria de obtenerla y verificarla. Para
un adolescente, en cambio, el tratamiento de datos que no son sensibles puede apoyarse en su
propio consentimiento informado. Nuestra app no trata datos sensibles, así que 14 es el
límite que podemos sostener de verdad.

Cómo lo aplicamos:

1. **Al registrarte te pedimos tu fecha de nacimiento** —día, mes y año—, no una casilla de
   "confirmo que soy mayor". Una casilla no informa nada y no demuestra nada.
2. Si tienes menos de 14, **no se crea la cuenta**. Pero **no te echamos**: puedes seguir
   viendo todos los reportes, el mapa y las fotos sin cuenta, que es justamente lo que sirve
   para buscar. Para publicar un reporte o escribirle a alguien, pídele a un adulto de tu
   casa que lo haga desde su cuenta.
3. Tu fecha de nacimiento **es privada**. No aparece en tu perfil ni la ve ningún otro
   usuario. La usamos solo para esto.
4. **Si nos avisan que un titular de cuenta es menor de 14** —o si lo detectamos nosotros—
   suspendemos la cuenta, contactamos al correo registrado y, si no se acredita lo
   contrario, la eliminamos con el mismo procedimiento del §5. El detalle del procedimiento
   está en el spec de esta tanda.
5. Si eres madre, padre o tutor y crees que un niño menor de 14 se creó una cuenta, avísanos
   por el canal de contacto (§12) con el correo o el nombre de usuario. La tratamos como
   prioritaria.

**Somos honestos sobre el límite de esto:** un niño puede escribir una fecha falsa. No le
pedimos cédula ni verificamos la identidad de nadie, porque hacerlo significaría recolectar
documentos de identidad de todos nuestros usuarios para atrapar a unos pocos —el remedio
sería peor que la enfermedad—. Lo que hacemos es un esfuerzo razonable y proporcionado:
preguntar en serio, bloquear cuando corresponde, y actuar rápido cuando nos avisan.

---

## 8. Cómo protegemos tus datos

No es una lista de buenas intenciones; es lo que efectivamente está implementado y
verificado contra la base de datos real:

- **Todo viaja cifrado** (HTTPS/TLS) y se guarda cifrado en reposo.
- **Tu contraseña no la tenemos.** Se guarda con un hash irreversible. Ni Pablo puede verla.
- **Seguridad a nivel de fila (RLS) en la base de datos.** Cada tabla tiene reglas de acceso
  aplicadas por Postgres, no por la app. Aunque alguien se salte la app y hable directo con
  nuestra API, las reglas siguen ahí.
- **Tu teléfono y tu red social tienen un permiso a nivel de columna**: la base de datos
  simplemente no los entrega a nadie que no seas tú. No hay condición que burlar. Probado
  atacando la API real con un token de sesión válido de otra cuenta.
- **Las funciones que borran o anonimizan tu cuenta no aceptan un destinatario.** No existe
  la forma de pedirle al servidor "borra la cuenta de fulano": la función solo puede actuar
  sobre quien está autenticado. Probado.
- **Validación en el servidor**, no solo en el formulario: los largos, las cantidades y los
  rangos se verifican en la base de datos.
- **Las rutas de las fotos son aleatorias** (128 bits), así que nadie puede recorrer el
  almacenamiento adivinando nombres de archivo.
- **La coordenada exacta no se guarda** y **los metadatos EXIF se eliminan** (§2.2).
- **Cabeceras de seguridad** en el sitio web (HSTS, anti-clickjacking, control de referrer y
  de permisos del navegador).

Lo que **todavía no** tenemos, dicho de frente:

- No hay autenticación en dos pasos (2FA).
- El almacenamiento de fotos es un **bucket público**: cualquiera con la URL exacta ve la
  foto. Las URL no son adivinables, pero si compartes el enlace de una foto, ese enlace
  funciona.
- Al borrar un reporte, la foto asociada puede quedar en el almacenamiento aunque el reporte
  desaparezca. [[PENDIENTE: está identificado como pendiente técnico (tanda D); cuando se
  arregle, borrar este párrafo]]
- No hay una Content-Security-Policy en el sitio todavía, porque una mal ajustada rompe la
  app en silencio.

---

## 9. Si hay una filtración de datos

Si ocurre una brecha de seguridad que afecte tus datos:

1. La **contenemos** primero: cortar el acceso, rotar claves, cerrar el agujero.
2. **Avisamos a la Agencia de Protección de Datos Personales sin dilaciones indebidas.**
   La ley no fija un número de horas; nuestro compromiso interno es hacerlo dentro de
   **72 horas** desde que tomamos conocimiento, que es la referencia internacional.
3. **Si la brecha puede afectarte de verdad, te escribimos a ti**, al correo de tu cuenta y
   con un aviso dentro de la app: qué pasó, qué datos tuyos, qué hicimos y qué te conviene
   hacer (cambiar la contraseña, desconfiar de mensajes raros).
4. Lo dejamos anotado en un registro interno de incidentes, con fechas.

El procedimiento completo, paso a paso, está en el spec de esta tanda.

---

## 10. Decisiones automatizadas

**No tomamos ninguna decisión automatizada que produzca efectos jurídicos sobre ti ni que te
afecte significativamente.** No hay algoritmos que te puntúen, te clasifiquen ni decidan
nada sobre tu cuenta por su cuenta.

Sí hay procesos automáticos, pero son mecánicos y no deciden nada sobre las personas:

- La **búsqueda y el orden de los reportes** se calculan por distancia y fecha. No hay
  curaduría editorial ni reportes "destacados".
- Las **coincidencias perdido ↔ encontrado** que te sugerimos son una comparación simple de
  especie y cercanía geográfica. Son una sugerencia para que la mires tú, no una conclusión.
- Los **avisos** se disparan por reglas fijas (hay un reporte nuevo en tu zona, alguien te
  escribió), según las preferencias que tú configuraste.

Las decisiones que sí afectan a una cuenta —suspenderla o eliminarla por incumplimiento— las
revisa y las toma **una persona**, no un proceso automático. Una suspensión, además, se puede
levantar. Cómo te enteras de una de estas medidas, y qué canal hay y cuál no hay todavía para
reclamarla, está en el §7 de los Términos de uso.

---

## 11. Cambios a esta política

Si la cambiamos, actualizamos la fecha de arriba y subimos la versión. Si el cambio es
importante —datos nuevos, finalidad nueva, un proveedor nuevo— te avisamos dentro de la app
y, si corresponde, por correo, **antes** de que empiece a aplicarse.

Las versiones anteriores quedan en el historial del repositorio del proyecto, así que se
puede ver exactamente qué cambió y cuándo.

---

## 12. Contacto

[[CANAL: ejercer un derecho, denunciar algo o avisar de un problema de seguridad]]

# Tanda C — Textos legales

Fecha: 2026-07-19 · Estado: borrador redactado, **pendiente de revisión de un abogado**

> ⚠️ **Esto no es asesoría legal.** Ni este spec ni los textos que produce. Es un borrador
> serio y bien informado, basado en la investigación del 19-jul (memoria
> `app-encuentra-mascota-legal`), hecho para que el dueño lo lea, lo corrija y **lo haga
> revisar por un abogado antes de publicarlo en las tiendas**. Publicar una política de
> privacidad es afirmar cosas ante una autoridad y ante dos revisores de tienda: conviene que
> las afirmaciones estén verificadas por alguien con título.

Esta tanda **no toca código**. Produce documentos. La implementación (pantalla, páginas HTML,
campo de fecha de nacimiento) sale de acá pero se hace en otra tanda.

---

## Por qué ahora

Tres relojes distintos, y ninguno se arregla programando más rápido:

1. **La Ley 21.719 rige el 1 de diciembre de 2026.** Aplica a una persona natural, sin umbral
   de tamaño ni de ingresos, y la gratuidad es irrelevante. La excepción doméstica no cubre
   una plataforma pública con cuentas de terceros. El art. 14 ter exige una política
   **permanentemente accesible** con un contenido mínimo tasado.
2. **Google Play exige** una política de privacidad en URL pública, una lista **enumerada y
   explícita** de contenido y conductas prohibidas, y una **URL pública de solicitud de
   borrado de cuenta sin login** declarada en Data safety. Apple no pide la URL de borrado,
   pero sí el borrado in-app (que ya está en producción y verificado 12/12).
3. **El camino crítico de Google son ~21 días** (12 testers × 14 días + revisión). Los textos
   tienen que estar antes de que empiece ese reloj, no después.

---

## Los tres documentos

| Documento | Fuente de verdad | Dónde se publica |
|---|---|---|
| **Política de privacidad** | `docs/legal/politica-privacidad.md` | `/privacidad` (HTML) + `LegalScreen` in-app + ficha de ambas tiendas |
| **Términos de uso** | `docs/legal/terminos-de-uso.md` | `/terminos` (HTML) + `LegalScreen` in-app + ficha de Play |
| **Solicitud de borrado de cuenta** | por escribir (§6) | `/borrar-cuenta` (HTML, **sin login**) — solo lo exige Google |

El `.md` del repo es la fuente de verdad. El HTML y la pantalla in-app se derivan de él. Que
haya una sola fuente importa: dos textos legales que dicen cosas distintas es peor que
ninguno.

---

## Decisiones de redacción

### Se escribe para que se entienda, no para que suene legal

El dueño rechaza lo genérico y lo corporativo, y tiene razón por un motivo que además es
jurídico: la Ley 21.719 exige consentimiento **informado**, y un texto que nadie entiende no
informa nada. Una plantilla gringa traducida es formalmente completa y sustantivamente
inútil.

Reglas aplicadas:

- **Tuteo, español de Chile.** "Tú decides si...", no "EL USUARIO reconoce y acepta que...".
- **Cada documento abre con un "léelo en 30 segundos"**: seis viñetas con lo que de verdad
  importa. Es lo único que va a leer el 95% de la gente, así que tiene que ser verdad y tiene
  que ser suficiente.
- **Se explica el porqué, no solo el qué.** Cuando decimos que la ubicación se difumina,
  decimos también por qué se difumina al azar y no por redondeo. Un usuario que entiende el
  mecanismo confía; uno que lee una afirmación pelada, no.
- **Tablas para lo que la ley pide tasado** (dato → finalidad → base de licitud → plazo).
  Es lo que un fiscalizador va a buscar, y en prosa no se encuentra.
- **Se dice lo que NO tenemos.** La política tiene una sección de "lo que todavía no
  tenemos": sin 2FA, bucket público, fotos huérfanas, sin CSP. Cuesta escribirlo y es lo que
  vuelve creíble todo lo demás. Además, si algo sale mal, haberlo declarado es mucho mejor
  posición que haberlo escondido.

### Sin cláusulas de exoneración absoluta

**Decidido explícitamente: no se escribe el párrafo en mayúsculas.** Dos razones:

1. **Sería nulo.** El art. 16 letra e) de la Ley 19.496 fulmina las cláusulas que eximen
   anticipadamente de responsabilidad al proveedor. (Y si algún día la app deja de ser
   gratuita, la 19.496 pasa a aplicar de lleno.)
2. **Da mala impresión ante un revisor de tienda**, que lee decenas de estos y reconoce la
   plantilla copiada.

En su lugar, el §8 de los Términos es una sección **"De qué respondemos y de qué no"**, con
las dos listas escritas de frente. Se asume la responsabilidad por culpa o dolo propio —que
de todos modos no se puede renunciar— y se explica honestamente lo que no está en manos del
operador.

**Lo que de verdad protege en Chile no son los términos: es la diligencia demostrable.**
Chile no tiene safe harbor para intermediarios (el único es de derechos de autor, Ley 20.435,
que no cubre estafas ni difamación). Se responde por culpa propia, y la culpa nace de
**mantener el contenido después de ser notificado**. Por eso el §7 de los Términos tiene una
**tabla de plazos de respuesta a denuncias** (inmediato / 24 h / 72 h / 7 días) y el
compromiso de registrar cada retiro con fecha y motivo.

⚠️ **Ese es un compromiso operativo real, no relleno.** Escribir "retiramos en 24 horas" y no
hacerlo es peor que no escribirlo: convierte un incumplimiento difuso en el incumplimiento de
una promesa propia y escrita. Antes de publicar, el dueño tiene que estar dispuesto a
sostener esos plazos, o bajarlos.

### Se declaran las transferencias internacionales

Es lo que más se omite en las políticas copiadas y una de las cosas que la ley exige nombrar.
Se declara con nombre y país: Supabase sobre AWS fuera de Chile, el proveedor de correo
(Resend en EE.UU. o Brevo en la UE) y Expo en EE.UU. para el push. La sección §4 de la
política dice, además, qué se hace para mitigarlo: minimizar lo que sale del país (la
coordenada exacta no se guarda, el EXIF se borra, el contacto no es legible ni por la propia
API).

### La privacidad ya construida se usa como argumento

La tanda A no fue solo cumplimiento: es material de confianza y hay que decirlo. La política
declara, en concreto y con el detalle técnico:

- Teléfono y red social con **permiso a nivel de columna** — la base de datos no los entrega,
  ni siquiera a través de la API pública.
- **La coordenada exacta no se guarda.** Lo que no se guarda no se puede filtrar ni entregar
  por orden judicial. Eso está dicho tal cual en la política.
- **EXIF eliminado**, con la salvedad honesta de que la verificación fue sobre la versión web.
- Funciones de borrado **sin parámetro de destinatario**: no existe la firma para pedir borrar
  la cuenta de otro.

---

## Decisión: edad mínima **14 años**

**Recomendación: 14, no 18 y no 13.**

**Por qué no 18.** Los menores son los más motivados para buscar a la mascota de la casa. Un
límite de 18 se salta con un clic, no protege a nadie y convierte cada cuenta de un cabro de
15 en un incumplimiento nuestro. Una regla que todo el mundo rompe no es una regla.

**Por qué 14.** Porque coincide con el corte que hace la propia ley chilena, que distingue
**niños** (menores de 14) de **adolescentes** (14 a 17):

- Para tratar datos de un **niño** se necesita autorización de su madre, padre o tutor. No
  tenemos ninguna forma seria de obtenerla ni de verificarla, y montarla (verificación de
  parentesco, consentimiento verificable) es desproporcionado para una app gratuita de una
  persona.
- Para un **adolescente**, el tratamiento de datos **no sensibles** puede apoyarse en su
  propio consentimiento informado. **Nuestra app no trata datos sensibles** — y en particular
  la geolocalización **no** está en el catálogo cerrado del art. 2 de la 21.719.

Así que 14 es el único límite que se puede sostener sin construir infraestructura de
consentimiento parental. Y el riesgo de equivocarse es alto: tratar datos de menores sin
autorización parental es infracción **grave**, con multas de hasta 10.000 UTM.

**Por qué no 13** (el corte de COPPA, que es lo que copian las plantillas gringas): porque
COPPA no aplica acá y el corte chileno es 14. Copiar 13 sería copiar la ley equivocada.

[[PENDIENTE: que el abogado confirme el artículo exacto de la Ley 21.719 que hace la
distinción niño/adolescente y el régimen de consentimiento de cada tramo. La regla de fondo
está bien; la cita precisa hay que fijarla antes de publicar.]]

### Diseño del age gate

**1. Fecha de nacimiento en el registro, no una casilla.**

Tres campos (día / mes / año) o un selector de fecha en `RegisterScreen`, **obligatorio**. Se
descarta el "☐ Confirmo que soy mayor de 14": no informa nada, no demuestra nada, y no
permite saber después qué edad declaró la persona.

Se pide **antes** de crear la cuenta, no después, para no tener que borrar datos que nunca
debimos recolectar.

**2. Menor de 14 → no se crea la cuenta, pero no se lo echa.**

La pantalla explica que todavía no puede tener cuenta y le recuerda que **puede ver todos los
reportes, el mapa y las fotos sin cuenta** —que es justamente lo que sirve para buscar— y que
para publicar le pida a un adulto de la casa. El modo invitado ya construido hace que esto no
sea una puerta cerrada.

**No se guarda nada del intento fallido.** Ni la fecha, ni el correo. Bloquear a un niño y
quedarse con sus datos como consuelo sería exactamente lo contrario de lo que la regla busca.

**3. La fecha se guarda privada.**

Nueva columna `fecha_nacimiento date` en `profiles`, con **el mismo tratamiento de columna
que `telefono` y `red_social` de la migración `0018`**: fuera del `grant select` de `anon` y
`authenticated`, y accesible solo por `mi_perfil()`. No aparece en el perfil público, no la ve
nadie.

Se guarda la fecha completa y no un booleano `es_mayor` porque hay que poder recalcular la
edad (alguien cumple 14 estando en la app) y porque hay que poder demostrar sobre qué base se
tomó la decisión si algún día hay un reclamo. Es un campo, de baja sensibilidad, con
finalidad única y declarada.

**4. Edad mínima escrita en los Términos** (§2) y explicada en la Política (§7).

**5. Procedimiento de denuncia "el titular es menor de 14":**

| Paso | Qué | Plazo |
|---|---|---|
| 1 | Llega el aviso (denuncia in-app, correo de un adulto responsable, o detección propia) | — |
| 2 | **Suspender la cuenta** (no publica, no escribe; los datos quedan) | **24 horas** |
| 3 | Escribir al correo registrado explicando qué pasó y qué se necesita | mismo día |
| 4 | Si un adulto responsable acredita que la cuenta es suya, o el titular acredita tener 14+ → se reactiva | hasta **15 días** para responder |
| 5 | Si no hay respuesta o se confirma que es menor de 14 → **eliminar la cuenta** con el mismo flujo de `anonimizar_mi_cuenta()` ya en producción | al vencer el plazo |
| 6 | Anotar en el registro de moderación: fecha, motivo, resolución | siempre |

**Cómo se acredita**, y qué NO se pide: se acepta la declaración del adulto por correo. **No
se pide foto de cédula ni de certificado de nacimiento.** Pedir documentos de identidad para
resolver estos casos significaría recolectar datos mucho más sensibles que los que están en
juego. La proporcionalidad es parte del cumplimiento, no una excusa para incumplir.

**6. Lo que este diseño NO logra, dicho de frente.**

Un niño puede escribir una fecha falsa. No hay verificación de identidad y no la va a haber.
El estándar aplicable es el de **esfuerzo razonable y proporcionado**, no el de certeza:
preguntar en serio, bloquear cuando corresponde, y actuar rápido cuando avisan. Está escrito
así, con esas palabras, en la propia política — porque prometer una barrera que no existe es
peor que declarar el límite real.

---

## Canal ARCOP

**El canal:** [[PENDIENTE: correo de contacto]]. Uno solo, para todo: derechos, denuncias,
apelaciones, avisos de seguridad. Un solo correo para una app operada por una persona; tres
buzones distintos serían teatro.

**Quién responde:** Pablo Espinoza. No hay Delegado de Protección de Datos y no hace falta
declararlo.

**Plazos comprometidos:**

| Hito | Plazo |
|---|---|
| Acuse de recibo | 5 días hábiles |
| Respuesta de fondo | **30 días corridos** (el máximo legal) |
| Apelación de una decisión de moderación | 10 días hábiles |

**Verificación de identidad:** se responde **al correo con el que está registrada la cuenta**.
Si el pedido llega desde otro correo, se pide que se repita desde el de la cuenta. **No se
pide cédula ni RUT** — pedir un documento de identidad para probar quién eres significaría
quedarnos con un dato más sensible que los que ya tenemos, que es justo lo contrario de la
minimización.

**Cómo se resuelve cada derecho en la práctica:**

| Derecho | Cómo se cumple hoy | Falta construir |
|---|---|---|
| **Acceso** | La app muestra casi todo | Un export manual (consulta SQL con `service_role`, resultado a JSON) |
| **Rectificación** | Perfil → Editar, al instante, por el propio usuario | Nada |
| **Cancelación** | Perfil → Borrar mi cuenta, **ya en producción y verificado 12/12** | La URL pública de borrado (§6) |
| **Oposición** | Perfil → Avisos (4 tipos × 2 canales) | Nada |
| **Portabilidad** | — | El mismo export del acceso, en JSON |

**Lo único que falta de verdad es el export.** Los otros cuatro ya están resueltos con un
botón, lo que hace realista prometer 30 días.

[[PENDIENTE: escribir la consulta SQL de export (reportes, pistas, avistamientos, mensajes,
preferencias, zona de alerta) y dejarla guardada, para no improvisarla el día que llegue el
primer pedido.]]

---

## Procedimiento de brechas

La Ley 21.719 obliga a notificar **"sin dilaciones indebidas"** y no fija un número. **Se
adopta 72 horas** como compromiso interno: es la referencia comparada, es defendible, y un
número concreto es lo único que hace que un procedimiento se ejecute.

| Paso | Qué se hace | Plazo |
|---|---|---|
| 0 | **Detectar** — aviso de un usuario, alerta de Supabase, hallazgo propio | — |
| 1 | **Contener** — rotar claves (anon key, `service_role`, tokens de las Edge Functions), cortar el acceso, cerrar el agujero | inmediato |
| 2 | **Evaluar** — qué datos, de cuánta gente, qué riesgo real para esa gente. Anotar todo con hora | primeras 24 h |
| 3 | **Notificar a la Agencia** de Protección de Datos Personales | **≤ 72 h** desde el conocimiento |
| 4 | **Notificar a los afectados** si el riesgo es alto: correo + aviso in-app. Qué pasó, qué datos suyos, qué se hizo, qué les conviene hacer | junto con el paso 3 |
| 5 | **Registrar** en un registro interno de incidentes | siempre, incluso si no se notifica |
| 6 | **Corregir la causa raíz** y anotar la corrección | después |

**Si la brecha es de un proveedor** (Supabase, el proveedor de correo, Cloudflare), el
responsable frente a los usuarios sigue siendo Pablo. El proveedor debe avisar, y de ahí
arranca el mismo reloj.

**Se registra aunque no se notifique.** Un registro de incidentes evaluados y descartados es
la prueba de que hay un procedimiento funcionando, no de que hubo problemas.

[[PENDIENTE: revisar los DPA (acuerdos de tratamiento de datos) de Supabase y del proveedor
de correo — en particular en cuánto tiempo se comprometen a avisar de una brecha. Es dato de
entrada de este procedimiento y hoy no lo sabemos.]]

---

## Dónde vive cada texto

### Requisitos duros

- **URL HTML pública.** No PDF, no Google Docs, no detrás de login, no dentro de la app
  solamente. Play y Apple validan la URL, y el art. 14 ter pide accesibilidad permanente.
- **Enlazada en la ficha de ambas tiendas** y **también dentro de la app** (los revisores
  miran los dos).
- **La URL de borrado de cuenta, sin login**, solo la exige Google. Cumplir Apple no cumple
  Google.

### Estructura de archivos propuesta

`public/` del repo se copia tal cual a `dist/` en el `expo export`, así que basta con poner
los HTML ahí:

```
public/
  _headers            (ya existe)
  _redirects          (ya existe)
  privacidad/
    index.html        → https://<dominio>/privacidad
  terminos/
    index.html        → https://<dominio>/terminos
  borrar-cuenta/
    index.html        → https://<dominio>/borrar-cuenta

docs/legal/
  politica-privacidad.md   ← fuente de verdad
  terminos-de-uso.md       ← fuente de verdad
```

Cada HTML: una sola página, autocontenida, sin JavaScript, sin dependencias externas, legible
en el teléfono, con la fecha de última actualización visible arriba. Que cargue sin la app y
sin conexión a Supabase es parte del punto — si la app se cae, la política sigue en pie.

⚠️ **Riesgo a verificar:** `public/_redirects` tiene `/*  /index.html  200` para el ruteo de
la SPA. Cloudflare Pages sirve los archivos estáticos **antes** de aplicar esa regla, así que
`/privacidad/index.html` debería ganar. **Debería.** Es exactamente la clase de suposición
que ya costó tres bugs de producción en este proyecto: hay que comprobarlo con `curl` contra
el sitio desplegado, no darlo por hecho.

### Dentro de la app

`LegalScreen.tsx` ya existe y ya tiene un texto base (con el marcador
`CORREO_CONTACTO = '[tu correo de contacto]'` todavía sin llenar). Se reemplaza por el texto
nuevo, con un enlace a la versión web.

Además hay que agregar, y hoy **no existe**:

- **Casilla real de aceptación de Términos y Privacidad en el registro**, sin marcar por
  defecto (lo exige Play explícitamente, y la 21.719 prohíbe las casillas premarcadas), con
  los dos documentos enlazados y tocables **antes** de aceptar.
- **Guardar cuándo se aceptó y qué versión.** Sin eso no se puede demostrar el consentimiento,
  y no se sabe a quién hay que volver a pedírselo cuando cambien los textos.
- **Enlaces visibles** a ambos documentos desde Perfil.

Esto es la tanda de implementación, no esta.

### Fichas de tienda

| Dónde | Qué se pega |
|---|---|
| Play Console → Store listing → Privacy policy | `https://<dominio>/privacidad` |
| Play Console → App content → Data safety → Data deletion | `https://<dominio>/borrar-cuenta` |
| Play Console → App content → declaraciones de datos | Tiene que **coincidir** con la política |
| App Store Connect → App Privacy | Ídem, tiene que coincidir |
| App Store Connect → Privacy Policy URL | `https://<dominio>/privacidad` |
| App Store Connect → EULA | Los términos, o el EULA estándar de Apple |

⚠️ **La incoherencia entre la ficha de Data Safety y la política es una causa de rechazo
frecuente y de suspensión posterior.** Se llenan mirando la tabla del §2 de la política, no de
memoria.

---

## Lo que este spec NO cubre

- **Redactar el HTML** de las tres páginas. Deriva de los `.md`, es tarea de implementación.
- **La página `/borrar-cuenta`.** Hay que escribirla: qué se borra, qué sobrevive anonimizado,
  a qué correo escribir, y en cuánto tiempo se resuelve. El contenido sale del §5 de la
  política.
- **El campo de fecha de nacimiento**, la migración `0019` y la casilla de aceptación.
- **Aviso de cookies.** No hace falta: no hay cookies de terceros ni analítica. ⚠️ Cambia el
  día que se agregue Meta Pixel o remarketing — si algún día se quiere medir, **Cloudflare Web
  Analytics** (sin cookies, sin banner).
- **GDPR.** No aplica: no hay targeting a la UE. No contratar representante del art. 27.
- **SERNAC / Ley 19.496.** No aplica mientras la app sea gratuita: sin precio no hay relación
  de consumo. ⚠️ Cambia el día que haya publicidad o cobro. (La prohibición de escribir
  exoneraciones absolutas se mantiene igual: es criterio, no solo obligación.)
- **Ley 21.020 "Cholito".** No impone nada a una plataforma de avisos. Lo único que aporta es
  la conveniencia de prohibir la venta de animales en los Términos, que ya está hecho.

---

## Todos los `[[PENDIENTE: ...]]`

Se buscan con `grep -rn "PENDIENTE" docs/legal docs/superpowers/specs/2026-07-19-tanda-c-legal-design.md`.

**Los que bloquean la publicación:**

1. **Correo de contacto** — aparece 8 veces. Es el canal ARCOP, el de denuncias y el de
   apelaciones. Sin esto la política no cumple el art. 14 ter. Se sugiere uno del dominio
   propio (`hola@…` o `contacto@…`), no un Gmail personal: es más serio y sobrevive a un
   cambio de correo.
2. **Nombre definitivo de la app** — candidatos "Cerquita" y "Volvió". Aparece en el
   encabezado de ambos documentos y en el §1 de los Términos.
3. **RUT o razón social** — si Pablo opera como persona natural con su RUT o constituye una
   sociedad. Ojo: en la App Store el nombre legal del vendedor **aparece público**.
4. **Domicilio** para notificaciones — probablemente baste el correo, pero hay que
   confirmarlo.
5. **Dominio definitivo** — hoy `encuentras-mascota.pages.dev`; las URL de las tiendas deberían
   apuntar a un dominio propio, no a uno de hosting.
6. **Fecha de publicación** de ambos documentos.

**Los que hay que averiguar antes de publicar:**

7. **Región exacta de AWS** donde está el proyecto de Supabase — se ve en el panel. Sin esto
   la declaración de transferencias internacionales queda a medias.
8. **Proveedor de correo definitivo**: Resend (EE.UU.) o Brevo (UE). Cambia el país declarado.
9. **Retención de logs** de Supabase y Cloudflare, para poner un plazo real en la tabla del
   §2.5.
10. **DPA de Supabase y del proveedor de correo**, en especial el plazo de aviso de brechas.
11. **Plazo de borrado de la cola de avisos** (recomendado: 30 días desde procesado; hoy no se
    borra nunca — ver tanda D).
12. **Plazo de retención de denuncias y del registro de moderación** (recomendado: 2 años).
13. **Verificar EXIF en el build nativo** — la verificación actual solo cubrió la web, y la
    política lo dice con una nota que hay que borrar cuando se compruebe.
14. **Artículo exacto de la 21.719** sobre niño/adolescente y consentimiento parental.
15. **Comuna o jurisdicción** en los Términos §11.
16. **URL pública de solicitud de borrado** — la página hay que crearla.
17. **Consulta SQL de export** para acceso y portabilidad.

**Estado del sitio (no bloquea, pero está en la política como pendiente):** las fotos huérfanas
al borrar un reporte y la ausencia de CSP están declaradas en el §8 de la política. Cuando se
arreglen (tanda D), hay que borrar esos párrafos.

---

## Cómo se verifica

**1. Que los textos sean ciertos** — lo más importante, y lo que ninguna plantilla te da. Cada
afirmación técnica de la política se contrasta con el código y con la base real:

| Afirmación de la política | Cómo se comprueba |
|---|---|
| "El teléfono y la red social solo los ves tú" | Pedir esas columnas con un token de otra cuenta → `42501`. Ya verificado el 19-jul |
| "La coordenada exacta no se guarda" | Publicar y comparar lo enviado con lo guardado. Ya verificado: 235 m de desvío |
| "Las fotos no llevan EXIF" | Subir una foto con GPS y leer el archivo del bucket. Verificado en web, **falta en nativo** |
| "Puedes borrar tu cuenta desde la app" | Ya verificado 12/12 end-to-end en producción |
| "Nadie puede borrar la cuenta de otro" | La RPC no acepta destinatario → `PGRST202`. Ya verificado |
| "No hay decisiones automatizadas" | Revisar que no haya scoring ni ranking editorial. Hoy es cierto |
| "Retiramos en 24/72 horas" | **Es un compromiso a futuro.** Se verifica con el registro de moderación |

**Si una afirmación no se puede comprobar, se cambia el texto, no se comprueba a la fuerza.**

**2. Que las páginas estén donde tienen que estar**, después de desplegar:

```bash
curl -sI https://<dominio>/privacidad     # 200, text/html
curl -sI https://<dominio>/terminos       # 200
curl -sI https://<dominio>/borrar-cuenta  # 200
```

Que devuelvan HTML de verdad y **no el `index.html` de la SPA** — ese es el riesgo del
`_redirects`. Comprobar el contenido, no solo el código de estado.

**3. Que se abran sin sesión**, en ventana de incógnito y desde el teléfono.

**4. Que no quede ningún marcador sin llenar:**

```bash
grep -rn "PENDIENTE" public/privacidad public/terminos public/borrar-cuenta
```

Tiene que devolver **cero líneas** antes de mandar las URL a las tiendas. Un `[[PENDIENTE:
correo de contacto]]` publicado en la política es rechazo seguro.

**5. Que la ficha de Data Safety de Play coincida** con la tabla del §2, campo por campo.

---

## Lo que un abogado tiene que revisar sí o sí

Ordenado por riesgo:

1. **Las transferencias internacionales** (§4 de la política): bajo qué mecanismo de la
   21.719 se amparan, y si los DPA de Supabase y del proveedor de correo alcanzan. Es lo más
   caro de equivocarse y lo más difícil de arreglar después.
2. **El régimen de menores**: que 14 sea el corte correcto, el artículo exacto, y si el
   consentimiento del adolescente basta para todo lo que la app hace.
3. **Las bases de licitud** de cada tratamiento de la tabla del §2. En particular las tres
   que se apoyan en **interés legítimo** (moderación, registros técnicos, denuncias): si
   requieren una evaluación formal y si están bien fundadas.
4. **El §8 de los Términos**, "De qué respondemos y de qué no": que no haya quedado, sin
   querer, una exoneración de las que el art. 16 e) de la 19.496 anula.
5. **La lista de conductas prohibidas** (§5 de los Términos), en particular la prohibición de
   venta de animales frente al proyecto de ley en curso.
6. **Los plazos comprometidos** en el §7 de los Términos: si son sostenibles por una persona
   sola y qué exposición genera incumplirlos.
7. **La identidad del responsable**: persona natural con RUT vs. sociedad, y qué domicilio hay
   que declarar.

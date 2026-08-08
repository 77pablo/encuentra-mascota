# Tanda 23 — Comunidad del barrio (diseño)

**Fecha**: 2026-08-08 · **Estado**: APROBADO por Pablo (8-ago, chat), con sus tres
decisiones: (1) ámbito por comuna, (2) publicaciones CON comentarios y me gusta,
(3) feed mirable en tres niveles: Mi comuna / Mi región / Todo Chile.

## Qué es

Un apartado donde los vecinos publican **datos útiles del barrio en clave mascota**:
«en la tienda Juanita la comida de perro está barata», «esta vet atiende de noche»,
«en la plaza X hay una gata con crías». Publicaciones con foto opcional, comentarios
y me gusta. Es la primera superficie de texto libre PÚBLICO de la app: la moderación
se diseña de frente, no después.

## Decisiones de forma

- **Cada publicación pertenece a UNA comuna** (la elige el autor al publicar; por
  defecto la de su perfil si existe). El dato local no pierde su barrio.
- **El feed tiene selector de nivel**: Mi comuna / Mi región / Todo Chile. Con pocos
  usuarios, "Todo Chile" le da vida al muro; con crecimiento, la comuna filtra el ruido.
  El mapeo comuna→región es un dataset estático en el repo (las 346 comunas, fuente
  oficial SUBDERE), sin migración extra.
- **Leer no pide cuenta** (como los reportes). Publicar, comentar y dar me gusta, sí.
- **Categoría simple y opcional**: Dato · Recomendación · Pregunta. Nada más en v1.
- **Nombres y fotos de autor** salen por `perfil_publico` (la cadena de
  deanonimización ya está cerrada; acá no se inventa un camino nuevo).

## Datos (migración nueva, la 0071+)

- `comunidad_posts`: id, user_id, comuna (text, obligatoria), categoria (enum corto,
  nullable), texto (obligatorio, tope de largo), foto_url (nullable), creado_en,
  oculto (moderación).
- `comunidad_comentarios`: id, post_id (FK cascade), user_id, texto (tope de largo),
  creado_en, oculto.
- `comunidad_megusta`: post_id + user_id (PK compuesta: un me gusta por persona).
- **RLS espejo de las lecciones del repo**: lectura anónima SOLO de lo no-oculto y
  SOLO de las columnas públicas (user_id se maneja como en sightings/pet_tips:
  grant por columna, el anon NO lee user_id crudo — el autor sale vía join/RPC con
  `perfil_publico`); escritura solo authenticated y solo lo propio; revokes
  fail-closed `from public, anon` (lección 0018/0064/0066/0067).
- **Topes de volumen** (anti-spam, patrón de la puerta anónima): N posts por usuario
  por día, M comentarios por usuario por hora, texto con tope de largo en CHECK.
  Números exactos se fijan en el plan.
- **Conteo de me gusta** agregado (el feed no lista quiénes; solo el número y si YO
  di me gusta).

## Moderación (condición de la tanda, no opcional)

- **Denunciar** publicación y comentario reusa el sistema de denuncias existente
  (tipo nuevo de denuncia apuntando a post/comentario).
- **El admin oculta** (set oculto=true) desde el panel de moderación, con rastro en
  denuncias como retirar/suspender (la lección de moderar_reactivar: todo camino de
  moderación deja constancia).
- **Probar el panel de moderación E2E entra como tarea de esta tanda** — nadie lo usó
  nunca y con comentarios públicos pasa a ser crítico. Requiere de Pablo: resetear la
  clave de la cuenta admin (pdanielespinozavega@gmail.com, "olvidé mi clave").
- Bloqueos entre usuarios: quien bloqueó/fue bloqueado no ve los posts/comentarios
  del otro (mismo filtro que avisos/pistas).

## Avisos

- Tipo nuevo de evento: «comentaron tu publicación» → bandeja de avisos existente
  (patrón de siempre: CHECK del tipo, espejo Deno, EventoRow). Push/correo NO en v1
  (Brevo sigue inactivo; el evento queda listo para cuando se active).
- Me gusta NO avisa (ruido).

## Dónde vive

- Pantalla **Comunidad**: feed con selector de nivel + botón publicar; detalle de
  publicación con comentarios; entrada desde Inicio (chip/acceso como los demás).
- Foto de publicación: bucket propio o carpeta en el existente, compresión 1080px/0.6
  calcada de uploadPetPhoto. Borrar post borra su foto (lección del paginado: chequear
  error sin abortar).

## Qué NO entra (YAGNI)

- Sin edición de posts (borrar y volver a publicar); sin hilos anidados (comentarios
  planos); sin compartir posts afuera; sin buscador; sin notificaciones push; sin
  mensajería directa (el chat de reportes ya existe y es otra cosa).

## Riesgos dichos de frente

- **Texto libre público** = spam, comercio y abuso posibles desde el día 1. Mitigan:
  topes de volumen, denuncia + ocultar probados E2E, comuna como ámbito natural.
- **Muro vacío** con 0 usuarios: el selector "Todo Chile" mitiga; el kit comunal (t21)
  es el canal para sembrar las primeras comunas.
- La 0071+ es la migración más grande desde la 0063: ensayo begin/rollback +
  ataques como anon/authenticated son CONDICIÓN, protocolo de siempre.

## Verificación

- Suite: RLS atacada (anon no lee user_id ni ocultos; tercero no escribe lo ajeno;
  topes cortan), tono y guardas de los textos, espejos Deno idénticos.
- E2E contra el dist: publicar → aparece en el feed comunal y en Todo Chile; comentar
  → aviso al autor en su bandeja; me gusta idempotente; denunciar → aparece en el
  panel; admin oculta → desaparece del feed público; bloqueo filtra.
- Producción: migración con ensayo, datos de prueba borrados al final.

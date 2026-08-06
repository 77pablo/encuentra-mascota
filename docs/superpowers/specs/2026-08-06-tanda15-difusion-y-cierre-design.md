# Tanda 15 — Difusión y cierre

**Fecha:** 6-ago-2026 · **Aprobación:** Pablo aprobó el paquete completo en el chat ("vamos con
todo") sobre el menú presentado; las decisiones finas de abajo quedan a criterio documentado.
**Contexto:** `docs/competencia-y-oportunidades.md` + búsqueda del 6-ago: los casos en Chile se
mueven en grupos de Facebook/WhatsApp de barrio; nuestro problema n°1 es arranque en frío.

## Roadmap acordado (para las próximas tandas)
- **T15 (esta):** puente FB/WA · cierre empático + métrica · bandeja de avisos · recompensa sin monto
- **T16:** spec 2026-08-02 (contacto oculto, afiche 2 toques, moderación avisa, círculo, foto anónima)
  con las 3 decisiones finas propuestas: purga del correo de seguimiento al cierre o 60 días;
  foto anónima máx 5 MB JPEG/PNG/WebP; botón de afiche junto a Compartir y paso 3 de la guía.
- **T17:** tipo "robada" · sugerencia de intersecciones para carteles · modo emergencia/catástrofe
- **T18:** panel institucional (lote + widget embebible)

## Área 1 — Puente a Facebook/WhatsApp ("Difundir")
Botón **"Difundir en redes"** en la ficha del reporte propio (junto a Compartir) y ofrecido tras
publicar. Genera: (a) **texto listo** para pegar (nombre/especie/comuna/señas + link público, tono
vendedor-humano, sin monto de recompensa), (b) la **tarjeta 1080×1080** que ya existe, (c) lista de
**grupos sugeridos** donde pegarlo — data file `src/data/gruposDifusion.ts` con los grupos grandes
verificados (nacionales + Santiago; por comuna cuando los tengamos), cada uno con link directo.
Sin migración. Lib pura `armarTextoDifusion()` testeable. Web Share con fallback a copiar.

## Área 2 — Cierre empático + métrica de reencuentros
- Check-in **in-app** (banner en la ficha propia + Inicio) a los **3, 7 y 21 días** de publicada una
  perdida activa, complementario del NudgeVigencia (14/30/45) que es de VIGENCIA, no de cierre.
  Tono cuidado (regla: nunca "¿apareció?" pelado — «¿Cómo va la búsqueda?» con 3 salidas: "¡Volvió!"
  (flujo reencuentro existente) / "Sigo buscando" (registra y calla hasta el próximo hito) /
  "Ya no busco" (archiva sin culpa)). Perezoso como el auto-archivado: sin cron, se computa al abrir.
- **Métrica**: extender `impacto_comunidad()` (migración, próxima libre) con `tasa_reencuentro`
  (reunidas / cerradas) y `dias_mediana_reencuentro`. Es el dato que nadie tiene en Chile.
- Regla de despliegue heredada: redesplegar `send-notifications` si se toca la unión de tipos (esta
  área NO la toca: todo in-app).

## Área 3 — Bandeja de avisos in-app
Hoy NADA en la app lee `notification_events`; con Brevo muerto, los avisos dependen del push.
- Migración: policy de **SELECT solo de las filas propias** sobre `notification_events`
  (`target_user_id = auth.uid()` o el destinatario que resuelva la fila; verificar contra el esquema
  real de la 0011/0027 antes de escribirla) + grant de columnas mínimas a `authenticated`
  (tipo, datos, creado_en, estado — NUNCA columnas de otros). `anon` sigue sin nada.
- Pantalla "Avisos" (campanita con badge en el encabezado, junto a Mensajes): lista los eventos
  propios de los últimos 30 días, cada uno navegable vía `rutaANavegacion` existente. Leído/no
  leído: columna nueva o localStorage — decidir en el plan mirando el esquema (preferencia: columna
  `visto_en` para que sobreviva multi-dispositivo, si la RLS de UPDATE se puede acotar a esa columna).
- La purga de 90 días existente convive: la bandeja muestra ≤30 días.

## Área 4 — Recompensa sin monto visible
El monto publicado es imán de estafas (alertas FBI/BBB; ya lo dice el doc de competencia).
- Publicar/editar: deja de pedir monto; queda **casilla "ofrece recompensa"**.
- Fichas/tarjetas/afiche/filtros: muestran "Ofrece recompensa" a secas. Los reportes viejos CON
  monto guardado se renderizan igual (sin el monto) — el dato no se borra, deja de mostrarse.
- Sin migración obligatoria (validación cliente + render); si hay CHECK del servidor que exija
  formato del campo, se revisa en el plan. El aviso antiestafa existente se mantiene.

## Reglas transversales (heredadas, obligatorias)
Tono sin afirmar identidad ni culpar; navegación anidada absoluta desde el stack raíz; `.select()`
con columnas explícitas; deletes con `.select()` para ver filas; nada de `new Date()` en libs puras
(reloj por parámetro); guardas de forma comprobadas contra mutación; migraciones ensayadas en
`begin…rollback` con ataques y controles; verificación final contra el dist compilado.

## Orden y paralelización
4 áreas con archivos mayormente disjuntos; solapes conocidos: PetDetailScreen (1, 2 y 4) y
PublishScreen (4). Plan: áreas 1+4 juntas (mismos archivos), 2 y 3 independientes. Migraciones:
una para el área 2 y una para el área 3, numeradas al escribirlas mirando la base.

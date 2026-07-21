# Tanda de 4 funciones en paralelo — coordinación

**Fecha:** 2026-07-21

Cuatro funciones construidas por agentes en paralelo, cada una con su spec:

| # | Función | Spec | Migración |
|---|---------|------|-----------|
| 1 | Aviso proactivo de coincidencias | `2026-07-21-coincidencias-proactivas-design.md` | `0026` |
| 2 | Ficha "Mi mascota" + collar QR | `2026-07-21-mi-mascota-collar-design.md` | `0027` |
| 3 | Ciclo de vida del reporte | `2026-07-21-ciclo-vida-reporte-design.md` | `0028` |
| 4 | Guía "recién se me perdió" | `2026-07-21-guia-perdida-design.md` | (sin migración) |

## Infra del repo para paralelizar (aprendizaje de tandas anteriores)

El aislamiento automático de worktrees del Agent tool **falla** porque la sesión arranca en
`C:\WINDOWS\System32` (no es repo git). Hay que, por cada agente:
- `git worktree add` a mano desde `C:\Users\pdani\encuentra-mascota`,
- enlazar `node_modules` por junction,
- copiar `.env` (gitignoreado; sin él la app no levanta),
- darle un puerto propio (8092/8093/8094/8095).

## Números de migración asignados (no reusar)

`0026` func.1 · `0027` func.2 · `0028` func.3. La última migración existente es `0025`.

## Archivos COMPARTIDOS (colisiones conocidas → las resuelvo yo en el merge + revisión final)

La memoria repite: **la revisión final de rama encuentra lo que se cae ENTRE las tareas; no
saltearla.** Los choques esperables:

1. **`src/lib/notifyTargets.ts` y su espejo `supabase/functions/send-notifications/notifyTargets.ts`**
   — func. 1 agrega el caso `'coincidencia'`; func. 2 agrega `'escaneo_collar'`. Ambos son
   additivos (un `case` nuevo + un valor de union type + una rama en `resolverDestinatarios`
   y `componerAviso`). **Merge:** unir ambos casos en las dos copias. **Correr el test-espejo**
   (las dos copias deben quedar idénticas en lógica).

2. **CHECK de `notification_events.tipo`** — func. 1 agrega `'coincidencia'`, func. 2 agrega
   `'escaneo_collar'`. Cada migración lo escribe con `drop constraint if exists` + `add`.
   **Merge:** el estado final debe ser
   `check (tipo in ('reporte_nuevo','avistamiento','pista','coincidencia','escaneo_collar'))`.
   Verificar que la última migración aplicada deje la lista UNIÓN (o ajustar a mano al
   aplicar).

3. **`notification_events` schema** — func. 2 hace `pet_id` nullable + agrega
   `target_user_id`. Func. 1 asume `pet_id` NOT NULL (siempre lo setea, así que sigue
   funcionando con la columna nullable). Sin conflicto real; confirmar orden de aplicación
   (0026 antes que 0027 está bien; 0027 relaja la restricción sin romper a 0026).

4. **Edge Function `send-notifications/index.ts`** — func. 1 no la toca (cae en el `else` de
   `armarContexto`); func. 2 agrega un branch para `'escaneo_collar'` (destinatario desde
   `target_user_id`) y suma `target_user_id` al `EventoRow`/`select`. **Merge:** solo func. 2
   la edita; poco riesgo.

5. **`src/screens/PublishScreen.tsx`** — func. 2 agrega params de pre-carga (reportar desde
   la ficha); func. 4 agrega el ofrecimiento de la guía tras publicar una perdida.
   **Merge:** puntos distintos del archivo (params de entrada vs `onSubmit` final).

6. **`src/screens/HomeScreen.tsx`** — func. 3 agrega el nudge de vigencia; func. 4 agrega la
   entrada a la guía. **Merge:** secciones distintas de Inicio.

7. **`src/screens/PetDetailScreen.tsx`** — solo func. 3 (nudge en reporte propio) dentro de
   la tanda, pero es históricamente conflictivo. Sin choque interno esperado.

8. **Navegación / linking** — func. 2 registra `MyPets` y `Collar` (`/collar/:token`);
   func. 4 registra `GuiaPerdida`. Varias funciones registran pantallas en los stacks →
   choque additivo típico. **Merge:** unir los registros.

## Cruce lógico entre func. 1 y func. 3 (matching vs vencimiento)

La func. 3 agrega `renovado_en` y hace que los reportes vencidos (≥45 días sin renovar)
salgan de `buscar_reportes`. Por consistencia, un reporte vencido **tampoco** debería
generar coincidencias. Al mergear:
- Sumar `and coalesce(m.renovado_en, m.creado_en) >= now() - interval '45 days'` al matching
  de la func. 1 (`enqueue_coincidencias`) y a `buscar_coincidencias`.
- Si al mergear la func. 3 aún no aportó `renovado_en`, esto queda como follow-up inmediato
  (no bloquea; solo evita avisar por reportes viejos).

## Orden de despliegue (cuando toque, lo hace Pablo/yo, NO los agentes)

1. Aplicar migraciones en orden: `0026` → `0027` → `0028` (con la reconciliación del CHECK).
2. Redesplegar la Edge Function `send-notifications` (cambió `notifyTargets.ts` y el branch
   de `escaneo_collar`).
3. Subir la web (`npx expo export --platform web` → Cloudflare).
- Las funciones 1 y 2 dependen de la cola/dispatcher ya desplegados. Recordar que Brevo/Resend
  siguen en modo prueba (los avisos por correo no llegan a cualquiera hasta verificar dominio),
  pero **encolar y despachar funcionan**; el push sí llega si hay token.

## Revisión final de rama (obligatoria)

Tras fusionar las 4: `npx tsc --noEmit` limpio, `npm test` verde (incluido el test-espejo de
`notifyTargets`), y una **revisión final de rama** que busque específicamente lo que se cae
entre tareas (CHECK unión, espejo sincronizado, RPC del collar sin filtrar contacto,
`buscar_reportes` recreada desde la 0015 sin perder el arreglo del cursor). Verificación
visual con Playwright de los caminos nuevos antes de dar por cerrada la tanda.

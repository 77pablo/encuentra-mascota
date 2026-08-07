# Tanda 21 — Impacto con tasa/mediana, página /impacto, aviso de multas y kit comunal

**Fecha:** 7-ago-2026 · **Aprobación:** Pablo eligió del menú las 4 piezas (impacto tasa+mediana,
aviso de multas, página pública /impacto, kit de arranque comunal) y aprobó el diseño A tal como
se presentó. "Impacto por comuna" se integra a /impacto mostrando SOLO comunas con datos.
**Sin costo:** una migración, HTML estático y pantallas; nada pago.

## A. Impacto: tasa y mediana (migración `0070`)

- **`0070_impacto_tasa_mediana.sql`**: recrea `impacto_comunidad()` con DOS columnas nuevas al
  final: `perdidas_historicas bigint` (total de `estado='perdida'` con `oculto=false`, activas o
  no — el denominador de la tasa) y `mediana_dias numeric` (mediana de
  `reunida_en − creado_en` en días, `percentile_cont(0.5)`, **null si hay <3 reencuentros** para
  no mostrar "0 días" con un caso). Cambiar `returns table` exige `drop function` + `create`:
  van **en la misma transacción** (sin ventana) y las columnas extra no rompen a la app vieja
  (ignora campos que no conoce). Grants idénticos (anon+authenticated), `security definer`,
  criterio de `reencuentros`/`buscando` VERBATIM del cuerpo vivo (regla: `pg_get_functiondef`
  antes de recrear, comparar contra la 0044; NO copiar de la migración).
- La misma migración crea **`impacto_por_comuna()`**: `(comuna text, reencuentros bigint,
  buscando bigint)` agrupado por `pets.comuna`, `where comuna is not null`, **solo comunas con
  al menos una fila**, orden por reencuentros desc, tope 50. Mismos criterios que la global.
  La consume solo la página /impacto (B2); la app no la usa en esta tanda.
- **Cliente:** `services/impacto.ts` suma `perdidasHistoricas?` y `medianaDias?` **opcionales**
  (RPC vieja → `undefined`, la tarjeta degrada sola). En la tarjeta "Lo que logramos juntos" de
  Inicio, UNA línea humana debajo de la grilla, solo si `reencuentros ≥ 3` **y**
  `perdidasHistoricas ≥ 5`: «De cada 10 perdidas, N ya volvieron · la mitad vuelve en ~M días»
  (N = round(10·reencuentros/perdidas), M = round(medianaDias)). Lógica de umbral y redondeo en
  `lib/impactoFrase.ts` **pura y testeable**; con la base de hoy no se muestra nada.

## B1. Aviso de multas en carteles

`PuntosCartel.tsx` (y el consejo genérico de respaldo) suman una advertencia corta: en varias
comunas pegar carteles en postes/mobiliario público puede tener **multa** — pedir permiso en
comercios (vitrinas) o consultar a la municipalidad. Sin backend; texto en el componente, test de
contenido. Motivo: hoy sugerimos esquinas sin advertirlo (el doc de competencia lo registra).

## B2. Página pública `/impacto`

- **`public/impacto/index.html`** (mismo patrón que el widget: self-contained, fetch a las DOS
  RPCs como `anon`, todo texto escapado, estados cargando/vacío/error, tema claro). Muestra los
  4 números globales + tasa/mediana (mismo umbral que la app) + tabla por comuna (solo con
  datos; si no hay ninguna, la sección no aparece). Footer con link a la app. **SIN `noindex`**
  (a diferencia del widget: esta página ES material de prensa/convenio y debe indexarse), con
  `<title>` y OG tags estáticas propias.
- **`public/_worker.js`**: `/impacto` a `ESTATICOS_SIN_EXTENSION`, con test + guarda
  (`/impactos-x` NO se escapa del SPA). Verificación en runtime real con `wrangler@3`.

## B3. Kit de arranque comunal

Ataca el problema real de hoy: la base vacía / arranque en frío.
- **`src/lib/kitComunal.ts`** (puro): los textos listos para copiar — mensaje para junta de
  vecinos, para grupo de Facebook de la comuna y para dejar en una veterinaria — con la URL del
  sitio; tono cálido de la app, sin humo.
- **`src/components/AficheComunal.tsx`**: afiche genérico imprimible «¿Se te perdió tu mascota?
  Tu comuna ya tiene dónde buscarla» con QR al sitio (`qrcode-generator`, ya en deps), **paleta
  CLARA fija** (regla de los assets imprimibles: AfichePoster/CollarTag) y patrón
  contenedor/generador existente para descargarlo.
- **`src/screens/KitComunalScreen.tsx`**: descarga del afiche + los 3 mensajes con Copiar.
  Registrada en el stack raíz; entradas desde **Ayuda** y desde **Perfil (también invitado —
  misma lección de la T20: quien difunde puede no tener cuenta)**.

## Reglas transversales (heredadas)

Escapar todo texto en /impacto (aunque `comuna` la escriben usuarios → XSS almacenado, misma
regla que el widget); navegación anidada absoluta; degradación ante fallo (nada en blanco);
tests de guarda comprobados contra mutación; verificación del worker en runtime real
(`wrangler@3 pages dev dist`); verificación final contra el dist compilado; base sin residuo
(reporte de prueba → borrar con `.select()`).

## Despliegue

La `0070` se aplica cuando Pablo pase un token nuevo (con cuerpo vivo verificado antes). Hasta
entonces: la app degrada (no muestra la línea), /impacto muestra su estado de error/vacío
digno. El `dist` va por drag-and-drop como siempre.

## Fuera de esta tanda

Superficie en la app para impacto por comuna (esperar datos reales); widget v2; UI admin de
eventos (T19, sigue diferida); nombre/dominio (decisión de Pablo).

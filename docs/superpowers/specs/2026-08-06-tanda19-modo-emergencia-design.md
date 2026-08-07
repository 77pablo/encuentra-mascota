# Tanda 19 — Modo emergencia / catástrofe (v1)

**Fecha:** 6-ago-2026 · **Aprobación:** Pablo pidió seguir con las tandas grandes; esta es la de
mayor impacto. **Sin costo:** una tabla + código sobre lo existente.

## Por qué
En los incendios de Biobío (enero 2026) alguien tuvo que improvisar una página con 450+ mascotas
perdidas porque no había herramienta (The Clinic, 27-ene-2026). Una catástrofe concentra pérdidas en
una zona y un momento: es cuando más se busca y cuando una app de reencuentro más sirve.

## Alcance v1 (mínimo y shippable, sin tocar `pets` ni `buscar_reportes`)
Un **evento** es una zona + una ventana de tiempo con nombre. NO se etiquetan los reportes ni se crea
un tipo nuevo: el feed del evento **reusa `buscar_reportes`** con el centro/radio del evento y
`desde = evento.desde`. Así, todo reporte publicado en esa zona desde que empezó la emergencia
aparece solo, sin que la persona tenga que saber que existe un "modo emergencia". Cero fricción.

Los eventos los **siembra un admin** (SQL/Management API), como la semilla de veterinarias. No hay UI
de creación en v1: una catástrofe es rara y la crea quien opera la app, no los usuarios. Eso evita
toda una capa de moderación/permisos.

## Componentes
- **Migración `0069_eventos.sql`**: tabla `eventos` (`id`, `nombre`, `descripcion`, `lat`, `lng`,
  `radio_km`, `desde timestamptz`, `hasta timestamptz null`, `activo boolean default true`,
  `creado_en`). RLS: policy de SELECT para `anon`/`authenticated` con `using (activo = true)` — los
  eventos activos son públicos. **Sin policies de escritura**: solo `service_role`/admin escribe (vía
  SQL), que es el modelo sembrado. Ensayo `begin…rollback` + ataques (anon lee activo, NO lee
  inactivo, NO inserta).
- **`src/services/eventos.ts`**: `eventosActivos(): Promise<Evento[]>` — lee `eventos` activos cuya
  ventana está vigente (`hasta is null or hasta >= now()`), ordenados por `desde` desc. Degrada a `[]`
  ante error (nunca rompe Inicio).
- **`src/components/EmergenciaBanner.tsx`**: trae los eventos activos; si hay, muestra un banner
  (patrón de `ZoneAlertBanner`) con el nombre y "Ver mascotas de la zona" → `EventoScreen`; si no,
  no renderiza nada. Se monta en `HomeScreen`.
- **`src/screens/EventoScreen.tsx`**: encabezado (nombre + descripción) y la lista de reportes de la
  zona vía `buscarReportes({ lat, lng, radioKm, desde })` (reusa `services/busqueda.ts`, `PetCard`,
  scroll infinito por cursor). Un botón "Difundir esta búsqueda" que comparte el link del evento
  (reusa el patrón de compartir). Registrada en el stack raíz (con header y botón de volver);
  deep-linkeable como `evento/:id` (mismo trato que `mascota/:id`).

## Reglas transversales (heredadas)
Navegación anidada absoluta desde el stack raíz; `.select()` con columnas explícitas; degradación
ante fallo de red (banner que no aparece, feed que muestra su estado, nunca un catch mudo); migración
ensayada en `begin…rollback` con ataques y controles; guardas de forma contra mutación; verificación
final contra el dist compilado (sembrando un evento de prueba y borrándolo).

## Fuera de v1 (posibles tandas siguientes)
Etiquetar reportes a un evento explícitamente; UI de creación/cierre de eventos para admins; difusión
con tarjeta del evento; contador de mascotas del evento en la tarjeta de impacto.

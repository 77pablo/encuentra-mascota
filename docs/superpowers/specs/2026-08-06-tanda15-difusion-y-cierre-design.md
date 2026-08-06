# Tanda 15 — Puente de difusión a redes (corregida tras análisis de brecha)

**Fecha:** 6-ago-2026 · **Aprobación:** Pablo aprobó "vamos con todo" sobre el menú de mejoras.
**⚠️ CORRECCIÓN (6-ago):** al verificar contra el código y la BASE REAL, **3 de las 4 áreas del
menú YA ESTABAN CONSTRUIDAS Y APLICADAS.** Esta spec se recortó a lo genuinamente nuevo. Es la
lección repetida del proyecto: verificar contra el código antes de planificar una tanda.

## Lo que YA existe (no reconstruir — verificado en código + base)
- **Cierre "¿apareció?" (3/7/21 días):** `PreguntaSiAparecio.tsx` cableado en PetDetailScreen;
  `lib/cierreCasos.ts`; migración `0049` APLICADA (`pets.preguntado_en`, `pets.cierre_motivo`).
- **Bandeja de avisos in-app:** `AvisosScreen.tsx`, `lib/avisosBandeja.ts`, `lib/visitaAvisos.ts`,
  `services/avisos.ts` (`misAvisos()`), badge en Perfil → `navigate('MisAvisos')`; se lee por la
  RPC `mis_avisos` (0 policies directas sobre `notification_events` a propósito, `security
  definer`); migración `0051` APLICADA.
- **Recompensa sin monto:** `lib/recompensa.ts` (`ETIQUETA_RECOMPENSA='Hay recompensa'`,
  `RECOMPENSA_SI='sí'`, `tieneRecompensa()` devuelve booleano); casilla en PublishScreen.
- **Foto anónima + cerrar el círculo con quien avisó** (funciones 3/4 de la spec 2026-08-02):
  `FotoAvisoAnonimo.tsx`, migración `0061` APLICADA. Esa spec está más hecha de lo que decía.

## Roadmap corregido
- **T15 (esta):** Puente de difusión a Facebook/WhatsApp (lo único nuevo de aquel menú).
- **T16:** revisar qué queda REALMENTE de la spec 2026-08-02 (buena parte ya está) — análisis de
  brecha primero, como acá.
- **T17:** tipo "robada" · sugerencia de intersecciones para carteles · modo emergencia/catástrofe.
- **T18:** panel institucional (lote + widget embebible).
- **Pulido diferido (opcional):** `impacto_comunidad` hoy devuelve `reencuentros` (el número que
  nadie tiene, ya cubierto) pero no una TASA ni la mediana de días. Añadirlas es una migración
  chica; no bloquea nada.

---

## Qué construye la T15: "Difundir en redes"

Los casos en Chile se mueven en grupos de Facebook y WhatsApp de barrio (búsqueda 6-ago); nuestro
problema n°1 es arranque en frío. Hoy la app comparte la **tarjeta 1080** (`compartirTarjeta`) y el
**link** (`petUrl`), pero no ayuda a llevarlos ADONDE está la gente ni arma el texto. Eso es el hueco.

### Componentes (archivos)
- **`src/lib/difusionRedes.ts`** (NUEVO, puro, testeable): `armarTextoDifusion(pet, url)` arma el
  texto listo para pegar — nombre/especie/comuna/última zona/señas + link público. **Sin monto de
  recompensa** (solo "Hay recompensa" vía `tieneRecompensa`, reutilizado). Tono humano, sin
  gamificar, sin afirmar. Sin `new Date()` adentro. Devuelve string plano (los grupos de FB/WA no
  renderizan markdown). NO incluye teléfono (privacidad; el contacto va por la ficha).
- **`src/data/gruposDifusion.ts`** (NUEVO, data file): lista curada de grupos públicos grandes con
  su `url`, `nombre`, `alcance` ('nacional' | comuna) y `red` ('facebook' | 'whatsapp'). Arranca con
  los nacionales verificados (SOS Perritos, Perros Perdidos Santiago, Animales Perdidos/Encontrados
  Chile) — links reales, sin inventar. `gruposSugeridos(comuna)` ordena: los de la comuna primero,
  después nacionales. Comentario que exige verificar cada link antes de sumarlo (un grupo muerto
  frustra al que más lo necesita).
- **`src/components/DifundirEnRedes.tsx`** (NUEVO): hoja/tarjeta que (1) muestra el texto con un
  botón **Copiar** (Clipboard) y otro **Compartir** (Web Share con fallback a copiar), (2) botón
  **Compartir la tarjeta** que reusa el `TarjetaGenerador` existente, (3) lista de grupos sugeridos,
  cada uno con "Abrir grupo" (`Linking.openURL`). Una línea honesta: "Pegá el texto en el grupo; la
  foto se comparte aparte con el botón de arriba" (FB no acepta texto+imagen por URL).
- **`src/screens/PetDetailScreen.tsx`** (MODIFICAR): botón **"Difundir en redes"** junto a
  "Compartir" (solo en el reporte propio, `esMio`), que abre `DifundirEnRedes`. Y ofrecerlo tras
  publicar una perdida (en el flujo de PublishScreen o su confirmación).

### Reglas transversales (heredadas, obligatorias)
Tono sin afirmar identidad ni culpar; navegación anidada absoluta desde el stack raíz; `.select()`
con columnas explícitas; nada de `new Date()` en libs puras (reloj/valores por parámetro); guardas de
forma comprobadas contra mutación; verificación final contra el dist compilado con Playwright.

### Sin migración
Todo cliente. No toca la base, la cola de avisos ni las Edge Functions.

### Riesgo y mitigación
El riesgo es una lista de grupos que envejece o un link muerto. Mitigación: data file chico y
explícito, con test que valida forma (todos con `https://`, `nombre` no vacío, `red` válida) y un
comentario que obliga a verificar el link a mano antes de agregarlo. Nada de scraping ni auto-descubrimiento.

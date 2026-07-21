# Bloqueos de tienda — diseño (2026-07-21)

## Contexto

La app está en producción y muy completa, pero **no se puede publicar en App Store /
Google Play** por tres huecos concretos que la investigación legal (19-jul) ya había
identificado. Ninguno es una feature nueva de producto: son requisitos de las tiendas.
Este spec cubre los tres que **no dependen de nada del usuario** (correo de contacto,
nombre legal, dominio de correo quedan fuera).

1. **Filtro proactivo al publicar.** Apple (guideline 1.2) exige un método para *impedir*
   que se publique contenido objetable, no solo reaccionar. Hoy se publica todo tal cual.
   Denunciar + bloquear + borrado ya existen (Tanda B); falta el filtro.
2. **Página web de borrado de cuenta.** Google exige una URL pública, **sin login**, para
   pedir el borrado sin instalar la app. No existe. (Apple NO la exige; el borrado in-app
   ya está y verificado 12/12.)
3. **`app.config.ts` incompleto.** Faltan permisos y textos que ambas tiendas revisan.

## Decisiones tomadas (con el usuario, 21-jul)

- **Moderación de imagen: sin IA.** Casilla de confirmación obligatoria + el control real
  es denunciar (ya existe) + retiro rápido con registro. Cero costo, ninguna API externa,
  nada que declarar como transferencia internacional (Ley 21.719), privacidad intacta.
  Apple lo acepta para apps de bajo riesgo (fotos de animales) cuando hay denuncia+bloqueo.
- **Alcance del filtro de texto: el reporte.** Se aplica al publicar y al editar un
  reporte (editar es el bypass obvio del publicar). NO se aplica a pistas, novedades,
  avistamientos, perfil ni chat privado (esos los cubre la denuncia reactiva +
  bloquear/denunciar). La función se escribe **pura y reutilizable** para poder extenderla
  más adelante sin reescribir.

## 1 · Filtro proactivo al publicar

### 1a. Filtro de texto — `src/lib/moderarTexto.ts` (puro, con tests)

```ts
export type ResultadoModeracion = { ok: true } | { ok: false; motivo: string };
export function moderarTextoReporte(campos: {
  nombre?: string; raza?: string; descripcion?: string; recompensa?: string;
}): ResultadoModeracion;
```

- Concatena los campos, **normaliza** (minúsculas + sin acentos vía
  `text.ts`/`String.normalize('NFD')`) y busca **por palabra completa** (límite `\b` sobre
  el texto normalizado) en tres categorías, en orden; devuelve el primer motivo que caiga:

  | Categoría | Qué caza | Motivo (mensaje al usuario) |
  |---|---|---|
  | Odio/discriminación | insultos raciales/homofóbicos (lista corta y explícita) | "El texto tiene términos ofensivos o discriminatorios. Quítalos para publicar." |
  | Sexual explícito | términos sexuales explícitos | "El texto tiene contenido sexual. Esta app es solo para reunir mascotas con su familia." |
  | Venta de animales | **co-ocurrencia** de verbo de venta (`vendo/venta/se vende/vendé/precio $`) **y** término de animal/cría | "No se pueden publicar ventas de animales. Este espacio es solo para mascotas perdidas o encontradas." |

- **Anti-falso-positivo, por diseño (lo más importante):**
  - NO incluye garabatos coloquiales chilenos (weón, culiao, etc.): no son "objetables"
    para Apple y bloquearían a gente angustiada publicando de buena fe.
  - Match por límite de palabra sobre texto normalizado → no caza subcadenas inocentes
    (problema Scunthorpe).
  - La categoría **venta** es la de mayor riesgo de falso positivo → exige co-ocurrencia
    (verbo de venta + sustantivo de animal/precio), no solo "vendo". "Vendí mi casa" no cae.

- **Tests obligatorios:** descripción real de mascota pasa; cada categoría bloquea con su
  motivo; subcadena inocente NO bloquea; acentos y mayúsculas se normalizan; "vendí mi
  casa"/"precio de la libertad" NO caen en venta; texto vacío pasa.

### 1b. Enganche en las pantallas

- `PublishScreen.onSubmit`, orden de validación: `petSchema` → **`moderarTextoReporte`
  (antes de subir fotos, falla rápido)** → foto presente → comuna → **casilla confirmada**.
  El motivo se muestra con `notify('Revisá el texto', motivo)`.
- `EditPetScreen.onSubmit`: agregar la misma llamada a `moderarTextoReporte` sobre los
  campos editados, con su propio `notify`. (Cierra el bypass de editar.)

### 1c. Casilla de confirmación (solo al publicar)

- Estado `confirmado: boolean` en `PublishScreen`, **sin premarcar**, con el patrón ya
  usado en `RegisterScreen.tsx:180-204` (Ionicons `checkbox-outline`/`square-outline` +
  `TouchableOpacity`, `accessibilityRole="checkbox"`).
- Texto: *"Confirmo que la foto es de la mascota y que el reporte respeta las **reglas de
  la comunidad**."* — "reglas de la comunidad" navega a `LegalScreen`.
- Publicar bloqueado hasta tildarla; si falta, `notify('Falta confirmar', '...')`.

## 2 · Página web de borrado — `public/borrar-cuenta/index.html`

- HTML autocontenido (CSS inline, tono claro de marca), **sin login**. Servido en
  `/borrar-cuenta/` — Cloudflare Pages sirve los estáticos **antes** del catch-all de
  `public/_redirects` (verificado el 19-jul: `/metadata.json` devuelve JSON, no HTML).
- Contenido: qué se borra / qué queda (espejo de `DeleteAccountScreen.tsx`), método
  principal (desde la app: Perfil → Borrar mi cuenta, con pasos), método alternativo por
  correo, plazo de respuesta de **30 días** (coherente con ARCOP / Ley 21.719).
- ⚠️ **Bloqueo heredado, no nuevo:** el correo de contacto no está decidido (igual que los
  36 `[[PENDIENTE]]` legales). La página se deja lista y parametrizada con un marcador
  visible (`[[CORREO_CONTACTO]]`) y **no es subible hasta definir el correo**.
- Descubribilidad (menor): enlazar la página desde `LegalScreen` si hay URL pública.

## 3 · `app.config.ts`

- **Android** `permissions`: agregar `'android.permission.POST_NOTIFICATIONS'` (sin esto no
  llega push en Android 13+). Agregar `blockedPermissions:
  ['android.permission.ACCESS_BACKGROUND_LOCATION']` (si una dependencia lo cuela, Google
  exige formulario+video+revisión de semanas).
- **iOS** `infoPlist`: agregar `NSPhotoLibraryUsageDescription` (se usa `expo-image-picker`
  para la galería). Alargar los 3 purpose strings con la fórmula que Apple acepta: **qué se
  accede + para qué función + beneficio** (los genéricos cortos los rechaza).

## Verificación

1. `npm test` — nueva suite `moderarTexto` verde; el resto sigue verde.
2. `npx tsc --noEmit` — 0 errores.
3. `npx expo config --type public` — compila y refleja los permisos/purpose strings nuevos.
4. Playwright a `localhost:8091`:
   - Publicar con texto ofensivo → bloqueado con el motivo correcto (sin subir foto).
   - Publicar con texto limpio pero sin tildar la casilla → bloqueado.
   - Publicar con texto limpio + casilla tildada → publica.
   - Editar un reporte metiendo un término bloqueado → bloqueado.
5. Abrir `public/borrar-cuenta/index.html` en el navegador → se ve bien, el marcador de
   correo es visible.

## Fuera de alcance (dependen del usuario, se anotan como bloqueos vivos)

- Correo de contacto, nombre legal, dominio de correo (Resend/Brevo).
- Los otros 35 `[[PENDIENTE]]` de los docs legales.
- Elección del nombre de la app.

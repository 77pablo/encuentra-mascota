# Tanda A — Privacidad y seguridad de datos · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar de exponer datos que no hace falta exponer: el teléfono y la red social de los usuarios, la cuadra donde viven, y las fotos de su bucket.

**Architecture:** Seis piezas independientes. Cinco son cambios locales de app (módulos puros nuevos + los servicios que los usan). La sexta cierra la lectura de columnas en Postgres con una migración y exige una coreografía de despliegue: **app primero, migración después**.

**Tech Stack:** Expo (React Native + TypeScript), react-native-web, Supabase (Postgres + RLS + PostgREST + Storage), Jest.

## Global Constraints

- **Español en todo lo visible y en los comentarios de código.** Los mensajes de error nunca filtran texto crudo de Postgres ni de Supabase Auth (ver `src/lib/dbErrors.ts` y `src/lib/authErrors.ts`).
- **El prefijo `userId/` de las rutas de fotos es intocable.** `mis_fotos_a_borrar()` y la Edge Function `delete-account` filtran con `^<uid>/[^/]+$`. Romperlo reabre una escalada de privilegios ya corregida.
- **Toda la suite debe quedar verde:** `npm test` (actualmente 239 tests) y `npx tsc --noEmit` (0 errores).
- **Ningún dato de prueba queda en producción.** La base está limpia; se deja limpia.
- Los tests siguen el patrón existente de builder falso encadenable (ver `__tests__/services/pets.test.ts:10`).
- Commits en español, sin `--no-verify`.

## Orden

Tareas 1→5 son locales y sin riesgo de despliegue. La tarea 6 (`profiles`) va al final porque necesita coreografía. La tarea 7 es la verificación end-to-end contra producción.

---

## Task 1: Advertencia antiestafa

**Files:**
- Create: `src/ui/AvisoEstafa.tsx`
- Modify: `src/screens/ChatScreen.tsx`, `src/screens/PetDetailScreen.tsx`, `src/screens/PublishScreen.tsx`
- Test: `__tests__/lib/avisoEstafa.test.ts`

**Interfaces:**
- Produces: `<AvisoEstafa variante="chat" | "recompensa" />` — componente de presentación sin estado.
- Produces: `TEXTO_AVISO_ESTAFA: Record<'chat' | 'recompensa', string>` exportado desde `src/ui/AvisoEstafa.tsx`, para poder testear el texto sin renderizar.

- [ ] **Step 1: Escribir el test que falla**

Este test verifica lo único testeable sin render: que los textos existan, estén en español y contengan las tres ideas obligatorias (no transferir por adelantado, ver a la mascota en persona, la app no media en el pago).

```ts
// __tests__/lib/avisoEstafa.test.ts
import { TEXTO_AVISO_ESTAFA } from '../../src/ui/AvisoEstafa';

describe('textos del aviso antiestafa', () => {
  it('cubre las dos variantes', () => {
    expect(Object.keys(TEXTO_AVISO_ESTAFA).sort()).toEqual(['chat', 'recompensa']);
  });

  it('el aviso del chat advierte de no transferir por adelantado', () => {
    const texto = TEXTO_AVISO_ESTAFA.chat.toLowerCase();
    expect(texto).toContain('nunca transfieras');
    expect(texto).toContain('en persona');
  });

  it('el aviso de recompensa deja claro que la app no media en el pago', () => {
    const texto = TEXTO_AVISO_ESTAFA.recompensa.toLowerCase();
    expect(texto).toContain('no participamos');
    expect(texto).toContain('nunca transfieras');
  });

  it('ningun aviso queda vacio ni es un placeholder', () => {
    for (const texto of Object.values(TEXTO_AVISO_ESTAFA)) {
      expect(texto.trim().length).toBeGreaterThan(40);
      expect(texto).not.toMatch(/TODO|TBD|lorem/i);
    }
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest __tests__/lib/avisoEstafa.test.ts`
Expected: FAIL — `Cannot find module '../../src/ui/AvisoEstafa'`

- [ ] **Step 3: Implementar el componente**

Seguir el estilo de los componentes de `src/ui` (usan `AppText`, `colors` de `src/theme`, e `Ionicons` de línea — nunca emojis a color).

```tsx
// src/ui/AvisoEstafa.tsx
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { colors, spacing, radii } from '../theme';
import { AppText } from './AppText';

// El timo "tengo a tu mascota, transfiere la recompensa" esta documentado y
// activo en Chile. Advertirlo donde ocurre (el chat y el monto) es la
// mitigacion mas barata que tenemos, y es tambien lo que nos separa de una
// imputacion por negligencia: la estafa la comete el usuario, pero no avisar
// seria culpa nuestra.
export const TEXTO_AVISO_ESTAFA = {
  chat:
    'Cuidado con las estafas: nunca transfieras dinero antes de ver a tu mascota en persona. ' +
    'Nadie honesto te va a pedir un pago por adelantado.',
  recompensa:
    'Nunca transfieras la recompensa por adelantado: entrégala solo cuando tengas a tu mascota contigo. ' +
    'No participamos en el pago ni lo garantizamos, es un acuerdo entre ustedes.',
} as const;

export function AvisoEstafa({ variante }: { variante: keyof typeof TEXTO_AVISO_ESTAFA }) {
  return (
    <View style={styles.caja}>
      <Ionicons name="shield-outline" size={15} color={colors.muted} style={styles.icono} />
      <AppText muted size={12} style={styles.texto}>
        {TEXTO_AVISO_ESTAFA[variante]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  icono: { marginTop: 1 },
  texto: { flex: 1, lineHeight: 17 },
});
```

⚠️ Verificar los nombres reales exportados por `src/theme` (`colors.surfaceMuted`, `spacing`, `radii`) y por `src/ui/AppText`. Si alguno no existe, usar el equivalente que ya usan otros componentes de `src/ui` — **no inventar tokens nuevos**.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx jest __tests__/lib/avisoEstafa.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Cablear el aviso en las tres pantallas**

- `ChatScreen.tsx`: `<AvisoEstafa variante="chat" />` una sola vez, bajo la cabecera de la conversación y sobre la lista de mensajes. Debe quedar fuera del scroll de mensajes para que no desaparezca.
- `PetDetailScreen.tsx`: `<AvisoEstafa variante="recompensa" />` inmediatamente debajo del bloque que muestra el monto, **renderizado solo si el reporte tiene recompensa**.
- `PublishScreen.tsx`: `<AvisoEstafa variante="recompensa" />` bajo el campo donde se escribe el monto, **solo si el campo tiene algo escrito**.

Buscar los puntos de anclaje con: `grep -n "recompensa" src/screens/PetDetailScreen.tsx src/screens/PublishScreen.tsx`

- [ ] **Step 6: Verificar tipos y suite completa**

Run: `npx tsc --noEmit && npm test`
Expected: 0 errores, todos los tests verdes (243 = 239 + 4)

- [ ] **Step 7: Commit**

```bash
git add src/ui/AvisoEstafa.tsx __tests__/lib/avisoEstafa.test.ts src/screens/ChatScreen.tsx src/screens/PetDetailScreen.tsx src/screens/PublishScreen.tsx
git commit -m "feat(seguridad): advertencia antiestafa en el chat y junto a la recompensa"
```

---

## Task 2: Aviso al pedir el teléfono

**Files:**
- Modify: `src/screens/ProfileScreen.tsx` (formulario de edición, cerca de la línea 264)

**Interfaces:**
- Consumes: nada.
- Produces: nada exportado. Es solo copy.

⚠️ **Dependencia semántica con la Task 6:** este texto afirma que solo el dueño ve sus datos de contacto. **Eso todavía no es verdad cuando se escribe** — pasa a serlo con la migración `0018`. Es aceptable porque el despliegue de ambas va junto (la app se sube antes que la migración, y la ventana es de minutos). Si por cualquier razón la Task 6 se cae del alcance, **este texto debe caerse también**: no podemos afirmar algo falso sobre privacidad.

- [ ] **Step 1: Añadir la línea de ayuda bajo los campos de contacto**

En el bloque `editingPerfil`, después del `Input` de "Red social" y antes de `editActionsRow`:

```tsx
<AppText muted size={12} style={styles.avisoContacto}>
  Solo tú ves estos datos. Los usamos para armar el afiche de tu mascota, que tú decides
  compartir.
</AppText>
```

Y el estilo, junto al resto de `StyleSheet.create` del archivo:

```ts
avisoContacto: { marginTop: -spacing.xs, marginBottom: spacing.sm, lineHeight: 16 },
```

- [ ] **Step 2: Verificar tipos y suite**

Run: `npx tsc --noEmit && npm test`
Expected: 0 errores, 243 tests verdes (sin cambios de conteo)

- [ ] **Step 3: Commit**

```bash
git add src/screens/ProfileScreen.tsx
git commit -m "feat(perfil): decir que los datos de contacto son privados al pedirlos"
```

---

## Task 3: Rutas de fotos no adivinables

**Files:**
- Create: `src/lib/idAleatorio.ts`
- Modify: `src/services/storage.ts:14`
- Test: `__tests__/lib/idAleatorio.test.ts`

**Interfaces:**
- Produces: `idAleatorio(): string` — 32 caracteres hexadecimales (128 bits).
- Consumido por: `uploadPetPhoto` en `src/services/storage.ts`.

**Por qué:** hoy la ruta es `${userId}/${Date.now()}.jpg`. En un bucket público eso es adivinable: el `userId` viaja en cualquier reporte y el minuto de publicación se estima, así que quedan unos pocos miles de intentos por foto. Permite sacar fotos de reportes ya borrados.

- [ ] **Step 1: Escribir el test que falla**

```ts
// __tests__/lib/idAleatorio.test.ts
import { idAleatorio } from '../../src/lib/idAleatorio';

describe('idAleatorio', () => {
  it('devuelve 32 caracteres hexadecimales', () => {
    expect(idAleatorio()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('no repite (1000 tiradas, todas distintas)', () => {
    const vistos = new Set(Array.from({ length: 1000 }, () => idAleatorio()));
    expect(vistos.size).toBe(1000);
  });

  it('no depende del reloj: dos llamadas seguidas difieren', () => {
    expect(idAleatorio()).not.toBe(idAleatorio());
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest __tests__/lib/idAleatorio.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/idAleatorio'`

- [ ] **Step 3: Implementar**

```ts
// src/lib/idAleatorio.ts

// Identificador aleatorio de 128 bits en hexadecimal, para nombrar archivos en
// el bucket publico. Antes las fotos se llamaban `Date.now()`, que es
// adivinable: con el user_id (que viaja en cualquier reporte) y el minuto
// aproximado de publicacion quedaban pocos miles de intentos por foto.
//
// Usa `crypto.getRandomValues` cuando existe (navegador y React Native
// moderno). El respaldo con Math.random no es criptografico, pero incluso asi
// deja un espacio de busqueda inabordable para enumerar un bucket, que es lo
// que nos importa aca.
export function idAleatorio(): string {
  const bytes = new Uint8Array(16);
  const cripto = (globalThis as any).crypto;
  if (cripto?.getRandomValues) {
    cripto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx jest __tests__/lib/idAleatorio.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Usarlo en la subida**

En `src/services/storage.ts`, reemplazar la línea 14:

```ts
// ANTES
const path = `${userId}/${Date.now()}.jpg`;

// DESPUÉS
const path = `${userId}/${idAleatorio()}.jpg`;
```

Y el import arriba: `import { idAleatorio } from '../lib/idAleatorio';`

⚠️ **El prefijo `${userId}/` se queda tal cual.** `mis_fotos_a_borrar()` y `delete-account` validan con `^<uid>/[^/]+$`; sin ese prefijo alguien podría hacer que el borrado de cuenta elimine fotos ajenas (Critical corregido en la tanda anterior). Un id hexadecimal no contiene `/`, así que la regex sigue calzando.

- [ ] **Step 6: Verificar que la defensa del borrado sigue verde**

Run: `npx jest __tests__/services/account.test.ts`
Expected: PASS — en particular los casos de rutas ajenas rechazadas.

- [ ] **Step 7: Suite completa y commit**

```bash
npx tsc --noEmit && npm test
git add src/lib/idAleatorio.ts __tests__/lib/idAleatorio.test.ts src/services/storage.ts
git commit -m "feat(seguridad): nombres de foto aleatorios para que el bucket no sea enumerable"
```
Expected: 246 tests verdes (243 + 3)

---

## Task 4: Desplazar las coordenadas públicas

**Files:**
- Create: `src/lib/difuminarUbicacion.ts`
- Modify: `src/services/pets.ts:33` (`createPet`), `src/services/sightings.ts:24` (`addSighting`)
- Test: `__tests__/lib/difuminarUbicacion.test.ts`

**Interfaces:**
- Consumes: `LatLng` desde `src/lib/geo.ts` (`{ lat: number; lng: number }` — confirmar los nombres reales de los campos antes de escribir).
- Produces: `difuminarUbicacion(punto: LatLng, radioMetros?: number): LatLng` y la constante `RADIO_DIFUMINADO_M = 250`.

**Por qué:** los reportes son públicos y se ven **sin cuenta**. La coordenada por defecto es la del GPS de quien publica, es decir su casa. Publicarla en un mapa abierto habilita acoso, robo por descarte de casa vacía y estafa dirigida.

**Decisiones ya tomadas en el spec (no reabrir):**
- Se guarda **solo** el punto desplazado. La coordenada precisa no se guarda en ninguna parte.
- Desplazamiento **aleatorio**, no redondeo — el redondeo se revierte cruzando varios reportes de la misma persona.
- Se aplica **una sola vez, al escribir**, para que el pin quede fijo y no se pueda promediar.

- [ ] **Step 1: Escribir el test que falla**

```ts
// __tests__/lib/difuminarUbicacion.test.ts
import { difuminarUbicacion, RADIO_DIFUMINADO_M } from '../../src/lib/difuminarUbicacion';
import { distanceKm } from '../../src/lib/geo';

const SANTIAGO = { lat: -33.45, lng: -70.66 };

describe('difuminarUbicacion', () => {
  it('nunca devuelve el punto original', () => {
    for (let i = 0; i < 200; i++) {
      const movido = difuminarUbicacion(SANTIAGO);
      expect(movido.lat === SANTIAGO.lat && movido.lng === SANTIAGO.lng).toBe(false);
    }
  });

  it('se mantiene dentro del radio', () => {
    for (let i = 0; i < 500; i++) {
      const metros = distanceKm(SANTIAGO, difuminarUbicacion(SANTIAGO)) * 1000;
      expect(metros).toBeLessThanOrEqual(RADIO_DIFUMINADO_M + 1);
    }
  });

  it('dos llamadas con la misma entrada dan puntos distintos (no es redondeo)', () => {
    const a = difuminarUbicacion(SANTIAGO);
    const b = difuminarUbicacion(SANTIAGO);
    expect(a).not.toEqual(b);
  });

  // Con `r = R*u` los puntos se apelotonan en el centro y el original queda
  // demasiado adivinable. Con `r = R*sqrt(u)` la distribucion es uniforme en
  // AREA: la mitad de las muestras deben caer mas alla de R/sqrt(2) (~0.707R).
  it('reparte el punto por area, no concentrado en el centro', () => {
    const lejos = Array.from({ length: 2000 }, () => difuminarUbicacion(SANTIAGO))
      .map((p) => distanceKm(SANTIAGO, p) * 1000)
      .filter((m) => m > RADIO_DIFUMINADO_M * 0.707).length;
    expect(lejos).toBeGreaterThan(2000 * 0.4);
    expect(lejos).toBeLessThan(2000 * 0.6);
  });

  // Sin corregir por cos(lat) el desplazamiento en longitud se achica al
  // alejarse del ecuador: en Punta Arenas seria la mitad de lo que creemos.
  it('corrige la longitud por latitud', () => {
    const PUNTA_ARENAS = { lat: -53.16, lng: -70.91 };
    const muestras = Array.from({ length: 500 }, () =>
      distanceKm(PUNTA_ARENAS, difuminarUbicacion(PUNTA_ARENAS)) * 1000,
    );
    expect(Math.max(...muestras)).toBeLessThanOrEqual(RADIO_DIFUMINADO_M + 1);
    expect(Math.max(...muestras)).toBeGreaterThan(RADIO_DIFUMINADO_M * 0.8);
  });

  it('respeta un radio explicito', () => {
    for (let i = 0; i < 200; i++) {
      const metros = distanceKm(SANTIAGO, difuminarUbicacion(SANTIAGO, 50)) * 1000;
      expect(metros).toBeLessThanOrEqual(51);
    }
  });
});
```

⚠️ Antes de escribir el test, confirmar la forma real de `LatLng` en `src/lib/geo.ts:1` y la firma de `distanceKm`. Si los campos no se llaman `lat`/`lng`, ajustar **el test y la implementación**, no inventar un tipo nuevo.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest __tests__/lib/difuminarUbicacion.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/difuminarUbicacion'`

- [ ] **Step 3: Implementar**

```ts
// src/lib/difuminarUbicacion.ts
import { LatLng } from './geo';

// Cuanto movemos el punto que se publica. 250 m alcanza para tapar la cuadra
// sin estorbar la busqueda: quien busca a su mascota mira radios de kilometros.
export const RADIO_DIFUMINADO_M = 250;

const METROS_POR_GRADO_LAT = 111_320;

// Mueve el punto a un lugar aleatorio dentro de un circulo, para no publicar la
// casa de quien reporta: los reportes se ven SIN CUENTA y la coordenada por
// defecto es la del GPS de quien publica.
//
// Es aleatorio y no redondeo a proposito. El redondeo es reversible: con varios
// reportes de la misma persona se recupera el punto real cruzandolos. Un
// desplazamiento aleatorio independiente por reporte, no.
//
// Se llama UNA SOLA VEZ, al escribir en la base (no al mostrar), y se guarda
// solo el resultado. Asi el pin queda fijo y nadie puede promediar varias
// lecturas para volver al original.
export function difuminarUbicacion(punto: LatLng, radioMetros = RADIO_DIFUMINADO_M): LatLng {
  const angulo = Math.random() * 2 * Math.PI;
  // sqrt(u) reparte los puntos de forma uniforme en AREA. Con u a secas se
  // apelotonarian cerca del centro, o sea cerca de la casa.
  const distancia = radioMetros * Math.sqrt(Math.random());

  const desplazamientoLat = (distancia * Math.cos(angulo)) / METROS_POR_GRADO_LAT;
  // Un grado de longitud mide menos a medida que uno se aleja del ecuador. Sin
  // este coseno, en el sur de Chile moveriamos el punto bastante menos de lo
  // que creemos.
  const metrosPorGradoLng = METROS_POR_GRADO_LAT * Math.cos((punto.lat * Math.PI) / 180);
  const desplazamientoLng = (distancia * Math.sin(angulo)) / metrosPorGradoLng;

  return {
    lat: punto.lat + desplazamientoLat,
    lng: punto.lng + desplazamientoLng,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx jest __tests__/lib/difuminarUbicacion.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Escribir el test de que los servicios lo aplican**

Añadir a `__tests__/services/pets.test.ts` (seguir el patrón de builder falso ya presente en el archivo):

```ts
it('createPet guarda la ubicacion difuminada, nunca la exacta', async () => {
  const builder = makeQueryBuilder({ data: { id: 'p1' }, error: null });
  mockFrom.mockReturnValue(builder);

  const input = { lat: -33.45, lng: -70.66, especie: 'perro', estado: 'perdido' } as any;
  await createPet(input, ['f.jpg'], 'u1');

  const guardado = builder.insert.mock.calls[0][0];
  expect(guardado.lat).not.toBe(-33.45);
  expect(guardado.lng).not.toBe(-70.66);
  // Movido, pero no a otro barrio: el reporte tiene que seguir siendo util.
  expect(Math.abs(guardado.lat - (-33.45))).toBeLessThan(0.01);
});
```

Y el equivalente en `__tests__/services/sightings.test.ts` para `addSighting`.

- [ ] **Step 6: Aplicarlo en los dos servicios**

En `src/services/pets.ts`, dentro de `createPet`:

```ts
export async function createPet(input: PetInput, fotos: string[], userId: string): Promise<Pet> {
  // La ubicacion se difumina ACA, en el borde de escritura, para que ninguna
  // pantalla pueda saltarse el paso por olvido. La coordenada exacta no se
  // guarda en ninguna parte: lo que no se guarda no se puede filtrar.
  const { lat, lng } = difuminarUbicacion({ lat: input.lat, lng: input.lng });
  const { data, error } = await supabase
    .from('pets')
    .insert({ ...input, lat, lng, fotos, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Pet;
}
```

En `src/services/sightings.ts`, dentro de `addSighting`, igual: difuminar `input.lat`/`input.lng` antes del `insert`. Un avistamiento es la ubicación de quien lo reporta y tiene el mismo problema.

- [ ] **Step 7: Correr la suite completa**

Run: `npx tsc --noEmit && npm test`
Expected: 254 tests verdes (246 + 6 + 2). Si algún test viejo de `pets`/`sightings` afirmaba que se guarda la coordenada exacta, **actualizarlo** — el comportamiento cambió a propósito.

- [ ] **Step 8: Commit**

```bash
git add src/lib/difuminarUbicacion.ts __tests__/lib/difuminarUbicacion.test.ts src/services/pets.ts src/services/sightings.ts __tests__/services/pets.test.ts __tests__/services/sightings.test.ts
git commit -m "feat(privacidad): publicar la ubicacion difuminada y no la casa de quien reporta"
```

---

## Task 5: Confirmar que las fotos no llevan EXIF

**Files:** ninguno, salvo que la verificación falle.

**Esto es una verificación, no una implementación.** `src/services/storage.ts:6` pasa toda foto por `ImageManipulator.manipulateAsync` (resize a 1080 + recompresión JPEG), que re-codifica el archivo sin copiar metadatos. Todo indica que ya estamos limpios, pero **no se da por hecho**: una foto tomada en casa lleva GPS exacto embebido, y con el bucket público eso anularía por completo la Task 4.

- [ ] **Step 1: Preparar una foto con GPS**

Conseguir un JPEG con EXIF de GPS (una foto de celular sin editar). Confirmar que **sí** tiene coordenadas antes de usarla, o la prueba no prueba nada:

```bash
python -c "from PIL import Image; from PIL.ExifTags import TAGS,GPSTAGS; im=Image.open('foto.jpg'); ex=im._getexif() or {}; print({TAGS.get(k):v for k,v in ex.items() if TAGS.get(k)=='GPSInfo'})"
```
Expected: un diccionario GPSInfo **no vacío**.

- [ ] **Step 2: Subirla por la app real**

Levantar `npx expo start --web`, entrar con la cuenta de prueba, publicar un reporte adjuntando esa foto.

- [ ] **Step 3: Descargar el archivo del bucket y leerle los metadatos**

Tomar la URL pública del reporte recién creado, descargarla y correr el mismo comando del paso 1 sobre el archivo descargado.
Expected: **sin GPSInfo**.

- [ ] **Step 4: Decidir**

- **Sin EXIF** → no se escribe código. Anotar el resultado en `ESTADO.md` y seguir.
- **Con EXIF** → parar y abrir una tarea aparte: quitar los metadatos antes de subir. No improvisar dentro de esta tanda.

- [ ] **Step 5: Borrar el reporte de prueba**

Dejar la base limpia (0 reportes de prueba), como se hizo en las tandas anteriores.

---

## Task 6: Cerrar la fuga de contacto en `profiles`

**Files:**
- Create: `supabase/migrations/0018_contacto_privado.sql`
- Modify: `src/services/profile.ts`, `src/screens/ProfileScreen.tsx:40`, `src/screens/PetDetailScreen.tsx:310`
- Test: `__tests__/services/profile.test.ts`

**Interfaces:**
- Produces: `getMyProfile(): Promise<Profile | null>` — **sin parámetro** (antes recibía `userId`).
- Sin cambios: `updateMyProfile(userId, fields)`, la interfaz `Profile`.

**Por qué:** la política es `for select to authenticated using (true)` (`0001_init.sql:10`), así que cualquier cuenta lee el teléfono y la red social de todos. Comprobado el 19-jul leyendo los datos reales de Pablo desde una cuenta descartable.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/0018_contacto_privado.sql
-- La politica de FILAS no cambia: nombre y foto siguen siendo publicos a
-- proposito (firman las pistas, aparecen en los chats y sostienen el modo
-- invitado). Lo que se cierra son dos COLUMNAS.

revoke select on public.profiles from anon, authenticated;
grant  select (id, nombre, foto_perfil, creado_en, eliminado_en)
       on public.profiles to anon, authenticated;

-- `update` no se toca: editar el perfil propio sigue funcionando. `id` queda
-- legible porque lo necesitan el `where` de los updates y la propia RLS.

-- El dueño recupera sus datos por aca. SIN PARAMETROS a proposito: no existe
-- una firma que permita pedir la fila de otra persona. Es la misma tecnica de
-- `anonimizar_mi_cuenta()`, que el 19-jul devolvio PGRST202 a un intento de
-- pasarle un user_id.
create or replace function public.mi_perfil()
returns table (
  id uuid,
  nombre text,
  foto_perfil text,
  telefono text,
  red_social text,
  creado_en timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.nombre, p.foto_perfil, p.telefono, p.red_social, p.creado_en
  from public.profiles p
  where p.id = auth.uid()
$$;

revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;
```

⚠️ Si `create or replace` falla por cambio de tipo de retorno, hay que `drop function public.mi_perfil();` antes — `create or replace` **no puede cambiar el tipo de retorno** de una función Postgres (ya nos pasó).

- [ ] **Step 2: Escribir el test que falla**

En `__tests__/services/profile.test.ts`, añadir el mock de `rpc` al mock de supabase existente y estos casos:

```ts
it('getMyProfile pide la RPC sin pasarle ningun id', async () => {
  mockRpc.mockResolvedValue({ data: [{ id: 'u1', nombre: 'Pablo', telefono: '+569' }], error: null });

  const perfil = await getMyProfile();

  expect(mockRpc).toHaveBeenCalledWith('mi_perfil');
  expect(mockRpc.mock.calls[0].length).toBe(1); // sin argumentos: el servidor decide de quien es la fila
  expect(perfil?.telefono).toBe('+569');
});

it('devuelve null si la RPC no trae filas', async () => {
  mockRpc.mockResolvedValue({ data: [], error: null });
  expect(await getMyProfile()).toBeNull();
});

// Mientras la app nueva este arriba y la migracion 0018 todavia no, la RPC no
// existe. Sin este escalon nadie veria su perfil en esa ventana.
it('si la RPC no existe todavia, cae al select de siempre', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });
  const builder = makeQueryBuilder({ data: { id: 'u1', nombre: 'Pablo' }, error: null });
  mockFrom.mockReturnValue(builder);

  const perfil = await getMyProfile('u1');

  expect(mockFrom).toHaveBeenCalledWith('profiles');
  expect(perfil?.nombre).toBe('Pablo');
});

it('propaga los errores que no son "la RPC no existe"', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
  await expect(getMyProfile()).rejects.toMatchObject({ code: '42501' });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx jest __tests__/services/profile.test.ts`
Expected: FAIL

- [ ] **Step 4: Implementar**

```ts
// src/services/profile.ts
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  nombre: string;
  foto_perfil: string | null;
  telefono: string | null;
  red_social: string | null;
  creado_en: string;
}

// El telefono y la red social ya no se pueden leer con un select: la migracion
// 0018 le quito al rol `authenticated` el permiso sobre esas dos columnas, para
// todos y tambien para su dueño. Se recuperan por esta RPC, que no recibe
// parametros: el servidor decide de quien es la fila y no hay forma de pedir la
// de otra persona.
//
// `userIdRespaldo` existe solo para la ventana de despliegue: la app sube antes
// que la migracion, y en ese rato `mi_perfil()` todavia no existe. Cuando la
// migracion lleve tiempo aplicada, este parametro y su escalon se pueden borrar.
export async function getMyProfile(userIdRespaldo?: string): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('mi_perfil');

  if (error) {
    // PGRST202 = la funcion no existe todavia.
    if (error.code !== 'PGRST202' || !userIdRespaldo) throw error;
    const res = await supabase.from('profiles').select('*').eq('id', userIdRespaldo).maybeSingle();
    if (res.error) throw res.error;
    return (res.data ?? null) as Profile | null;
  }

  const filas = (data ?? []) as Profile[];
  return filas[0] ?? null;
}

export async function updateMyProfile(
  userId: string,
  fields: { nombre?: string; foto_perfil?: string; telefono?: string; red_social?: string },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx jest __tests__/services/profile.test.ts`
Expected: PASS

- [ ] **Step 6: Actualizar los dos llamadores**

- `ProfileScreen.tsx:40`: `getMyProfile(user.id)` → `getMyProfile(user.id)` **se mantiene** (el argumento ahora es el respaldo de despliegue, no el sujeto de la consulta). Confirmar que el tipo sigue calzando.
- `PetDetailScreen.tsx:310`: igual.

Nota: la firma acepta el id como respaldo opcional, así que ambos llamadores siguen compilando sin cambios. Verificar con `tsc` que no haya quedado ningún llamador esperando la firma vieja obligatoria.

- [ ] **Step 7: Suite completa y commit**

```bash
npx tsc --noEmit && npm test
git add supabase/migrations/0018_contacto_privado.sql src/services/profile.ts __tests__/services/profile.test.ts
git commit -m "feat(privacidad): cerrar la lectura del telefono y la red social ajenos"
```

---

## Task 7: Desplegar y verificar contra producción

⚠️ **El orden es obligatorio.** Si se aplica la migración antes de subir la web, el `select('*')` de la app vieja falla entero (PostgREST no devuelve datos parciales) y **todos** pierden su perfil hasta que suba el build nuevo.

- [ ] **Step 1: Verde local**

Run: `npx tsc --noEmit && npm test`
Expected: 0 errores, ~254 tests verdes.

- [ ] **Step 2: Compilar y revisar el build ANTES de subirlo**

```bash
npx expo export --platform web
```
Levantar el `dist` localmente y comprobar que la app arranca. **Tres de los bugs de producción anteriores solo existían en el sitio compilado** (`env.ts` con `process.env`, `getPet` con `.single()`, errores de auth en inglés): el dev server no los mostraba.

- [ ] **Step 3: Subir la web**

Cloudflare Pages → proyecto `encuentras-mascota` → Deployments → Create new deployment → rama `main` → arrastrar `dist`. Misma URL, con Rollback disponible.

- [ ] **Step 4: Aplicar la migración `0018`**

Con el Personal Access Token de Supabase (que Pablo entrega en un archivo, nunca pegado en el chat):

```bash
curl -X POST "https://api.supabase.com/v1/projects/ywlrcfaybnikaurxsgtj/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d @consulta.json
```

- [ ] **Step 5: Atacar la API con un token real** (el nivel de verificación que sí encuentra estos bugs)

Sacar un `access_token` del `localStorage` de una cuenta descartable y, saltándose la app:

| Ataque | Esperado |
|---|---|
| `GET /rest/v1/profiles?select=telefono,red_social` | `42501` permission denied |
| `GET /rest/v1/profiles?select=*` | falla |
| `GET /rest/v1/profiles?select=id,nombre,eliminado_en` | **200 con datos** (control de no-regresión: si esto falla, se rompió el chat y las pistas) |
| `POST /rest/v1/rpc/mi_perfil` sin token | `42501` |
| `POST /rest/v1/rpc/mi_perfil` con token | solo la fila propia |
| `POST /rest/v1/rpc/mi_perfil` con `{"user_id": "<otro>"}` | `PGRST202` — la firma no existe |

- [ ] **Step 6: Verificar en el navegador (Playwright)**

Trucos ya aprendidos, para no repetir el descubrimiento: los botones RN-web no se clickean por texto (hay que buscar el `div` ancho cuyo `innerText` termina en la etiqueta y clickear por coordenadas); en Perfil hay que filtrar cajas visibles (`w>0 && h>0 && 0<y<900`) porque `get_by_text` agarra pestañas montadas atrás; los inputs del login se buscan por placeholder y `:visible`; el submit de Publicar queda fuera de la ventana (`scroll_into_view_if_needed()`); la foto es obligatoria para publicar; y en Windows hay que correr con `PYTHONIOENCODING=utf-8`.

Comprobar: (a) el Perfil propio muestra y edita el teléfono; (b) el afiche del reporte propio sigue trayendo el WhatsApp; (c) publicar un reporte deja el pin **cerca pero no encima** del punto elegido; (d) los chats y las pistas siguen mostrando el nombre del autor.

- [ ] **Step 7: Dejar la base limpia y anotar el estado**

Borrar todo dato de prueba. Actualizar `ESTADO.md` con lo hecho, lo verificado y el resultado de la comprobación de EXIF.

```bash
git add ESTADO.md
git commit -m "docs: tanda A de privacidad aplicada y verificada en produccion"
```

---

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Aplicar la migración antes de subir la web deja a todos sin perfil | Orden explícito en la Task 7 + el escalón de respaldo de la Task 6 |
| Cambiar la forma de la ruta de fotos rompe la defensa del borrado de cuenta | El prefijo `userId/` se conserva; `account.test.ts` debe seguir verde (Task 3, Step 6) |
| El texto "solo tú ves estos datos" es falso si la Task 6 no llega | Dependencia anotada en la Task 2; si 6 se cae, 2 se cae |
| Si las fotos llevan EXIF, la Task 4 no sirve de nada | La Task 5 lo verifica con una foto real antes de dar la tanda por cerrada |
| Los tests unitarios no ven bugs de datos reales | Task 7 ataca la API de verdad, como en la tanda 4 |

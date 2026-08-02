# Privacidad del contacto + 4 funciones — Plan de implementación (tanda 13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la spec aprobada `docs/superpowers/specs/2026-08-02-privacidad-y-4-funciones-design.md`: ocultar el contacto (número en el afiche, red social del perfil público, correo enmascarado), el afiche en dos toques, la bandeja de moderación que avisa, cerrar el círculo con quien avisó desde el afiche, y foto en el aviso anónimo.

**Architecture:** Cuatro áreas casi disjuntas (A afiche · B perfil · C moderación · D aviso anónimo), pensadas para cuatro implementadores en paralelo sobre ramas `feat/t13-a` … `feat/t13-d` desde `feat/mvp-encuentra-mascota`, como en las tandas 10–12. Cuatro migraciones nuevas (`0059`–`0062`; la `0056` sigue libre a propósito). Los filtros de privacidad viven en la BASE (RPCs `security definer`), nunca solo en el cliente. La cola `notification_events` se reusa para los dos avisos nuevos; la foto anónima entra por una Edge Function con `service_role` a un bucket PRIVADO.

**Tech Stack:** Expo / React Native Web · Supabase (Postgres + RLS + Edge Functions en Deno) · Jest (`jest-expo`, tests en `__tests__/` de la raíz) · TypeScript estricto.

## Global Constraints

- **Todo el texto visible en español rioplatense con voseo** («Avisale», «Escaneá», «Apagala»). Nada de tuteo neutro.
- **TDD**: primero el test en rojo, después el código, después verde, después commit. `npx tsc --noEmit` → 0 errores y `npx jest <suite>` verde antes de cada commit.
- **El número de chip, el teléfono ajeno y el correo ajeno NUNCA salen por ninguna superficie nueva** (RPC, push, correo, bandeja, datos de evento).
- **Toda función SQL nueva**: `security definer` + `set search_path = public, pg_temp` + `revoke all … from public` + grants explícitos por rol (fail-closed, criterio 0019/0050).
- **Todo tipo nuevo de `notification_events`** toca 6 lugares o se pierde en silencio: el CHECK de `tipo` (patrón drop+add con la lista UNIÓN completa), `TipoEvento` en `src/lib/notifyTargets.ts` **y** en `supabase/functions/send-notifications/notifyTargets.ts` (son espejos: editarlos idéntico), la unión `EventoRow` de `send-notifications/index.ts:32-38`, `componerAviso`, `quiereEsteTipo`/`resolverDestinatarios`, y `textoDeAviso` en `src/lib/avisosBandeja.ts`.
- **Orden de despliegue obligatorio** (lección de la tanda 12, ESTADO.md): redesplegar `send-notifications` ANTES de aplicar las migraciones que encolan tipos nuevos; aplicar TODAS las migraciones antes de subir la web (la `0059` agrega una columna que `updateMyProfile` va a mandar: si la web sube primero, PostgREST rechaza el update ENTERO y guardar el perfil se rompe para todos).
- **Punteros, no copias**: `datos` de un evento nuevo lleva lo mínimo (claves de listas cerradas, ids); nunca texto libre de un tercero que la moderación pueda retirar después (lección de la tanda 11, `avisosBandeja.ts:57-67`).
- **PostgREST calla**: un `delete`/`update` sin `.select()` devuelve éxito aunque la RLS lo haya filtrado (cuarta aparición en la tanda 12). Todo write nuevo del cliente que necesite confirmación usa `.select()`.
- Los tests de DB son estáticos (leen el SQL del repo): van en `__tests__/db/migracionNNNN.test.ts`, uno por migración nueva.
- Commits terminan con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 0: Numeración, guardián de última migración y ramas

Bloquea a las cuatro áreas: fija los números de migración ANTES de paralelizar (la tanda 12 tuvo que dejar la `0056` libre por chocar numeración) y mueve el guardián de «esta es la última migración del repo».

**Files:**
- Create: `supabase/migrations/0059_privacidad_red_social.sql` (stub)
- Create: `supabase/migrations/0060_denuncia_nueva.sql` (stub)
- Create: `supabase/migrations/0061_seguimiento_anonimo.sql` (stub)
- Create: `supabase/migrations/0062_foto_aviso_anonimo.sql` (stub)
- Modify: `__tests__/db/migracion0058.test.ts` (sacar el guardián de última migración)
- Create: `__tests__/db/ultimaMigracion.test.ts` (el guardián, con casa propia)

**Interfaces:**
- Produces: los cuatro archivos de migración con su nombre DEFINITIVO (las áreas B, C y D los rellenan; nadie crea otros números).

- [ ] **Step 1: Crear los cuatro stubs**

Cada uno con solo su cabecera, por ejemplo `0059_privacidad_red_social.sql`:

```sql
-- 0059: interruptor "mostrar mi red social" (tanda 13, área B).
-- Se rellena en la tarea B1 del plan 2026-08-02-privacidad-y-4-funciones.
```

(Los otros tres: `-- 0060: aviso de denuncia nueva a los admins (área C, tarea C1).`, `-- 0061: correo de seguimiento del aviso anónimo (área D, tarea D1).`, `-- 0062: foto en el aviso anónimo (área D, tarea D4).`)

- [ ] **Step 2: Mover el guardián de última migración**

Localizarlo: `grep -n "0058" __tests__/db/migracion0058.test.ts` y buscar el `describe`/`it` que lee el directorio `supabase/migrations` y asegura cuál es el archivo más alto (está referenciado en el comentario `__tests__/db/migracion0057.test.ts:343-349`). Cortar ese bloque ENTERO de `migracion0058.test.ts` y pegarlo en `__tests__/db/ultimaMigracion.test.ts` (con los `import`/`require` que necesite), cambiando la constante esperada de `'0058_insignia_suspendida_y_tope_de_radio.sql'` a `'0062_foto_aviso_anonimo.sql'`. No duplicarlo: en `migracion0058.test.ts` no queda rastro.

- [ ] **Step 3: Verificar**

Run: `npx jest __tests__/db/ultimaMigracion.test.ts __tests__/db/migracion0058.test.ts`
Expected: PASS (el guardián ve la `0062` como última porque los stubs ya existen).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0059_privacidad_red_social.sql supabase/migrations/0060_denuncia_nueva.sql supabase/migrations/0061_seguimiento_anonimo.sql supabase/migrations/0062_foto_aviso_anonimo.sql __tests__/db/
git commit -m "t13: numeracion 0059-0062 reservada y guardian de ultima migracion con casa propia"
```

---

## ÁREA A — El afiche: número opcional, QR primero, dos toques (funciones 0.a y 1)

### Task A1: Lógica pura — `armarAfiche` con `incluirNumero`, respaldo de dominio propio, texto de imprenta

**Files:**
- Modify: `src/lib/afiche.ts`
- Test: `__tests__/lib/afiche.test.ts`

**Interfaces:**
- Produces: `armarAfiche(pet, profile, opciones?: { incluirNumero?: boolean }): AficheContent` (tercer parámetro NUEVO, default `{ incluirNumero: true }`); `AficheContent.url: string` (deja de ser `string | null`); constantes `TEXTO_QR: string` y `RESPALDO_WEB: string`; función nueva `textoImprenta(nombre: string | null): string`. Consumen: A2 (poster) y A3 (pantalla).

- [ ] **Step 1: Tests en rojo**

Agregar a `__tests__/lib/afiche.test.ts` (dentro del `describe('armarAfiche')` existente, que ya guarda/restaura `EXPO_PUBLIC_WEB_URL`):

```ts
it('con incluirNumero apagado no queda ni el número, ni los dígitos, ni el link', () => {
  const c = armarAfiche(pet({}), { telefono: '+56912345678' }, { incluirNumero: false });
  expect(c.whatsappDisplay).toBe('');
  expect(c.whatsappDigits).toBe('');
  expect(c.waLink).toBeNull();
});

it('sin opciones se comporta como siempre (prendido por defecto)', () => {
  const c = armarAfiche(pet({}), { telefono: '+56912345678' });
  expect(c.whatsappDisplay).toBe('+56912345678');
});

it('la url NUNCA es null: sin env cae al dominio nuestro, no a uno ajeno', () => {
  delete process.env.EXPO_PUBLIC_WEB_URL;
  const c = armarAfiche(pet({ id: 'abc' }), null);
  expect(c.url).toBe('https://encuentras-mascota.pages.dev/mascota/abc');
});

describe('textoImprenta', () => {
  it('nombra a la mascota y pide papel fluorescente y tamaño grande', () => {
    const t = textoImprenta('Luna');
    expect(t).toContain('Luna');
    expect(t).toContain('fluorescente');
    expect(t).toContain('carta');
  });
  it('sin nombre no queda un hueco raro', () => {
    expect(textoImprenta(null)).not.toContain('undefined');
  });
});
```

- [ ] **Step 2: Correr y ver el rojo** — Run: `npx jest __tests__/lib/afiche.test.ts` · Expected: FAIL (`textoImprenta is not defined`, `incluirNumero` ignorado).

- [ ] **Step 3: Implementar en `src/lib/afiche.ts`**

```ts
// El QR es lo primero que se lee: tiene que decir a dónde va y que no hay
// trámite. Es lo que de verdad frena a un vecino: no saber qué le van a pedir.
export const TEXTO_QR = 'Escaneá para ver su ficha y avisar. No hace falta crear cuenta.';

// Respaldo si falta EXPO_PUBLIC_WEB_URL en la app compilada. Es NUESTRO
// dominio de Cloudflare (el mismo ORIGEN_PROD del worker): el respaldo viejo,
// encuentratumascota.app, era un dominio ajeno — quien lo registrara se
// quedaba con los escaneos de cada afiche impreso.
export const RESPALDO_WEB = 'https://encuentras-mascota.pages.dev';

export interface AficheOpciones {
  /** Decisión de Pablo: prendido por defecto; el dueño lo apaga al generar. */
  incluirNumero?: boolean;
}

export function armarAfiche(
  pet: Pet,
  profile: Pick<Profile, 'telefono'> | null,
  opciones: AficheOpciones = {},
): AficheContent {
  const incluirNumero = opciones.incluirNumero ?? true;
  const digits = incluirNumero ? normalizarWhatsapp(profile?.telefono) : '';
  return {
    titular: pet.estado === 'perdida' ? 'SE BUSCA' : '¿CONOCÉS A ESTA MASCOTA?',
    nombre: pet.nombre || null,
    subtitulo: armarSubtitulo(pet),
    senas: pet.descripcion,
    hayRecompensa: tieneRecompensa(pet.recompensa),
    zonaTexto: 'Visto cerca de esta zona',
    foto: pet.fotos?.[0] ?? null,
    whatsappDigits: digits,
    whatsappDisplay: incluirNumero ? (profile?.telefono ?? '') : '',
    waLink: digits ? `https://wa.me/${digits}` : null,
    url: petUrl(pet.id) ?? `${RESPALDO_WEB}/mascota/${pet.id}`,
  };
}

// Lo que se le pide a la fotocopiadora, listo para copiar/compartir. La
// búsqueda física resuelve el 30-49% de los casos; este texto es la parte
// de la app que trabaja en la calle.
export function textoImprenta(nombre: string | null): string {
  const quien = nombre ? `de ${nombre}` : 'de mi mascota';
  return (
    `Hola, necesito imprimir afiches ${quien}:\n` +
    `· 20 copias tamaño carta, a color.\n` +
    `· En papel fluorescente (amarillo o rosado) si tienen: una hoja blanca no se ve desde un auto.\n` +
    `· 4 ampliaciones a doble carta para las esquinas con más tráfico.\n\n` +
    `Después pegalos a la altura de los ojos: semáforos, paraderos, la entrada del almacén y la feria.`
  );
}
```

Y en la interfaz `AficheContent`, cambiar `url: string | null;` por `url: string;`. Ojo: `tsc` va a marcar todos los lugares que asumían `null` — el único consumidor es `AfichePoster.tsx:59` (se arregla en A2).

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/lib/afiche.test.ts && npx tsc --noEmit` · Expected: test PASS; `tsc` puede quedar rojo SOLO por `AfichePoster.tsx` (se arregla en A2; si es el único error, avanzar).

- [ ] **Step 5: Commit**

```bash
git add src/lib/afiche.ts __tests__/lib/afiche.test.ts
git commit -m "t13-a: armarAfiche con numero opcional, respaldo de dominio propio y texto de imprenta"
```

### Task A2: El póster — QR ARRIBA del número, texto nuevo, sin dominio ajeno

**Files:**
- Modify: `src/components/AfichePoster.tsx`
- Test: `__tests__/components/afichePoster.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `TEXTO_QR`, `AficheContent` con `url: string` (A1).
- Produces: mismo componente `AfichePoster({ content, foto, onFotoLoad?, onFotoError? })`; cuando `content.whatsappDisplay === ''` NO dibuja el bloque de contacto.

- [ ] **Step 1: Test en rojo** — crear `__tests__/components/afichePoster.test.tsx` copiando el andamiaje de `__tests__/components/planBusqueda.test.tsx:1-63` (react-test-renderer + `act`, mock de `@expo/vector-icons`, wrapper `<ThemeProvider>`; mockear también `../../src/components/QrCode` a un stub que renderice `null` guardando las props):

```tsx
const contenido = (extra: Partial<AficheContent> = {}): AficheContent => ({
  titular: 'SE BUSCA', nombre: 'Luna', subtitulo: 'Perro', senas: 'Chica, café',
  hayRecompensa: false, zonaTexto: 'Visto cerca de esta zona', foto: null,
  whatsappDigits: '56912345678', whatsappDisplay: '+56 9 1234 5678',
  waLink: 'https://wa.me/56912345678', url: 'https://encuentras-mascota.pages.dev/mascota/x',
  ...extra,
});

it('el QR va ANTES que el número en el orden de lectura', () => {
  const textos = aplanarTextos(render(contenido()));
  expect(textos.indexOf(TEXTO_QR)).toBeLessThan(textos.indexOf('+56 9 1234 5678'));
});

it('sin número no queda el rótulo "Contactá por WhatsApp" huérfano', () => {
  const textos = aplanarTextos(render(contenido({ whatsappDisplay: '', whatsappDigits: '', waLink: null })));
  expect(textos).not.toContain('Contactá por WhatsApp');
});

it('el QR usa la url del contenido y el fuente no conoce ningún dominio ajeno', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'AfichePoster.tsx'), 'utf8');
  expect(fuente).not.toContain('encuentratumascota.app');
});
```

(`aplanarTextos` = el helper `textos(arbol)` de `__tests__/screens/perfilPropioInstitucion.test.tsx:94-99`, copiado acá — aplana los strings del árbol en orden de render.)

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/components/afichePoster.test.tsx` · Expected: FAIL (orden al revés y dominio ajeno presente).

- [ ] **Step 3: Reordenar `AfichePoster.tsx`** — reemplazar el bloque `footer` (líneas 52-62) por una COLUMNA: primero el QR (grande, centrado), después el contacto solo si hay número:

```tsx
      <View style={styles.footer}>
        <View style={styles.qrWrap}>
          <QrCode value={content.url} size={210} />
          <AppText style={styles.qrText}>{TEXTO_QR}</AppText>
        </View>
        {content.whatsappDisplay ? (
          <View style={styles.contacto}>
            <AppText style={styles.contactoLabel}>Contactá por WhatsApp</AppText>
            <AppText style={styles.contactoNumero}>{content.whatsappDisplay}</AppText>
          </View>
        ) : null}
        <AppText style={styles.zona}>{content.zonaTexto}</AppText>
      </View>
```

Import: `import { TEXTO_QR } from '../lib/afiche';`. En los estilos: `footer` pasa de `flexDirection: 'row'` a `alignItems: 'center'`; `qrWrap` centrado con `marginBottom: 16`; `contacto` centrado (el número sigue siendo lo más grande después del titular: conserva `contactoNumero` tal cual). La `zona` queda al pie, fuera del condicional (antes vivía dentro del bloque de contacto y desaparecería junto con el número). NO tocar el bloque de recompensa: el guardián `__tests__/lib/recompensaSinMonto.test.ts:104-140` exige que el fuente contenga `ETIQUETA_RECOMPENSA` y `hayRecompensa`.

- [ ] **Step 4: Verde total** — Run: `npx jest __tests__/components/afichePoster.test.tsx __tests__/lib/recompensaSinMonto.test.ts && npx tsc --noEmit` · Expected: PASS y `tsc` 0 (el `?? 'https://encuentratumascota.app'` ya no existe).

- [ ] **Step 5: Commit**

```bash
git add src/components/AfichePoster.tsx __tests__/components/afichePoster.test.tsx
git commit -m "t13-a: el QR pasa arriba del numero, con texto que dice a donde va, y muere el dominio ajeno"
```

### Task A3: La hoja de opciones — interruptor del número + texto de imprenta + generar en dos toques

**Files:**
- Create: `src/components/AficheOpciones.tsx`
- Modify: `src/components/AficheGenerator.tsx` (prop `incluirNumero`)
- Modify: `src/screens/PetDetailScreen.tsx`
- Test: `__tests__/components/aficheOpciones.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `faltaWhatsapp`, `textoImprenta`, `armarAfiche(…, { incluirNumero })` (A1).
- Produces: `<AficheOpciones profile pet onGenerar={(incluirNumero: boolean) => void} onCerrar={() => void} />`; `<AficheGenerator pet profile incluirNumero onDone onError />` (prop nueva, default `true`).

- [ ] **Step 1: Test en rojo** — `__tests__/components/aficheOpciones.test.tsx` (mismo andamiaje que A2; mock de `Share` de react-native con `jest.spyOn(Share, 'share')`):

```tsx
it('con WhatsApp cargado arranca prendido y avisa el costo de apagarlo', async () => {
  const arbol = await montar({ telefono: '+56911111111' });
  expect(textos(arbol)).toContain('Incluir mi número de WhatsApp');
  apagarSwitch(arbol); // fila con testID="switch-numero"
  expect(textos(arbol).join(' ')).toContain('Sin tu número puede avisar menos gente');
});

it('sin WhatsApp no hay interruptor: hay una línea honesta y el afiche sale igual', async () => {
  const arbol = await montar({ telefono: null });
  expect(textos(arbol).join(' ')).toContain('solo con el QR');
  expect(buscarSwitch(arbol)).toBeNull();
});

it('Descargar llama a onGenerar con la decisión del interruptor', async () => {
  const onGenerar = jest.fn();
  const arbol = await montar({ telefono: '+56911111111' }, onGenerar);
  apagarSwitch(arbol);
  tocarBoton(arbol, 'Descargar afiche');
  expect(onGenerar).toHaveBeenCalledWith(false);
});

it('el texto de imprenta se comparte entero', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
  const arbol = await montar({ telefono: '+56911111111' });
  tocarBoton(arbol, 'Copiar texto para la fotocopiadora');
  expect(share.mock.calls[0][0].message).toContain('fluorescente');
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/components/aficheOpciones.test.tsx` · Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `src/components/AficheOpciones.tsx`**

```tsx
import React, { useState } from 'react';
import { Share, StyleSheet, Switch, View } from 'react-native';
import { AppText, Button, Card, Title } from '../ui';
import { useColors } from '../theme';
import { faltaWhatsapp, textoImprenta } from '../lib/afiche';
import { Pet } from '../services/pets';
import { Profile } from '../services/profile';

interface Props {
  pet: Pet;
  profile: Pick<Profile, 'telefono'> | null;
  onGenerar: (incluirNumero: boolean) => void;
  onCerrar: () => void;
}

// La hoja previa al afiche: acá vive la decisión de Pablo (número prendido
// por defecto, apagable) y el texto de imprenta. Dos toques: abrir y Descargar.
export default function AficheOpciones({ pet, profile, onGenerar, onCerrar }: Props) {
  const colors = useColors();
  const sinWhatsapp = faltaWhatsapp(profile);
  const [incluirNumero, setIncluirNumero] = useState(!sinWhatsapp);
  const styles = crearEstilos(colors);

  const compartirTexto = () => {
    Share.share({ message: textoImprenta(pet.nombre || null) }).catch(() => {});
  };

  return (
    <Card style={styles.card}>
      <Title size={16}>Tu afiche para imprimir</Title>
      {sinWhatsapp ? (
        <AppText muted size={13} style={styles.nota}>
          No tenés WhatsApp cargado, así que el afiche va a salir solo con el QR.
          Igual sirve: quien lo escanee puede avisarte sin crear cuenta.
        </AppText>
      ) : (
        <>
          <View style={styles.switchRow}>
            <AppText size={14} style={styles.switchTexto}>
              Incluir mi número de WhatsApp
            </AppText>
            <Switch
              testID="switch-numero"
              value={incluirNumero}
              onValueChange={setIncluirNumero}
              trackColor={{ false: colors.line, true: colors.brand }}
              thumbColor={colors.white}
            />
          </View>
          {!incluirNumero ? (
            <AppText muted size={13} style={styles.nota}>
              Sin tu número puede avisar menos gente, sobre todo quien no escanea QR.
            </AppText>
          ) : null}
        </>
      )}
      <Button title="Descargar afiche" icon="print" onPress={() => onGenerar(incluirNumero)} />
      <Button
        title="Copiar texto para la fotocopiadora"
        variant="secondary"
        icon="copy-outline"
        onPress={compartirTexto}
        style={styles.botonTexto}
      />
      <Button title="Cerrar" variant="ghost" onPress={onCerrar} />
    </Card>
  );
}

const crearEstilos = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    card: { gap: 10 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    switchTexto: { flex: 1, marginRight: 8 },
    nota: { marginBottom: 4 },
    botonTexto: { marginTop: 2 },
  });
```

(Si `useColors` se tipa distinto en el repo, copiar la forma exacta de `crearEstilos` de `src/components/PlanBusqueda.tsx`.)

- [ ] **Step 4: Enchufar en `AficheGenerator` y `PetDetailScreen`**

`src/components/AficheGenerator.tsx`: sumar prop `incluirNumero?: boolean` (default `true`) y pasarla donde arma el contenido: `armarAfiche(pet, profile, { incluirNumero })`.

`src/screens/PetDetailScreen.tsx`:
1. Estado nuevo junto a la línea 143: `const [opcionesAfiche, setOpcionesAfiche] = useState(false);` y `const [incluirNumero, setIncluirNumero] = useState(true);`
2. `crearAfiche` (líneas 537-553) **deja de expulsar al Perfil**: carga el perfil y abre la hoja —

```tsx
  const crearAfiche = async () => {
    if (!user) return;
    try {
      const p = await getMyProfile(user.id);
      setPerfil(p);
      setOpcionesAfiche(true);
    } catch (e: any) {
      notify('Error', mensajeDeErrorDb(e));
    }
  };
```

(El import de `faltaWhatsapp` en la línea 55 se va: ahora vive dentro de `AficheOpciones`.)
3. Render de la hoja, junto al botón «Crear afiche» (después de la línea 947):

```tsx
        {opcionesAfiche && esMio ? (
          <AficheOpciones
            pet={pet}
            profile={perfil}
            onGenerar={(conNumero) => {
              setIncluirNumero(conNumero);
              setOpcionesAfiche(false);
              setGenerandoAfiche(true);
            }}
            onCerrar={() => setOpcionesAfiche(false)}
          />
        ) : null}
```

4. El montaje del generador (línea 1288-1290) pasa la decisión: `<AficheGenerator pet={pet} profile={perfil} incluirNumero={incluirNumero} onDone={onAficheDone} onError={onAficheError} />`.

El paso del plan de búsqueda (`PetDetailScreen.tsx:745-747`, `onAfiche={crearAfiche}`) no se toca: ahora abre la hoja — la guía de «qué hacer ahora» queda cubierta sin cambiar `PASOS_PLAN`.

- [ ] **Step 5: Verde** — Run: `npx jest __tests__/components/aficheOpciones.test.tsx __tests__/components/planBusqueda.test.tsx __tests__/screens/petDetailCierre.test.tsx && npx tsc --noEmit` · Expected: PASS, `tsc` 0. Si algún test de `PetDetailScreen` fijaba el redirect al Perfil por falta de WhatsApp, actualizarlo: ese comportamiento murió a propósito.

- [ ] **Step 6: Commit**

```bash
git add src/components/AficheOpciones.tsx src/components/AficheGenerator.tsx src/screens/PetDetailScreen.tsx __tests__/components/aficheOpciones.test.tsx
git commit -m "t13-a: hoja de opciones del afiche - numero apagable, texto de imprenta, dos toques"
```

## ÁREA B — El perfil: red social apagable y correo enmascarado (funciones 0.b y 0.c)

### Task B1: Migración `0059` — `mostrar_red_social`, `perfil_publico` filtrando, `mi_perfil` devolviéndola, grant rehecho

**Files:**
- Modify: `supabase/migrations/0059_privacidad_red_social.sql` (rellenar el stub)
- Test: `__tests__/db/migracion0059.test.ts` (nuevo)

**Interfaces:**
- Produces: columna `profiles.mostrar_red_social boolean not null default true`; `perfil_publico` (misma firma, `create or replace`) devuelve `red_social` en `null` cuando está apagado; `mi_perfil` (drop + create: cambia el retorno) suma `mostrar_red_social boolean` AL FINAL; grant de UPDATE rehecho con la columna nueva. Consumen: B2 (servicio) y B3 (pantalla).

- [ ] **Step 1: Test estático en rojo** — `__tests__/db/migracion0059.test.ts` (mismo patrón que `migracion0057.test.ts`: leer el SQL con `fs` y asegurar formas):

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0059_privacidad_red_social.sql'),
  'utf8',
);

describe('0059: la red social del perfil público se puede apagar', () => {
  it('la columna existe, con default true (no sorprender a quien ya la cargó)', () => {
    expect(sql).toMatch(/add column if not exists mostrar_red_social boolean not null default true/);
  });

  it('el filtro vive DENTRO de perfil_publico, no en el cliente', () => {
    expect(sql).toMatch(/create or replace function public\.perfil_publico/);
    expect(sql).toMatch(/case when p\.mostrar_red_social then p\.red_social else null end/);
  });

  it('el grant de update se rehace entero: revoke primero, lista exacta después', () => {
    expect(sql).toMatch(/revoke update on public\.profiles from public, anon, authenticated/);
    expect(sql).toMatch(/grant update \(nombre, foto_perfil, telefono, red_social, mostrar_red_social\)/);
  });

  it('mi_perfil cambia el retorno: drop + create + re-grant, y anon sigue afuera', () => {
    expect(sql).toMatch(/drop function public\.mi_perfil\(\)/);
    expect(sql).toMatch(/mostrar_red_social boolean\s*\)/);
    expect(sql).toMatch(/revoke all on function public\.mi_perfil\(\) from public, anon/);
  });

  it('perfil_publico conserva la vigencia de adopciones de la 0053 (no desandar)', () => {
    expect(sql).toMatch(/interval '90 days'/);
  });
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/db/migracion0059.test.ts` · Expected: FAIL (el stub está vacío).

- [ ] **Step 3: Escribir la migración** — reemplazar el contenido del stub por:

```sql
-- 0059: interruptor "mostrar mi red social en mi perfil público" (tanda 13).
--
-- La red social era LO ÚNICO realmente público del contacto (spec 2026-08-02):
-- el teléfono está revocado por columna desde la tanda A y el correo no existe
-- en profiles. El filtro va acá adentro y no en el cliente porque la columna
-- red_social está revocada desde la 0018: perfil_publico es el ÚNICO camino
-- por el que sale. Filtrando acá, apagarla es real incluso contra curl.

alter table public.profiles
  add column if not exists mostrar_red_social boolean not null default true;

-- El grant de UPDATE se rehace ENTERO (mismo criterio fail-closed de la 0057).
-- ADVERTENCIA heredada de la 0057: toda columna editable nueva se suma acá o
-- guardar el perfil falla con 42501. El guardián de __tests__/db ahora lee el
-- ÚLTIMO grant del directorio (ver tarea B2), así que este es el vigente.
revoke update on public.profiles from public, anon, authenticated;
grant update (nombre, foto_perfil, telefono, red_social, mostrar_red_social)
  on public.profiles to authenticated;

-- perfil_publico: MISMA firma que la 0058 (create or replace), cuerpo copiado
-- VERBATIM de 0058:140-193 con UN cambio: red_social sale filtrada.
create or replace function public.perfil_publico(p_user_id uuid)
returns table (
  id uuid, nombre text, foto_perfil text, red_social text, creado_en timestamptz,
  reencuentros bigint, reportes bigint, aportes bigint, adopciones bigint,
  institucion_tipo text, institucion_nombre text, institucion_comuna text,
  institucion_contacto text, institucion_verificada_en timestamptz
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    p.id, p.nombre, p.foto_perfil,
    case when p.mostrar_red_social then p.red_social else null end,
    p.creado_en,
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.reunida_en is not null and pe.oculto = false),
    (select count(*) from public.pets pe
       where pe.user_id = p.id and pe.oculto = false),
    (select count(*) from public.sightings s where s.user_id = p.id)
      + (select count(*) from public.pet_tips t where t.user_id = p.id),
    (select count(*) from public.adoptions ad
       where ad.user_id = p.id and ad.activo = true and ad.oculto = false
         and ad.adoptada_en is null
         -- IDENTICA a la de `buscar_adopciones` (0052) y a la de la 0053.
         and coalesce(ad.renovado_en, ad.creado_en) >= now() - interval '90 days'),
    i.institucion_tipo, i.institucion_nombre, i.institucion_comuna,
    i.institucion_contacto, i.institucion_verificada_en
  from public.profiles p
  left join lateral public._insignia_publica(p.id) i on true
  where p.id = p_user_id
    and p.eliminado_en is null;
$$;

revoke all on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to anon;
grant execute on function public.perfil_publico(uuid) to authenticated;

-- mi_perfil: cambia el tipo de retorno -> drop + create + re-grant (misma
-- trampa documentada en la 0024: create or replace no puede cambiar el returns).
drop function public.mi_perfil();
create function public.mi_perfil()
returns table (
  id uuid, nombre text, foto_perfil text, telefono text, red_social text,
  fecha_nacimiento date, creado_en timestamptz, es_admin boolean,
  institucion_tipo text, institucion_nombre text, institucion_comuna text,
  institucion_contacto text, institucion_verificada_en timestamptz,
  mostrar_red_social boolean
)
language sql security definer set search_path = public, pg_temp stable
as $$
  select p.id, p.nombre, p.foto_perfil, p.telefono, p.red_social,
         p.fecha_nacimiento, p.creado_en, p.es_admin,
         p.institucion_tipo, p.institucion_nombre, p.institucion_comuna,
         p.institucion_contacto, p.institucion_verificada_en,
         p.mostrar_red_social
  from public.profiles p
  where p.id = auth.uid()
$$;
revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;
```

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/db/migracion0059.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0059_privacidad_red_social.sql __tests__/db/migracion0059.test.ts
git commit -m "t13-b: 0059 - mostrar_red_social con el filtro adentro de perfil_publico"
```

### Task B2: El guardián de la 0057 aprende que el grant vigente es el ÚLTIMO del directorio, y `updateMyProfile` suma la columna

**Files:**
- Modify: `src/services/profile.ts` (`Profile`, `updateMyProfile`, `getMyProfile`, `camposDeContactoParaGuardar`)
- Modify: `__tests__/db/migracion0057.test.ts` (el `describe` de la línea 364)
- Test: `__tests__/services/profile.test.ts`

**Interfaces:**
- Consumes: la migración 0059 (B1).
- Produces: `Profile.mostrar_red_social?: boolean`; `updateMyProfile(userId, fields)` acepta `mostrar_red_social?: boolean`; `camposDeContactoParaGuardar(profile, telefono, redSocial, mostrarRedSocial)` (4.º parámetro NUEVO) devuelve también `mostrar_red_social` salvo perfil degradado. Consume: B3.

- [ ] **Step 1: Tests en rojo** — en `__tests__/services/profile.test.ts` agregar:

```ts
it('updateMyProfile puede guardar el interruptor de la red social', async () => {
  await updateMyProfile('user-1', { mostrar_red_social: false });
  expect(builder.update).toHaveBeenCalledWith({ mostrar_red_social: false });
});

it('camposDeContactoParaGuardar lleva el interruptor, salvo perfil degradado', () => {
  expect(camposDeContactoParaGuardar({ ...base }, '+569', 'url', false)).toEqual({
    telefono: '+569', red_social: 'url', mostrar_red_social: false,
  });
  expect(camposDeContactoParaGuardar({ ...base, contactoNoDisponible: true }, '+569', 'url', false)).toEqual({});
});
```

Y en `__tests__/db/migracion0057.test.ts`, ANTES de tocar el servicio, correr `npx jest __tests__/db/migracion0057.test.ts` para ver el estado verde de partida.

- [ ] **Step 2: Cambiar el servicio `src/services/profile.ts`**

1. `Profile` suma `mostrar_red_social?: boolean;` (después de `red_social`).
2. `updateMyProfile` — la firma queda EXACTAMENTE así (el guardián la parsea con `/(\w+)\?:/g` y corta en el primer `'):'`, así que sin defaults ni tipos con paréntesis):

```ts
export async function updateMyProfile(
  userId: string,
  fields: {
    nombre?: string;
    foto_perfil?: string;
    telefono?: string;
    red_social?: string;
    mostrar_red_social?: boolean;
  },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
}
```

3. `getMyProfile` (líneas 36-81): donde arma el objeto `Profile` desde la fila de `mi_perfil`, sumar `mostrar_red_social: fila.mostrar_red_social ?? true,` (el `?? true` cubre la ventana de despliegue en que la web nueva habla con la RPC vieja; mismo criterio que el escalón de respaldo existente).
4. `camposDeContactoParaGuardar` (líneas 196-203):

```ts
export function camposDeContactoParaGuardar(
  profile: Profile | null,
  telefono: string,
  redSocial: string,
  mostrarRedSocial: boolean,
): { telefono?: string; red_social?: string; mostrar_red_social?: boolean } {
  if (!profile || profile.contactoNoDisponible) return {};
  return { telefono, red_social: redSocial, mostrar_red_social: mostrarRedSocial };
}
```

(`tsc` va a marcar los llamadores: `ProfileScreen.tsx:316` se arregla en B3; si hay otros, pasarles el valor actual `profile?.mostrar_red_social ?? true`.)

- [ ] **Step 3: El guardián se pone rojo — y ese rojo es el guardián funcionando** — Run: `npx jest __tests__/db/migracion0057.test.ts` · Expected: FAIL en `'ni una columna de mas, ni una de menos'` (la firma tiene 5 y la 0057 concede 4).

- [ ] **Step 4: Enseñarle al guardián a leer el grant VIGENTE** — en `__tests__/db/migracion0057.test.ts`, dentro del `describe` de la línea 364, reemplazar SOLO la constante `grant` (que hoy lee `codigo57`) por:

```ts
  // El grant vigente es el ÚLTIMO `grant update (` del directorio de
  // migraciones: cada migración que toca la lista hace revoke + grant entero
  // (0057 -> 0059 -> ...). Leer solo la 0057 fijaría el pasado.
  const dirMigraciones = path.join(__dirname, '..', '..', 'supabase', 'migrations');
  const archivosConGrant = fs
    .readdirSync(dirMigraciones)
    .filter((f: string) => f.endsWith('.sql'))
    .sort()
    .filter((f: string) =>
      fs.readFileSync(path.join(dirMigraciones, f), 'utf8').includes('grant update ('),
    );
  const codigoVigente: string = fs.readFileSync(
    path.join(dirMigraciones, archivosConGrant[archivosConGrant.length - 1]),
    'utf8',
  );
  const grant = codigoVigente.slice(
    codigoVigente.indexOf('grant update ('),
    codigoVigente.indexOf('on public.profiles to authenticated'),
  );
```

Sumar dentro del mismo `describe` un control de que el mecanismo no pasa por vacío:

```ts
  it('el grant vigente NO es el de la 0057 (la 0059 lo rehizo)', () => {
    expect(archivosConGrant[archivosConGrant.length - 1]).toBe('0059_privacidad_red_social.sql');
  });

  it('toda migración que concede update revoca primero (fail-closed)', () => {
    for (const f of archivosConGrant) {
      const codigo = fs.readFileSync(path.join(dirMigraciones, f), 'utf8');
      expect(codigo).toMatch(/revoke update on public\.profiles from public, anon, authenticated/);
    }
  });
```

⚠️ NO tocar las demás aserciones del archivo: la lista negra (`es_admin`, `suspendido_en`…), el `grants.length === 1` sobre la 0057 y el `revoke insert` siguen midiendo la 0057 histórica y deben seguir verdes tal cual.

- [ ] **Step 5: Verde** — Run: `npx jest __tests__/db/migracion0057.test.ts __tests__/services/profile.test.ts && npx tsc --noEmit` · Expected: PASS (salvo llamadores de `camposDeContactoParaGuardar` pendientes de B3; si `tsc` solo marca `ProfileScreen.tsx`, avanzar).

- [ ] **Step 6: Commit**

```bash
git add src/services/profile.ts __tests__/db/migracion0057.test.ts __tests__/services/profile.test.ts
git commit -m "t13-b: updateMyProfile guarda el interruptor y el guardian lee el grant vigente"
```

### Task B3: La pantalla — interruptor al editar el perfil, correo enmascarado con un toque

**Files:**
- Create: `src/lib/enmascararCorreo.ts`
- Modify: `src/screens/ProfileScreen.tsx`
- Test: `__tests__/lib/enmascararCorreo.test.ts` (nuevo), `__tests__/screens/perfilPropioInstitucion.test.tsx` (o suite hermana de perfil propio)

**Interfaces:**
- Consumes: `camposDeContactoParaGuardar(profile, telefono, redSocial, mostrarRedSocial)` y `Profile.mostrar_red_social` (B2).
- Produces: `enmascararCorreo(correo: string | null | undefined): string`.

- [ ] **Step 1: Tests en rojo** — `__tests__/lib/enmascararCorreo.test.ts`:

```ts
import { enmascararCorreo } from '../../src/lib/enmascararCorreo';

it('deja la primera letra y el dominio', () => {
  expect(enmascararCorreo('pablo@gmail.com')).toBe('p***@gmail.com');
});
it('no revienta con vacío, null o algo que no es un correo', () => {
  expect(enmascararCorreo(null)).toBe('');
  expect(enmascararCorreo('')).toBe('');
  expect(enmascararCorreo('sin-arroba')).toBe('sin-arroba');
});
```

Y en la suite de perfil propio (montaje ya resuelto en `__tests__/screens/perfilPropioInstitucion.test.tsx`), con el mock de `useAuth` devolviendo `email: 'pablo@gmail.com'`:

```ts
it('el correo propio sale enmascarado hasta que lo tocás', async () => {
  const arbol = await montar();
  expect(textos(arbol)).toContain('p***@gmail.com');
  expect(textos(arbol)).not.toContain('pablo@gmail.com');
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/lib/enmascararCorreo.test.ts` · Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

`src/lib/enmascararCorreo.ts`:

```ts
// Tu propio correo, en tu propio Perfil, tapado por defecto (spec 0.c): la
// pantalla se muestra en público más de lo que uno cree (mostrarle el reporte
// a un vecino, prestar el teléfono). Un toque lo revela.
export function enmascararCorreo(correo: string | null | undefined): string {
  const c = (correo ?? '').trim();
  const arroba = c.indexOf('@');
  if (arroba <= 0) return c;
  return `${c[0]}***${c.slice(arroba)}`;
}
```

`src/screens/ProfileScreen.tsx`:
1. Estado: `const [correoVisible, setCorreoVisible] = useState(false);`
2. La línea 388 (`{user?.email}`) pasa a:

```tsx
                <AppText
                  muted
                  size={13}
                  onPress={() => setCorreoVisible((v) => !v)}
                  accessibilityHint="Tocá para mostrar u ocultar tu correo"
                >
                  {correoVisible ? user?.email : enmascararCorreo(user?.email)}
                </AppText>
```

(El respaldo `nombreMostrado = … user?.email` de la línea 341 NO se enmascara: si no hay nombre, el correo ES la identidad visible y taparlo dejaría la cabecera vacía.)
3. Interruptor en el formulario de edición — estado junto a los drafts (línea 85-90): `const [mostrarRedDraft, setMostrarRedDraft] = useState(true);`; sembrarlo en `empezarEdicionPerfil` (línea 293): `setMostrarRedDraft(profile?.mostrar_red_social ?? true);`; y en el JSX, inmediatamente DESPUÉS del aviso de privacidad de la red social (línea 510-513):

```tsx
              <View style={styles.switchRow}>
                <View style={styles.switchTexto}>
                  <AppText size={14}>Mostrar mi red social en mi perfil público</AppText>
                  <AppText muted size={12}>
                    Apagala y no la ve nadie, ni siquiera con el link directo a tu perfil.
                  </AppText>
                </View>
                <Switch
                  value={mostrarRedDraft}
                  onValueChange={setMostrarRedDraft}
                  trackColor={{ false: colors.line, true: colors.brand }}
                  thumbColor={colors.white}
                />
              </View>
```

(Import `Switch` de `react-native`, mismo patrón que `NotificationPrefsScreen.tsx:166-172`; estilos `switchRow`/`switchTexto` calcados de esa pantalla. El interruptor queda dentro de la rama que ya esconde el contacto cuando `contactoNoDisponible`.)
4. `guardarPerfil` (línea 316): `...camposDeContactoParaGuardar(profile, telefonoDraft.trim(), redSocialUrl, mostrarRedDraft),`

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/lib/enmascararCorreo.test.ts __tests__/screens/perfilPropioInstitucion.test.tsx __tests__/screens/perfilCierreYErrores.test.tsx && npx tsc --noEmit` · Expected: PASS, `tsc` 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enmascararCorreo.ts src/screens/ProfileScreen.tsx __tests__/lib/enmascararCorreo.test.ts __tests__/screens/
git commit -m "t13-b: interruptor de red social al editar y correo propio enmascarado con un toque"
```

## ÁREA C — La bandeja de moderación que avisa (función 2)

Los Términos prometen plazos de retiro (24 h / 72 h / 7 días) y hoy nada avisa que entró una denuncia. Con Brevo caído, el badge in-app no es un extra: es el ÚNICO canal que funciona ahora.

### Task C1: Migración `0060` — trigger sobre `denuncias` que encola `denuncia_nueva` a cada admin

**Files:**
- Modify: `supabase/migrations/0060_denuncia_nueva.sql` (rellenar el stub)
- Test: `__tests__/db/migracion0060.test.ts` (nuevo)

**Interfaces:**
- Produces: tipo `'denuncia_nueva'` en el CHECK de `notification_events`; eventos con `target_user_id` = cada admin y `datos = {tipo_denuncia, motivo}` (claves de listas cerradas — puntero, no copia). Consumen: C2 (despachador) y C3 (cliente).

- [ ] **Step 1: Test estático en rojo** — `__tests__/db/migracion0060.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0060_denuncia_nueva.sql'),
  'utf8',
);

describe('0060: una denuncia nueva avisa a los admins', () => {
  it('el CHECK de tipo se rehace con la lista UNIÓN completa', () => {
    expect(sql).toMatch(/drop constraint if exists notification_events_tipo_check/);
    for (const t of ['reporte_nuevo','avistamiento','pista','coincidencia','escaneo_collar','busqueda_guardada','avistamiento_anonimo','denuncia_nueva']) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it('avisa a cada admin activo, nunca al propio denunciante', () => {
    expect(sql).toMatch(/a\.es_admin/);
    expect(sql).toMatch(/a\.suspendido_en is null/);
    expect(sql).toMatch(/a\.eliminado_en is null/);
    expect(sql).toMatch(/a\.id <> new\.reporter_user/);
  });

  it('datos lleva claves de listas cerradas, no el detalle libre del denunciante', () => {
    expect(sql).toMatch(/jsonb_build_object\('tipo_denuncia', new\.tipo, 'motivo', new\.motivo\)/);
    expect(sql).not.toMatch(/new\.detalle/);
  });

  it('el trigger es after insert y la función es security definer con search_path fijo', () => {
    expect(sql).toMatch(/after insert on public\.denuncias/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public, pg_temp/);
  });
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/db/migracion0060.test.ts` · Expected: FAIL.

- [ ] **Step 3: Escribir la migración** — contenido del stub:

```sql
-- 0060: la bandeja de moderación que avisa (tanda 13, función 2).
--
-- Los Términos publicados prometen plazos de retiro (24 h / 72 h / 7 días) y
-- hasta hoy NADA avisaba que entró una denuncia: la bandeja había que abrirla
-- a mano. Se reusa la cola de la 0011: un evento dirigido por admin, que llega
-- a la bandeja in-app (mis_avisos, rama target_user_id) sin tocar la RPC.
--
-- `datos` lleva SOLO claves de listas cerradas (tipo y motivo salen de
-- MOTIVOS_DENUNCIA/TipoDenuncia del cliente): el detalle libre del denunciante
-- NO viaja — puntero, no copia (lección de la tanda 11: la cola sobrevive a
-- la moderación y resucitaba contenido retirado).

alter table public.notification_events drop constraint if exists notification_events_tipo_check;
alter table public.notification_events
  add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo', 'avistamiento', 'pista', 'coincidencia',
                  'escaneo_collar', 'busqueda_guardada', 'avistamiento_anonimo',
                  'denuncia_nueva'));

create or replace function public.enqueue_denuncia_nueva()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
  select 'denuncia_nueva',
         null,          -- sin pet: la bandeja de avisos no debe navegar al contenido denunciado
         a.id,
         null,          -- sin actor: quién denunció no es dato del aviso (la bandeja admin ya lo muestra)
         jsonb_build_object('tipo_denuncia', new.tipo, 'motivo', new.motivo)
    from public.profiles a
   where a.es_admin
     and a.suspendido_en is null
     and a.eliminado_en is null
     and a.id <> new.reporter_user;  -- un admin que denuncia no se auto-avisa
  return new;
end;
$$;

drop trigger if exists trg_denuncia_nueva on public.denuncias;
create trigger trg_denuncia_nueva
  after insert on public.denuncias
  for each row execute function public.enqueue_denuncia_nueva();
```

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/db/migracion0060.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0060_denuncia_nueva.sql __tests__/db/migracion0060.test.ts
git commit -m "t13-c: 0060 - trigger que encola denuncia_nueva a cada admin activo"
```

### Task C2: El despachador conoce `denuncia_nueva` (y de paso se arregla la unión desincronizada)

**Files:**
- Modify: `src/lib/notifyTargets.ts` **y** `supabase/functions/send-notifications/notifyTargets.ts` (espejos: EDICIONES IDÉNTICAS)
- Modify: `supabase/functions/send-notifications/index.ts`
- Test: `__tests__/worker/` (la suite existente de `notifyTargets`; ubicar con `ls __tests__/worker/`)

**Interfaces:**
- Consumes: eventos `denuncia_nueva` de C1.
- Produces: `componerAviso` con caso `denuncia_nueva`; `resolverDestinatarios` lo trata como DIRIGIDO (target directo, sin pasar por `quiereEsteTipo` — como `escaneo_collar`); `EventoRow` de `index.ts` con la unión completa (sumando también `avistamiento_anonimo`, que faltaba: desincronización real detectada en la exploración).

- [ ] **Step 1: Tests en rojo** — en la suite de `notifyTargets` (patrón de los casos existentes de `escaneo_collar`):

```ts
it('denuncia_nueva va SOLO al admin destinatario, sin pasar por el interruptor de pistas', () => {
  const evento = eventoBase({ tipo: 'denuncia_nueva', targetUserId: 'admin-1', actorId: null, petId: null });
  const ctx = contexto({ prefs: { 'admin-1': { ...PREFS_POR_DEFECTO, pistas: false } } });
  const destinos = resolverDestinatarios(evento, ctx);
  expect(destinos).toEqual([{ userId: 'admin-1', canales: ['email', 'push'] }]);
});

it('denuncia_nueva compone un aviso que apunta a la bandeja, sin texto del denunciante', () => {
  const aviso = componerAviso(eventoBase({ tipo: 'denuncia_nueva', datos: { tipo_denuncia: 'reporte', motivo: 'spam' } }), contexto({}));
  expect(aviso.titulo).toBe('Entró una denuncia nueva');
  expect(aviso.cuerpo).toContain('Perfil → Moderación');
  expect(aviso.cuerpo).not.toContain('spam-detalle-libre');
});
```

(Armar `eventoBase`/`contexto` con los helpers que la suite ya tiene; si usa otros nombres, calcar el test vecino de `escaneo_collar`.)

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/worker/` · Expected: FAIL.

- [ ] **Step 3: Implementar — en LOS DOS `notifyTargets.ts`, idéntico**

1. `TipoEvento`: sumar `| 'denuncia_nueva'`.
2. En `resolverDestinatarios` (la rama de dirigidos, líneas ~184-194): el `if` pasa a

```ts
  if (
    evento.tipo === 'escaneo_collar' ||
    evento.tipo === 'busqueda_guardada' ||
    evento.tipo === 'denuncia_nueva'
  ) {
```

3. En `componerAviso`, antes del genérico:

```ts
  if (evento.tipo === 'denuncia_nueva') {
    return {
      titulo: 'Entró una denuncia nueva',
      cuerpo:
        'Hay contenido esperando revisión. Los Términos prometen plazos: ' +
        'entrá a Perfil → Moderación para verla.',
      ruta: '/',
    };
  }
```

(`ruta: '/'` a propósito: la pantalla de Moderación no tiene ruta web pública y un deep link roto es peor que ir al inicio.)

4. En `supabase/functions/send-notifications/index.ts`, la unión `EventoRow` (líneas 32-38) queda con la lista completa:

```ts
  tipo:
    | 'reporte_nuevo'
    | 'avistamiento'
    | 'pista'
    | 'coincidencia'
    | 'escaneo_collar'
    | 'busqueda_guardada'
    | 'avistamiento_anonimo'
    | 'denuncia_nueva';
```

5. En `armarContexto` (`index.ts:254-383`): rama nueva para `denuncia_nueva` CALCADA de la de `escaneo_collar` (línea 264) pero sin buscar mascota — carga las prefs y bloqueos del `target_user_id` y retorna; leer la rama vecina y replicar su forma exacta.
6. Verificar que no exista un test espejo que compare los dos `notifyTargets.ts` byte a byte (`grep -rl "notifyTargets" __tests__/`); si existe, correrlo: las dos copias deben quedar idénticas.

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/worker/ && npx tsc --noEmit` · Expected: PASS (las Edge Functions están fuera del typecheck; el espejo `src/lib/notifyTargets.ts` es lo que la suite mide).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifyTargets.ts supabase/functions/send-notifications/ __tests__/worker/
git commit -m "t13-c: el despachador conoce denuncia_nueva y la union de index.ts deja de estar desincronizada"
```

### Task C3: El cliente — badge en la fila Moderación y texto del aviso en la bandeja

**Files:**
- Create: `src/hooks/useDenunciasPendientes.ts`
- Modify: `src/lib/avisosBandeja.ts` (caso `denuncia_nueva`)
- Modify: `src/screens/ProfileScreen.tsx` (fila Moderación, líneas 846-853)
- Test: `__tests__/lib/avisosBandeja.test.ts` (o la suite existente de `avisosBandeja`), `__tests__/screens/perfilModeracionBadge.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `bandeja()` de `src/services/moderacionAdmin.ts:28-46`; eventos `denuncia_nueva` (C1) vía `mis_avisos`.
- Produces: `useDenunciasPendientes(esAdmin: boolean): number`.

- [ ] **Step 1: Tests en rojo**

En la suite de `avisosBandeja`:

```ts
it('denuncia_nueva se presenta como puntero a la bandeja, con el motivo de lista cerrada', () => {
  const t = textoDeAviso({ id: '1', tipo: 'denuncia_nueva', pet_id: null, datos: { tipo_denuncia: 'reporte', motivo: 'spam' }, creado_en: hoy });
  expect(t.titulo).toBe('Entró una denuncia');
  expect(t.detalle).toContain('spam');
  expect(t.icono).toBe('shield-checkmark-outline');
});
```

`__tests__/screens/perfilModeracionBadge.test.tsx` (andamiaje calcado de `perfilPropioInstitucion.test.tsx`, sumando `jest.mock('../../src/services/moderacionAdmin')` con `bandeja` devolviendo 3 filas y el perfil mockeado con `es_admin: true`):

```ts
it('la fila Moderación cuenta lo pendiente', async () => {
  const arbol = await montar();
  expect(textos(arbol).join(' ')).toContain('Moderación · 3 pendientes');
});

it('sin es_admin no se llama a la bandeja (la RPC lanzaría "no autorizado")', async () => {
  await montarComoUsuarioComun();
  expect(bandeja).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/lib/avisosBandeja.test.ts __tests__/screens/perfilModeracionBadge.test.tsx` · Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/avisosBandeja.ts` — caso nuevo en el `switch` de `textoDeAviso`, antes del `default`:

```ts
    case 'denuncia_nueva': {
      const motivo = texto(d, 'motivo');
      return {
        titulo: 'Entró una denuncia',
        // El motivo es de lista cerrada (MOTIVOS_DENUNCIA); el detalle libre
        // del denunciante no viaja en el evento, a propósito.
        detalle: motivo ? `Motivo: ${motivo} · Revisala en Perfil → Moderación.` : 'Revisala en Perfil → Moderación.',
        icono: 'shield-checkmark-outline',
      };
    }
```

`src/hooks/useDenunciasPendientes.ts`:

```ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { bandeja } from '../services/moderacionAdmin';

// Cuenta lo pendiente de moderación para el badge del Perfil. Solo pregunta
// si sos admin (la RPC lanza "no autorizado" para el resto) y nunca rompe la
// pantalla: sin red o sin permiso, el contador queda en cero y listo.
export function useDenunciasPendientes(esAdmin: boolean): number {
  const [pendientes, setPendientes] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      if (!esAdmin) {
        setPendientes(0);
        return undefined;
      }
      bandeja()
        .then((filas) => {
          if (vivo) setPendientes(filas.length);
        })
        .catch(() => {});
      return () => {
        vivo = false;
      };
    }, [esAdmin]),
  );
  return pendientes;
}
```

`src/screens/ProfileScreen.tsx` — hook junto a los existentes: `const denunciasPendientes = useDenunciasPendientes(profile?.es_admin === true);` y la fila (líneas 846-853) pasa a:

```tsx
        {profile?.es_admin ? (
          <Button
            title={
              denunciasPendientes > 0
                ? `Moderación · ${denunciasPendientes} ${pluralizar(denunciasPendientes, 'pendiente', 'pendientes')}`
                : 'Moderación'
            }
            variant="ghost"
            icon="shield-checkmark-outline"
            onPress={() => navigation.navigate('Moderacion')}
          />
        ) : null}
```

(`pluralizar` ya existe en `src/lib/plural.ts` y la pantalla ya lo importa para «Tus avisos» — regla del repo: `n === 1`, con cero va plural.)

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/lib/avisosBandeja.test.ts __tests__/screens/perfilModeracionBadge.test.tsx __tests__/screens/perfilPropioInstitucion.test.tsx && npx tsc --noEmit` · Expected: PASS, `tsc` 0. (Los tests viejos de perfil montan con `bandeja` sin mockear: si alguno se rompe, sumar el mock de `moderacionAdmin` a su lista — el hook traga el error igual, pero jest puede quejarse del import.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDenunciasPendientes.ts src/lib/avisosBandeja.ts src/screens/ProfileScreen.tsx __tests__/
git commit -m "t13-c: badge de pendientes en la fila Moderacion y texto del aviso de denuncia"
```

## ÁREA D — Cerrar el círculo con quien avisó + foto en el aviso anónimo (funciones 3 y 4)

Decisiones finas tomadas con criterio conservador (delegadas por Pablo al aprobar):
- **Purga del correo de seguimiento:** se borra al reencuentro (después de mandar el único correo), al cierre sin final feliz, al vencimiento (el auto-archivado pone `activo = false` y dispara el mismo trigger) y por cascada si el reporte se borra. Tope de 50 correos por reporte contra el correo-bombing.
- **Foto anónima:** máx. **2 MB** ya comprimida (el cliente reduce a 1080 px / JPEG 0.6 como `uploadPetPhoto`), tipos `image/jpeg`, `image/png`, `image/webp`. Bucket **privado** `avisos-anonimos` — «solo la ve el dueño» se garantiza con policy de SELECT por dueño del reporte, no con una URL escondida en un bucket público.

### Task D1: Migración `0061` — tabla de seguimientos, RPC con `p_correo`, trigger de reencuentro/cierre, `mis_avisos` filtrando

**Files:**
- Modify: `supabase/migrations/0061_seguimiento_anonimo.sql` (rellenar el stub)
- Test: `__tests__/db/migracion0061.test.ts` (nuevo)

**Interfaces:**
- Produces: tabla `seguimientos_anonimos (id, pet_id fk cascade, correo, creado_en, unique(pet_id, correo))` con RLS y SIN políticas; `avistar_sin_cuenta` con firma NUEVA de 5 parámetros `(uuid, text, double precision, double precision, text)` (drop de la de 4 + create + grants a `anon` y `authenticated`); tipo `'reencuentro_seguimiento'`; trigger `trg_pets_seguimientos`; `mis_avisos` recreada excluyendo `'reencuentro_seguimiento'`. Consumen: D2 (despachador) y D3 (cliente).

- [ ] **Step 1: Test estático en rojo** — `__tests__/db/migracion0061.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0061_seguimiento_anonimo.sql'),
  'utf8',
);

describe('0061: cerrar el círculo con quien avisó', () => {
  it('la tabla es de finalidad única: RLS prendida y SIN políticas (invisible)', () => {
    expect(sql).toMatch(/create table public\.seguimientos_anonimos/);
    expect(sql).toMatch(/references public\.pets\(id\) on delete cascade/);
    expect(sql).toMatch(/alter table public\.seguimientos_anonimos enable row level security/);
    expect(sql).not.toMatch(/create policy[^;]*seguimientos_anonimos/);
    expect(sql).toMatch(/unique \(pet_id, correo\)/);
  });

  it('la firma vieja se dropea ENTERA y la nueva re-otorga a anon y authenticated', () => {
    expect(sql).toMatch(/drop function public\.avistar_sin_cuenta\(uuid, text, double precision, double precision\)/);
    expect(sql).toMatch(/grant execute on function public\.avistar_sin_cuenta\(uuid, text, double precision, double precision, text\) to anon/);
    expect(sql).toMatch(/grant execute on function public\.avistar_sin_cuenta\(uuid, text, double precision, double precision, text\) to authenticated/);
  });

  it('el correo se valida, se normaliza y tiene techo por reporte', () => {
    expect(sql).toMatch(/lower\(btrim\(p_correo\)\)/);
    expect(sql).toMatch(/on conflict \(pet_id, correo\) do nothing/);
    expect(sql).toMatch(/>= 50/);
  });

  it('el trigger manda el correo SOLO en el reencuentro y borra en todo cierre', () => {
    expect(sql).toMatch(/new\.reunida_en is not null and old\.reunida_en is null/);
    expect(sql).toMatch(/new\.activo = false and old\.activo = true/);
    expect(sql).toMatch(/delete from public\.seguimientos_anonimos/);
  });

  it('mis_avisos excluye el tipo (lleva el correo del vecino en datos)', () => {
    expect(sql).toMatch(/create or replace function public\.mis_avisos/);
    expect(sql).toMatch(/'reencuentro_seguimiento'/);
  });

  it('los topes de la 0055 siguen vivos en el cuerpo nuevo (no desandar la puerta)', () => {
    expect(sql).toMatch(/>= 10/);
    expect(sql).toMatch(/>= 30/);
    expect(sql).toMatch(/interval '5 minutes'/);
  });
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/db/migracion0061.test.ts` · Expected: FAIL.

- [ ] **Step 3: Escribir la migración.** Estructura (los bloques nuevos completos acá; el cuerpo de la RPC se copia VERBATIM de la versión vigente `0055:202-357`, mismo procedimiento que usó la 0058 con la 0041):

```sql
-- 0061: cerrar el círculo con quien avisó desde el afiche (tanda 13, función 3).
--
-- Quien avisa desde el link público no deja identidad (actor_id null, 0050):
-- justo el caso más emotivo era el único al que no había a quién avisarle.
-- Correo OPCIONAL y de FINALIDAD ÚNICA (Ley 21.719): tabla propia con purga
-- propia — NO en datos de notification_events, que se purga a los 90 días de
-- enviada mientras este correo se necesita hasta que el caso cierre.

create table public.seguimientos_anonimos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  correo text not null,
  creado_en timestamptz not null default now(),
  unique (pet_id, correo)
);

alter table public.seguimientos_anonimos enable row level security;
-- SIN políticas, a propósito (mismo criterio que notification_events, 0011):
-- invisible para anon y authenticated. Escribe la RPC; lee el trigger.

-- El tipo nuevo entra al CHECK con la lista UNIÓN completa (incluye el
-- 'denuncia_nueva' de la 0060: estas migraciones se aplican en orden).
alter table public.notification_events drop constraint if exists notification_events_tipo_check;
alter table public.notification_events
  add constraint notification_events_tipo_check
  check (tipo in ('reporte_nuevo', 'avistamiento', 'pista', 'coincidencia',
                  'escaneo_collar', 'busqueda_guardada', 'avistamiento_anonimo',
                  'denuncia_nueva', 'reencuentro_seguimiento'));

-- avistar_sin_cuenta: cambia la firma -> DROP de la de 4 parámetros y CREATE
-- con 5. Los clientes viejos llaman con parámetros nombrados, así que el
-- default de p_correo los mantiene funcionando durante la ventana de deploy.
drop function public.avistar_sin_cuenta(uuid, text, double precision, double precision);

create function public.avistar_sin_cuenta(
  p_pet_id uuid,
  p_nota text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_correo text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pet public.pets%rowtype;
  v_nota_norm text;
  v_lat numeric;
  v_lng numeric;
  v_correo text;
begin
  -- [CUERPO VERBATIM DE LA 0055 desde el select del pet hasta el chequeo de
  --  bloqueos inclusive — 0055:~220-240]

  -- ── NUEVO: registrar el correo de seguimiento ──────────────────────────
  -- Va ANTES de los dedupes del aviso: si el vecino toca dos veces, el aviso
  -- se descarta pero su pedido de "avisame si aparece" vale igual.
  if p_correo is not null then
    v_correo := lower(btrim(p_correo));
    if v_correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       and length(v_correo) <= 254
       and (select count(*) from public.seguimientos_anonimos s
             where s.pet_id = p_pet_id) < 50  -- techo: sin esto, cada fila es un correo el día del reencuentro (correo-bombing)
    then
      insert into public.seguimientos_anonimos (pet_id, correo)
      values (p_pet_id, v_correo)
      on conflict (pet_id, correo) do nothing;
    end if;
    -- Correo inválido: se ignora en silencio. La RPC es void a propósito
    -- (0050: no ser un oráculo); la validación con mensaje vive en el cliente.
  end if;
  -- ───────────────────────────────────────────────────────────────────────

  -- [RESTO DEL CUERPO VERBATIM DE LA 0055: normalización, dedupe por
  --  contenido con ventana asimétrica, techos 10/hora y 30/día, insert del
  --  evento — 0055:~242-354, SIN CAMBIOS]
end;
$$;

revoke all on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text) from public;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text) to anon;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text) to authenticated;

-- ── El trigger que cierra el círculo ─────────────────────────────────────
-- Un solo camino para los tres finales: reencuentro (manda y borra), cierre
-- sin final feliz (borra sin mandar) y vencimiento (el auto-archivado pone
-- activo = false y cae en la misma rama). responder_estado 'aparecio' setea
-- reunida_en y activo = false en el MISMO update: la primera rama gana.
create or replace function public.avisar_seguimientos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reunida_en is not null and old.reunida_en is null then
    insert into public.notification_events (tipo, pet_id, target_user_id, actor_id, datos)
    select 'reencuentro_seguimiento', new.id, null, null,
           jsonb_build_object('correo', s.correo,
                              'nombre', new.nombre,
                              'especie', new.especie::text)
      from public.seguimientos_anonimos s
     where s.pet_id = new.id;
    delete from public.seguimientos_anonimos where pet_id = new.id;
  elsif new.activo = false and old.activo = true then
    delete from public.seguimientos_anonimos where pet_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pets_seguimientos on public.pets;
create trigger trg_pets_seguimientos
  after update on public.pets
  for each row execute function public.avisar_seguimientos();

-- ── mis_avisos: el evento lleva el correo del vecino en datos; el dueño no
-- tiene por qué verlo (ni un "Tenés una novedad" vacío). MISMA firma:
-- create or replace con el cuerpo VERBATIM de 0051:60-138 sumando UNA línea
-- al where: ──────────────────────────────────────────────────────────────
--   and ne.tipo <> 'reencuentro_seguimiento'
-- [PEGAR ACÁ LA FUNCIÓN COMPLETA]
```

⚠️ Al copiar los cuerpos verbatim: abrir `0055` y `0051` y copiar de verdad — los bloques `[…]` de arriba son instrucciones de copiado, no código que se pega tal cual. El test estático de Step 1 verifica que los topes de la 0055 quedaron en el archivo nuevo.

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/db/migracion0061.test.ts __tests__/db/migracion0055.test.ts __tests__/db/migracion0050.test.ts` · Expected: PASS los tres (los viejos miden sus archivos, que no se tocaron).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0061_seguimiento_anonimo.sql __tests__/db/migracion0061.test.ts
git commit -m "t13-d: 0061 - correo de seguimiento con finalidad unica y trigger de reencuentro"
```

### Task D2: El despachador manda el correo del reencuentro (directo, sin cuenta de por medio)

**Files:**
- Modify: `supabase/functions/send-notifications/index.ts`
- Modify: `src/lib/notifyTargets.ts` **y** `supabase/functions/send-notifications/notifyTargets.ts` (espejos)
- Test: `__tests__/worker/` (suite de `notifyTargets`)

**Interfaces:**
- Consumes: eventos `reencuentro_seguimiento` con `datos.correo` (D1).
- Produces: rama especial en `procesarEvento`/`index.ts` que manda UN correo a `datos.correo` y nada más (sin push, sin prefs, sin `auth.admin`); `TipoEvento` con el tipo nuevo en los dos espejos.

- [ ] **Step 1: Test en rojo** — la lógica testeable vive en el espejo `src/lib/notifyTargets.ts`:

```ts
it('reencuentro_seguimiento no resuelve destinatarios con cuenta: va por correo directo', () => {
  const evento = eventoBase({ tipo: 'reencuentro_seguimiento', targetUserId: null, datos: { correo: 'vecino@mail.cl', nombre: 'Luna' } });
  expect(resolverDestinatarios(evento, contexto({}))).toEqual([]);
});

it('el aviso del reencuentro agradece, dice que es el único correo, y no pide nada', () => {
  const aviso = componerAviso(eventoBase({ tipo: 'reencuentro_seguimiento', datos: { correo: 'x@x.cl', nombre: 'Luna' } }), contexto({}));
  expect(aviso.titulo).toBe('¡Luna volvió a casa!');
  expect(aviso.cuerpo).toContain('Gracias por parar');
  expect(aviso.cuerpo).toContain('único correo');
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/worker/` · Expected: FAIL.

- [ ] **Step 3: Implementar**

En LOS DOS `notifyTargets.ts` (idéntico):
1. `TipoEvento`: sumar `| 'reencuentro_seguimiento'`.
2. En `resolverDestinatarios`, primera línea del cuerpo:

```ts
  // El seguimiento anónimo no tiene cuenta: el correo va directo desde
  // index.ts (datos.correo), nunca por la resolución normal.
  if (evento.tipo === 'reencuentro_seguimiento') return [];
```

3. En `componerAviso`:

```ts
  if (evento.tipo === 'reencuentro_seguimiento') {
    const nombre = evento.datos.nombre?.trim();
    return {
      titulo: nombre ? `¡${nombre} volvió a casa!` : '¡Volvió a casa!',
      cuerpo:
        'La mascota por la que avisaste se reencontró con su familia. ' +
        'Gracias por parar: eso hizo la diferencia. Este es el único correo ' +
        'que te mandamos y tu dirección ya fue borrada.',
      ruta: evento.petId ? `/mascota/${evento.petId}` : '/',
    };
  }
```

(Adaptar el acceso a `datos`/`petId` a los nombres exactos del tipo `Evento` de ese archivo — mirar el caso vecino de `avistamiento_anonimo`, `notifyTargets.ts:296-310`.)

En `supabase/functions/send-notifications/index.ts`:
4. `EventoRow.tipo`: sumar `| 'reencuentro_seguimiento'`.
5. En el procesado del evento (donde hoy llama `armarContexto` → `resolverDestinatarios` → envío, `index.ts:385-418`), ANTES de armar contexto:

```ts
  if (ev.tipo === 'reencuentro_seguimiento') {
    const correo = typeof ev.datos.correo === 'string' ? ev.datos.correo : '';
    if (!correo) return 0;
    const { titulo, cuerpo, ruta } = componerAviso(aEvento(ev), contextoVacio());
    const base = Deno.env.get('EXPO_PUBLIC_WEB_URL') ?? '';
    return (await enviarCorreo(correo, titulo, cuerpo, `${base}${ruta}`)) ? 1 : 0;
  }
```

(`aEvento`/`contextoVacio`: usar los adaptadores que `index.ts` ya usa para llamar `componerAviso` — leer cómo lo hace el flujo normal en `:385-390` y calcar; si no existe un contexto vacío, construir el literal con las mismas claves vacías que arma `armarContexto` al inicio.)

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/worker/ && npx tsc --noEmit` · Expected: PASS, `tsc` 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifyTargets.ts supabase/functions/send-notifications/ __tests__/worker/
git commit -m "t13-d: el correo del reencuentro sale directo a datos.correo, unico y sin pedir nada"
```

### Task D3: El cliente — campo de correo opcional al avisar

**Files:**
- Modify: `src/services/avisoAnonimo.ts`
- Modify: `src/screens/PublicPetScreen.tsx`
- Test: `__tests__/services/avisoAnonimo.test.ts`, `__tests__/screens/publicPetAvisoAnonimo.test.tsx`

**Interfaces:**
- Consumes: `avistar_sin_cuenta` con `p_correo` (D1).
- Produces: `avisarSinCuenta(petId, datos)` acepta `correo?: string | null`; export `CORREO_INVALIDO: string`; función pura `correoValido(correo: string): boolean` en el mismo service.

- [ ] **Step 1: Tests en rojo** — en `__tests__/services/avisoAnonimo.test.ts`:

```ts
it('manda p_correo normalizado cuando viene', async () => {
  await avisarSinCuenta('pet-1', { nota: '', correo: '  Vecino@Mail.CL ' });
  expect(mockRpc).toHaveBeenCalledWith('avistar_sin_cuenta', expect.objectContaining({ p_correo: 'vecino@mail.cl' }));
});

it('sin correo manda null, como siempre', async () => {
  await avisarSinCuenta('pet-1', { nota: 'hola' });
  expect(mockRpc).toHaveBeenCalledWith('avistar_sin_cuenta', expect.objectContaining({ p_correo: null }));
});

it('un correo inválido corta ANTES de llamar, con mensaje amigable', async () => {
  await expect(avisarSinCuenta('pet-1', { correo: 'no-es-un-correo' })).rejects.toThrow(CORREO_INVALIDO);
  expect(mockRpc).not.toHaveBeenCalled();
});
```

Y en `__tests__/screens/publicPetAvisoAnonimo.test.tsx`, sobre el andamiaje existente:

```ts
it('ofrece el seguimiento como opcional y con la promesa de finalidad única', async () => {
  const t = textos(await montar());
  expect(t.join(' ')).toContain('¿Querés que te avisemos si aparece?');
  expect(t.join(' ')).toContain('Solo para eso');
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/services/avisoAnonimo.test.ts __tests__/screens/publicPetAvisoAnonimo.test.tsx` · Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/services/avisoAnonimo.ts`:

```ts
export const CORREO_INVALIDO = 'Ese correo no parece válido. Revisalo o dejalo vacío: el aviso sale igual.';

// La misma forma laxa que valida la base (0061): algo@algo.algo.
export function correoValido(correo: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) && correo.length <= 254;
}
```

En `DatosAviso` sumar `correo?: string | null;`. En `avisarSinCuenta`, antes del `rpc`:

```ts
  const correo = (datos.correo ?? '').trim().toLowerCase();
  if (correo && !correoValido(correo)) throw new ErrorAmigable(CORREO_INVALIDO);
```

y en la llamada: `p_correo: correo || null,`.

`src/screens/PublicPetScreen.tsx`: estado `const [correo, setCorreo] = useState('');`; en la Card del aviso (líneas 251-286), debajo del `Input` de la nota:

```tsx
              <Input
                label="¿Querés que te avisemos si aparece? (opcional)"
                placeholder="tu@correo.cl"
                value={correo}
                onChangeText={setCorreo}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <AppText muted size={12} style={styles.finalidadUnica}>
                Solo para eso: te llega un único correo si se reencuentran, y tu
                dirección se borra. No la ve la familia ni se usa para nada más.
              </AppText>
```

y `avisar()` pasa `correo` en los datos. En el mensaje de éxito (líneas 229-249), si `correo` no estaba vacío, sumar la línea `«Si aparece, te va a llegar un correo.»`.

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/services/avisoAnonimo.test.ts __tests__/screens/publicPetAvisoAnonimo.test.tsx && npx tsc --noEmit` · Expected: PASS, `tsc` 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/avisoAnonimo.ts src/screens/PublicPetScreen.tsx __tests__/
git commit -m "t13-d: correo de seguimiento opcional al avisar, con finalidad unica dicha de frente"
```

### Task D4: Migración `0062` + Edge Function — la foto entra por la puerta de servicio a un bucket privado

**Files:**
- Modify: `supabase/migrations/0062_foto_aviso_anonimo.sql` (rellenar el stub)
- Create: `supabase/functions/aviso-anonimo-foto/index.ts`
- Test: `__tests__/db/migracion0062.test.ts` (nuevo)

**Interfaces:**
- Produces: bucket privado `avisos-anonimos`; policies de SELECT y DELETE solo para el dueño del reporte de la carpeta; `avistar_sin_cuenta` con firma FINAL de 6 parámetros `(…, p_foto_path text default null)` donde la foto solo puede fijarla `service_role`; `datos.foto` en el evento; Edge Function `aviso-anonimo-foto` que valida, llama la RPC y sube. Consume: D5 (cliente).

- [ ] **Step 1: Test estático en rojo** — `__tests__/db/migracion0062.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0062_foto_aviso_anonimo.sql'),
  'utf8',
);

describe('0062: la foto del aviso anónimo solo la ve el dueño', () => {
  it('el bucket es PRIVADO (public = false): sin URL adivinable', () => {
    expect(sql).toMatch(/values \('avisos-anonimos', 'avisos-anonimos', false\)/);
  });

  it('el SELECT exige ser dueño del reporte de la carpeta', () => {
    expect(sql).toMatch(/for select to authenticated/);
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\]/);
    expect(sql).toMatch(/p\.user_id = auth\.uid\(\)/);
  });

  it('anon no puede subir: no existe policy de insert en este bucket', () => {
    expect(sql).not.toMatch(/for insert/);
  });

  it('la foto solo la fija service_role: la RPC la anula para cualquier otro rol', () => {
    expect(sql).toMatch(/auth\.role\(\) <> 'service_role'/);
  });

  it('la firma de 5 se dropea y la de 6 re-otorga a anon y authenticated', () => {
    expect(sql).toMatch(/drop function public\.avistar_sin_cuenta\(uuid, text, double precision, double precision, text\)/);
    expect(sql).toMatch(/to anon/);
  });
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/db/migracion0062.test.ts` · Expected: FAIL.

- [ ] **Step 3: Escribir la migración** (los bloques nuevos completos; la RPC repite el procedimiento verbatim de D1 sumando el parámetro y dos bloques):

```sql
-- 0062: foto en el aviso anónimo (tanda 13, función 4).
--
-- La policy de Storage de la 0001 es `for insert to authenticated`: un anónimo
-- no puede subir nada, y abrir pet-photos a anon sería un depósito de basura
-- mundial en minutos. Única vía: la Edge Function aviso-anonimo-foto
-- (service_role) valida y sube A OTRO bucket, PRIVADO. Decisión de Pablo: la
-- foto solo la ve el dueño, nunca es pública — el daño máximo es una foto fea
-- a una persona, no contenido publicado en una app de mascotas.

insert into storage.buckets (id, name, public)
values ('avisos-anonimos', 'avisos-anonimos', false);

-- Dueño del reporte de la carpeta = único lector. La ruta es
-- <pet_id>/<uuid>.<ext>: el primer segmento ata la foto a su reporte.
create policy "foto de aviso: la ve el dueño del reporte"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avisos-anonimos'
    and exists (
      select 1 from public.pets p
      where p.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

create policy "foto de aviso: la borra el dueño del reporte"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avisos-anonimos'
    and exists (
      select 1 from public.pets p
      where p.id::text = (storage.foldername(name))[1]
        and p.user_id = auth.uid()
    )
  );

-- Sin policy de INSERT a propósito: sube solo service_role (la Edge Function).

drop function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text);

create function public.avistar_sin_cuenta(
  p_pet_id uuid,
  p_nota text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_correo text default null,
  p_foto_path text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- [las mismas declaraciones de la 0061]
begin
  -- La foto solo puede venir de la Edge Function: un anónimo que llame la RPC
  -- directo no puede apuntar a rutas que no subió (ni a las de otro reporte —
  -- la policy de SELECT ya lo pararía, pero mejor ni dejar el puntero).
  if p_foto_path is not null and auth.role() <> 'service_role' then
    p_foto_path := null;
  end if;

  -- [CUERPO VERBATIM DE LA 0061 ENTERO, con UN cambio en el insert final:]
  --   jsonb_build_object('nota', left(coalesce(p_nota, ''), 500),
  --                      'lat', p_lat, 'lng', p_lng, 'foto', p_foto_path)
end;
$$;

revoke all on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text, text) from public;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text, text) to anon;
grant execute on function public.avistar_sin_cuenta(uuid, text, double precision, double precision, text, text) to authenticated;
```

- [ ] **Step 4: La Edge Function** — `supabase/functions/aviso-anonimo-foto/index.ts` (esqueleto calcado de `send-push/index.ts:1-104`: mismo CORS de `_shared/cors.ts`, mismo rate-limit en memoria, mismo doble criterio de clientes — acá solo hace falta el de `service_role`):

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cabecerasCors, ORIGENES_DEV } from '../_shared/cors.ts';

// La única puerta por la que un anónimo puede subir una foto (spec F4). Valida
// acá lo que Storage no puede: tamaño, tipo y a qué reporte va. El aviso y su
// tope (10/hora, 30/día, 0055) los aplica la RPC; si la RPC descarta el aviso,
// la foto igual quedó subida — huérfana en un bucket privado que solo lee el
-- dueño y que se borra con el reporte: intercambio aceptado y escrito.
const WINDOW_MS = 60_000;
const MAX = 5;
const hits = new Map<string, number[]>();
const MAX_BYTES = 2 * 1024 * 1024;
const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADERS_BASE = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };

function origenesPermitidos(): string[] {
  const web = Deno.env.get('EXPO_PUBLIC_WEB_URL');
  return web ? [web.replace(/\/$/, ''), ...ORIGENES_DEV] : ORIGENES_DEV;
}

function rateLimited(ip: string): boolean {
  const ahora = Date.now();
  const previos = (hits.get(ip) ?? []).filter((t) => ahora - t < WINDOW_MS);
  previos.push(ahora);
  hits.set(ip, previos);
  return previos.length > MAX;
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req.headers.get('Origin'), origenesPermitidos());
  const HEADERS = { ...HEADERS_BASE, ...cors };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405, headers: { ...HEADERS, Allow: 'POST, OPTIONS' },
    });
  }
  if (rateLimited(req.headers.get('x-forwarded-for') ?? 'desconocida')) {
    return new Response(JSON.stringify({ error: 'Demasiados intentos, esperá un minuto' }), { status: 429, headers: HEADERS });
  }

  let body: { pet_id?: string; nota?: string; correo?: string; foto_base64?: string; content_type?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Cuerpo inválido' }), { status: 400, headers: HEADERS });
  }

  const petId = body.pet_id ?? '';
  const contentType = body.content_type ?? '';
  if (!UUID_RE.test(petId) || !(contentType in TIPOS) || typeof body.foto_base64 !== 'string') {
    return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400, headers: HEADERS });
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(body.foto_base64), (c) => c.charCodeAt(0));
  } catch {
    return new Response(JSON.stringify({ error: 'La foto no se pudo leer' }), { status: 400, headers: HEADERS });
  }
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'La foto pesa más de 2 MB' }), { status: 413, headers: HEADERS });
  }

  // service_role SOLO existe acá (env de la función), nunca en la app.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const path = `${petId}/${crypto.randomUUID()}.${TIPOS[contentType]}`;

  // Primero el aviso (con sus topes de la 0055 adentro), después la foto: si
  // la RPC corta, preferimos un aviso sin foto antes que una foto sin aviso.
  const { error: errRpc } = await supabase.rpc('avistar_sin_cuenta', {
    p_pet_id: petId,
    p_nota: (body.nota ?? '').trim().slice(0, 500) || null,
    p_lat: null,
    p_lng: null,
    p_correo: (body.correo ?? '').trim().toLowerCase() || null,
    p_foto_path: path,
  });
  if (errRpc) {
    return new Response(JSON.stringify({ error: 'No se pudo registrar el aviso' }), { status: 502, headers: HEADERS });
  }

  const { error: errSubida } = await supabase.storage
    .from('avisos-anonimos')
    .upload(path, bytes, { contentType, upsert: false });
  // Si la subida falla, el aviso ya salió: el dueño ve la nota sin la foto.
  return new Response(JSON.stringify({ ok: true, foto: errSubida ? false : true }), { status: 200, headers: HEADERS });
});
```

(⚠️ El comentario con `--` en la cabecera de arriba es un typo de este plan: en el archivo real todos los comentarios TS van con `//`.)

- [ ] **Step 5: Verde** — Run: `npx jest __tests__/db/migracion0062.test.ts __tests__/lib/cors.test.ts` · Expected: PASS. (La Edge Function está fuera del typecheck del repo, como todas.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0062_foto_aviso_anonimo.sql supabase/functions/aviso-anonimo-foto/ __tests__/db/migracion0062.test.ts
git commit -m "t13-d: 0062 - bucket privado avisos-anonimos y la foto entra solo por la Edge Function"
```

### Task D5: El cliente de la foto — adjuntar al avisar, verla en la bandeja, borrarla con el reporte

**Files:**
- Modify: `src/services/avisoAnonimo.ts` (`avisarConFoto`)
- Modify: `src/screens/PublicPetScreen.tsx` (adjuntar foto)
- Create: `src/components/FotoAvisoAnonimo.tsx`
- Modify: `src/lib/avisosBandeja.ts` (`AvisoPresentado.fotoPath`)
- Modify: `src/screens/AvisosScreen.tsx`
- Modify: `src/services/pets.ts` (`deletePet` limpia la carpeta)
- Test: `__tests__/services/avisoAnonimo.test.ts`, `__tests__/lib/avisosBandeja.test.ts`, `__tests__/services/pets.test.ts` (o la suite que cubra `deletePet`)

**Interfaces:**
- Consumes: Edge Function `aviso-anonimo-foto` y bucket `avisos-anonimos` (D4).
- Produces: `avisarConFoto(petId, datos & { fotoUri: string }): Promise<void>`; `AvisoPresentado.fotoPath?: string`; `<FotoAvisoAnonimo path={string} />`.

- [ ] **Step 1: Tests en rojo**

```ts
// avisoAnonimo.test.ts
it('avisarConFoto pasa por la Edge Function, no por la RPC', async () => {
  await avisarConFoto('pet-1', { nota: 'hola', fotoBase64: 'QUJD', contentType: 'image/jpeg' });
  expect(mockInvoke).toHaveBeenCalledWith('aviso-anonimo-foto', {
    body: expect.objectContaining({ pet_id: 'pet-1', foto_base64: 'QUJD', content_type: 'image/jpeg' }),
  });
  expect(mockRpc).not.toHaveBeenCalled();
});

// avisosBandeja.test.ts
it('el aviso anónimo con foto expone el path para que la pantalla la baje', () => {
  const t = textoDeAviso({ id: '1', tipo: 'avistamiento_anonimo', pet_id: 'p', datos: { nota: 'x', foto: 'p/abc.jpg' }, creado_en: hoy });
  expect(t.fotoPath).toBe('p/abc.jpg');
});

// pets.test.ts (deletePet)
it('borrar el reporte también vacía su carpeta de fotos anónimas', async () => {
  await deletePet('pet-1', 'user-1');
  expect(mockStorageFrom).toHaveBeenCalledWith('avisos-anonimos');
});
```

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/services/avisoAnonimo.test.ts __tests__/lib/avisosBandeja.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/services/avisoAnonimo.ts`:

```ts
export interface DatosAvisoConFoto extends DatosAviso {
  fotoBase64: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

// La foto no puede ir por la RPC (un anónimo no puede subir a Storage): va
// entera a la Edge Function, que valida, registra el aviso y sube.
export async function avisarConFoto(petId: string, datos: DatosAvisoConFoto): Promise<void> {
  const correo = (datos.correo ?? '').trim().toLowerCase();
  if (correo && !correoValido(correo)) throw new ErrorAmigable(CORREO_INVALIDO);
  const { error } = await supabase.functions.invoke('aviso-anonimo-foto', {
    body: {
      pet_id: petId,
      nota: (datos.nota ?? '').trim().slice(0, TOPE_NOTA),
      correo: correo || null,
      foto_base64: datos.fotoBase64,
      content_type: datos.contentType,
    },
  });
  if (error) throw new ErrorAmigable(AVISO_NO_DISPONIBLE);
}
```

`src/screens/PublicPetScreen.tsx`: botón «Sumar una foto (opcional)» sobre el de enviar, usando `src/lib/pickImage` (el mismo picker del Perfil) + compresión calcada de `storage.ts:6-11` (`ImageManipulator`, 1080 px, JPEG 0.6) + `fetch(uri)` → `blob` → `FileReader.readAsDataURL` para el base64 (en web) — extraer esa conversión a un helper local `uriABase64(uri): Promise<string>`. Con foto elegida, `avisar()` llama `avisarConFoto`; sin foto, el camino existente intacto. Debajo del botón, la línea honesta: `«La foto la ve solo la familia. No se publica en ningún lado.»`

`src/lib/avisosBandeja.ts`: `AvisoPresentado` suma `fotoPath?: string;` y el caso `avistamiento_anonimo` (líneas 89-95) suma `fotoPath: texto(d, 'foto') ?? undefined,`.

`src/components/FotoAvisoAnonimo.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';

// Baja la foto privada del aviso anónimo con una URL firmada de corta vida.
// Solo el dueño del reporte pasa la policy del bucket: para cualquier otro,
// createSignedUrl falla y acá simplemente no se dibuja nada.
export default function FotoAvisoAnonimo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    supabase.storage
      .from('avisos-anonimos')
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (vivo && data?.signedUrl) setUrl(data.signedUrl);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [path]);
  if (!url) return null;
  return <Image source={{ uri: url }} style={styles.foto} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  foto: { width: '100%', height: 180, borderRadius: 8, marginTop: 8 },
});
```

`src/screens/AvisosScreen.tsx`: en el render del aviso (líneas 136-167), después del `AvisoEstafa`: `{t.fotoPath ? <FotoAvisoAnonimo path={t.fotoPath} /> : null}`.

`src/services/pets.ts` — en `deletePet`, después del `remove` de `pet-photos` y ANTES del delete de la fila (mismo criterio: si Storage falla, la fila se borra igual):

```ts
  // La carpeta de fotos anónimas del reporte (bucket privado, 0062). La lista
  // el dueño porque la policy de select se lo permite; si falla, warn y seguir.
  try {
    const { data: anonimas } = await supabase.storage.from('avisos-anonimos').list(id);
    if (anonimas && anonimas.length > 0) {
      await supabase.storage.from('avisos-anonimos').remove(anonimas.map((f) => `${id}/${f.name}`));
    }
  } catch (e: any) {
    console.warn('No se pudieron borrar las fotos anónimas:', e?.message);
  }
```

- [ ] **Step 4: Verde** — Run: `npx jest __tests__/services/ __tests__/lib/avisosBandeja.test.ts __tests__/screens/publicPetAvisoAnonimo.test.tsx && npx tsc --noEmit` · Expected: PASS, `tsc` 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/ src/screens/ src/components/FotoAvisoAnonimo.tsx src/lib/avisosBandeja.ts __tests__/
git commit -m "t13-d: adjuntar foto al aviso anonimo, verla solo el dueño, borrarla con el reporte"
```

### Task D6: Los papeles — la política de privacidad cuenta el correo de seguimiento y la foto

**Files:**
- Modify: `docs/legal/politica-privacidad.md`
- Modify: `__tests__/lib/legalCoherencia.test.ts`
- Regenerar: `npm run legales` (toca `src/content/legalGenerado.ts`, `public/privacidad/index.html`)

**Interfaces:**
- Consumes: los comportamientos reales de D1–D5 (no prometer nada que el código no haga).

- [ ] **Step 1: Test en rojo** — en `__tests__/lib/legalCoherencia.test.ts`, sumar a la tabla `compromisos` (línea ~88, misma forma que «250 metros»):

```ts
  ['el correo de seguimiento es de finalidad única', 'privacidad', 'único correo'],
  ['la foto del aviso anónimo no es pública', 'privacidad', 'solo la ve la familia del reporte'],
```

(Adaptar a la estructura EXACTA de la tabla existente — abrir el archivo y calcar una fila; la aserción vigente exige que la frase esté en el markdown Y llegue a la app.)

- [ ] **Step 2: Rojo** — Run: `npx jest __tests__/lib/legalCoherencia.test.ts` · Expected: FAIL (la frase no existe en el markdown).

- [ ] **Step 3: Escribir en `docs/legal/politica-privacidad.md`**, en la sección de datos que se recogen (respetando los `[[PENDIENTE]]` existentes, sin resolver ninguno):

```markdown
## Si avisás desde el link público sin tener cuenta

- **Correo de seguimiento (opcional).** Si al avisar dejás tu correo, lo
  guardamos con una sola finalidad: mandarte un único correo si esa mascota se
  reencuentra con su familia. No se lo mostramos a nadie —tampoco a la
  familia—, no se usa para nada más, y se borra cuando el caso se cierra de
  cualquier forma (reencuentro, cierre o vencimiento del reporte).
- **Foto (opcional).** Si adjuntás una foto, solo la ve la familia del reporte.
  No se publica en el mapa, ni en la ficha, ni en ningún otro lado, y se borra
  junto con el reporte.
```

- [ ] **Step 4: Regenerar y verde** — Run: `npm run legales && npx jest __tests__/lib/legalCoherencia.test.ts __tests__/legales.test.js` · Expected: PASS (el generado en modo borrador, como está hoy).

- [ ] **Step 5: Commit**

```bash
git add docs/legal/politica-privacidad.md src/content/legalGenerado.ts public/ __tests__/lib/legalCoherencia.test.ts
git commit -m "t13-d: la privacidad cuenta el correo de finalidad unica y la foto que no es publica"
```

---

## INTEGRACIÓN Y DESPLIEGUE

### Task INT: Fusión, suite entera y revisión adversarial

- [ ] **Step 1:** Fusionar `feat/t13-a` → `feat/t13-b` → `feat/t13-c` → `feat/t13-d` sobre `feat/mvp-encuentra-mascota` (en ese orden; los conflictos esperables son `ProfileScreen.tsx` entre A/B/C — resolver conservando las tres adiciones — y los CHECK de tipo entre C1 y D1, que ya están escritos como listas UNIÓN).
- [ ] **Step 2:** Run: `npx tsc --noEmit && npx jest` · Expected: 0 errores y `exit 0` VERIFICADO (no encadenado a un `tail` — lección del ESTADO.md).
- [ ] **Step 3:** **Revisión adversarial de rama ANTES de aplicar nada** (regla de la tanda 12: se fusionó sin revisión con 3 Criticals adentro): 4 revisores en paralelo sobre áreas disjuntas (A, B, C+despachador, D), con la instrucción explícita de contradecir este plan en vez de seguirlo.
- [ ] **Step 4:** Fix wave de lo que salga + re-suite + commit.

### Orden de despliegue (NO cambiar el orden — cada línea tiene una cicatriz detrás)

1. **Redesplegar `send-notifications`** (`supabase functions deploy send-notifications`) — ANTES de aplicar `0060`/`0061`, o el despachador consume eventos que no conoce (el agujero mudo de la tanda 8/11). Humo: `OPTIONS` → 204, `POST` sin credenciales → 401.
2. **Desplegar `aviso-anonimo-foto`** (`supabase functions deploy aviso-anonimo-foto`). Mismo humo.
3. **Aplicar `0059` → `0060` → `0061` → `0062` en orden**, cada una ensayada primero dentro de `begin … rollback` contra la base real, con ataques después de aplicar (como la 0058: escaladas de privilegio sobre el grant nuevo de `profiles`, `perfil_publico` con el interruptor apagado consultada como `anon` vía HTTP, `avistar_sin_cuenta` con `p_foto_path` malicioso como `anon` — debe quedar `datos.foto = null`—, y el trigger de seguimientos con `responder_estado('aparecio')` en una transacción de prueba). ⚠️ Recordatorio de la 0045: probar los guardrails de admin exige `set local role authenticated` + `set local request.jwt.claims`; entrar como `postgres` no los ejercita.
4. **Exportar el `dist` y que Pablo lo suba** — la web SIEMPRE después de las migraciones (la `0059` es la que rompe guardar el perfil si el orden se invierte).
5. **Verificar contra el sitio real**: bundle servido == exportado, humo con navegador de los flujos nuevos (afiche sin número, perfil con red social apagada consultado desde otra cuenta, aviso anónimo con correo y foto), 0 errores JS.

### Deuda que este plan deja anotada (decisión consciente, no descuido)

- El código corto tipeable del afiche (`/m/AB12`) sigue atado al dominio propio — pendiente del nombre de la app.
- La foto huérfana (subida cuando la RPC descartó el aviso por tope) queda en el bucket privado hasta que el reporte se borre. Volumen acotado por los topes; si molesta, un barrido tipo `barridoFotos.ts` la limpia.
- El correo del reencuentro sale por Brevo, que sigue caído: los eventos quedan `pendiente` (no se purgan nunca) y salen solos cuando Pablo active la cuenta.
- `quiereEsteTipo` sigue con el fallback a `p.pistas` para tipos no dirigidos futuros — se deja porque los dos tipos nuevos no pasan por ahí.

## Self-review (hecho al escribir el plan)

- **Cobertura de la spec:** 0.a → A1/A2/A3 · 0.b → B1/B2/B3 · 0.c → B3 · F1 → A1/A3 · F2 → C1/C2/C3 · F3 → D1/D2/D3/D6 · F4 → D4/D5/D6 · hallazgo del dominio ajeno → A1/A2 · «tocar faltaWhatsapp» → A3 (la guardia se convierte en preset del interruptor) · números de migración confirmados → Task 0 (0059–0062, la 0056 queda libre).
- **Tipos cruzados verificados:** `armarAfiche(pet, profile, opciones)` (A1) == lo que llama `AficheGenerator` (A3); `camposDeContactoParaGuardar` con 4 args (B2) == llamada de `guardarPerfil` (B3); firma SQL de 5 params (D1) == `p_correo` del service (D3); firma de 6 (D4) == Edge Function (D4) y `datos.foto` (D5); `'denuncia_nueva'`/`'reencuentro_seguimiento'` idénticos en CHECK, `TipoEvento`, `EventoRow`, `componerAviso` y `textoDeAviso`.
- **Riesgo conocido:** los pasos que dicen «cuerpo VERBATIM» dependen de que el implementador copie de verdad el SQL vigente — el test estático de cada migración verifica las marcas de los topes para atajar el olvido.




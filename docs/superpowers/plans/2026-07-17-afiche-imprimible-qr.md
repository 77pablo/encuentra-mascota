# Afiche imprimible con QR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño de un reporte genere una imagen PNG de un afiche imprimible (con foto, datos, WhatsApp y QR al reporte) para compartir por WhatsApp o pegar en la calle.

**Architecture:** Lógica pura en `src/lib/afiche.ts` (contenido del afiche) y `src/lib/qr.ts` (matriz del QR), ambas con tests. Componentes de presentación `QrCode.tsx` y `AfichePoster.tsx`. Un componente `AficheGenerator.tsx` monta el afiche fuera de pantalla y lo rasteriza a PNG con `react-native-view-shot`, entregándolo por descarga (web) o `expo-sharing` (nativo). Se integra con un botón "Crear afiche" en `PetDetailScreen`, visible solo para el dueño.

**Tech Stack:** Expo / React Native (Web + nativo), TypeScript, `react-native-svg` (ya presente), `react-native-view-shot`, `qrcode-generator`, `expo-sharing`, Jest (`jest-expo`).

## Global Constraints

- Tests en `__tests__/` espejando `src/` (p. ej. `src/lib/afiche.ts` → `__tests__/lib/afiche.test.ts`). Correr con `npm test`.
- Typecheck: `npx tsc --noEmit` sin errores.
- El afiche es **solo para el reporte propio** (`pet.user_id === user.id`).
- La foto usada es `fotos[0]`. La "zona" es texto fijo (sin dirección exacta), por privacidad.
- Titulares exactos: `perdida` → `"SE BUSCA"`; `encontrada` → `"¿CONOCÉS A ESTA MASCOTA?"`.
- Paleta desde `src/theme` (`colors.brand '#17654B'`, `colors.sun '#EFB13C'`, `colors.lost '#E0623D'`, `colors.ink '#23231D'`, `colors.line '#EFE8DA'`, `colors.bg '#FBF6EC'`). Fuentes desde `font` (`font.display`, `font.body`, etc.).
- Idioma de UI: español (rioplatense), consistente con el resto de la app.
- Commits frecuentes, uno por tarea.

---

## File Structure

- `src/lib/afiche.ts` — **crear**. Lógica pura: arma `AficheContent` desde `Pet` + `Profile`; helpers `faltaWhatsapp`, `normalizarWhatsapp`, `armarSubtitulo`, `armarNombreArchivo`.
- `__tests__/lib/afiche.test.ts` — **crear**. Tests de la lógica pura.
- `src/lib/qr.ts` — **crear**. `qrMatrix(value)` → `boolean[][]` con `qrcode-generator`.
- `__tests__/lib/qr.test.ts` — **crear**. Tests de la matriz.
- `src/components/QrCode.tsx` — **crear**. Dibuja la matriz con `react-native-svg`.
- `src/components/AfichePoster.tsx` — **crear**. Presentación del afiche (proporción carta).
- `src/lib/aficheImage.ts` — **crear**. `fotoParaCaptura`, `capturarAfiche`, `entregarAfiche`.
- `src/components/AficheGenerator.tsx` — **crear**. Monta el afiche fuera de pantalla y dispara la captura + entrega.
- `src/screens/PetDetailScreen.tsx` — **modificar**. Botón "Crear afiche" (solo dueño), guardia de WhatsApp, montaje del generador. Único archivo existente modificado.
- `package.json` — **modificar** (dependencias nuevas vía instalación).

---

### Task 1: Lógica pura del afiche (`afiche.ts`)

**Files:**
- Create: `src/lib/afiche.ts`
- Test: `__tests__/lib/afiche.test.ts`

**Interfaces:**
- Consumes: `Pet` de `../services/pets`, `Profile` de `../services/profile`, `petUrl` de `./links`.
- Produces:
  - `interface AficheContent { titular: string; nombre: string | null; subtitulo: string; senas: string; recompensa: string | null; zonaTexto: string; foto: string | null; whatsappDigits: string; whatsappDisplay: string; waLink: string | null; url: string | null; }`
  - `normalizarWhatsapp(telefono: string | null | undefined): string`
  - `faltaWhatsapp(profile: Pick<Profile, 'telefono'> | null | undefined): boolean`
  - `armarSubtitulo(pet: Pick<Pet, 'especie' | 'raza'>): string`
  - `armarNombreArchivo(pet: Pick<Pet, 'nombre' | 'especie'>): string`
  - `armarAfiche(pet: Pet, profile: Pick<Profile, 'telefono'> | null): AficheContent`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/afiche.test.ts`:

```ts
import {
  armarAfiche,
  armarSubtitulo,
  armarNombreArchivo,
  faltaWhatsapp,
  normalizarWhatsapp,
} from '../../src/lib/afiche';
import { Pet } from '../../src/services/pets';

function pet(over: Partial<Pet>): Pet {
  return {
    id: 'pet-1',
    user_id: 'u',
    estado: 'perdida',
    especie: 'perro',
    raza: null,
    nombre: null,
    descripcion: 'Manchas negras, collar rojo',
    fotos: [],
    lat: -33.45,
    lng: -70.66,
    recompensa: null,
    activo: true,
    oculto: false,
    creado_en: '2026-07-01T00:00:00Z',
    ...over,
  };
}

describe('normalizarWhatsapp', () => {
  it('deja solo dígitos', () => {
    expect(normalizarWhatsapp('+56 9 1234 5678')).toBe('56912345678');
    expect(normalizarWhatsapp(null)).toBe('');
    expect(normalizarWhatsapp('')).toBe('');
  });
});

describe('faltaWhatsapp', () => {
  it('true si no hay teléfono', () => {
    expect(faltaWhatsapp(null)).toBe(true);
    expect(faltaWhatsapp({ telefono: '' })).toBe(true);
    expect(faltaWhatsapp({ telefono: '   ' })).toBe(true);
  });
  it('false si hay dígitos', () => {
    expect(faltaWhatsapp({ telefono: '+56912345678' })).toBe(false);
  });
});

describe('armarSubtitulo', () => {
  it('especie sola cuando no hay raza', () => {
    expect(armarSubtitulo({ especie: 'gato', raza: null })).toBe('Gato');
  });
  it('especie · raza cuando hay raza', () => {
    expect(armarSubtitulo({ especie: 'perro', raza: 'Labrador' })).toBe('Perro · Labrador');
  });
  it('"otro" se muestra como Mascota', () => {
    expect(armarSubtitulo({ especie: 'otro', raza: null })).toBe('Mascota');
  });
});

describe('armarNombreArchivo', () => {
  it('usa el nombre en slug y termina en .png', () => {
    expect(armarNombreArchivo({ nombre: 'Firulais Ñandú', especie: 'perro' })).toBe('afiche-firulais-nandu.png');
  });
  it('cae a la especie si no hay nombre', () => {
    expect(armarNombreArchivo({ nombre: null, especie: 'gato' })).toBe('afiche-gato.png');
  });
});

describe('armarAfiche', () => {
  const original = process.env.EXPO_PUBLIC_WEB_URL;
  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = original;
  });

  it('titular "SE BUSCA" para perdida', () => {
    const c = armarAfiche(pet({ estado: 'perdida' }), { telefono: '+56912345678' });
    expect(c.titular).toBe('SE BUSCA');
  });

  it('titular "¿CONOCÉS A ESTA MASCOTA?" para encontrada', () => {
    const c = armarAfiche(pet({ estado: 'encontrada' }), { telefono: '+56912345678' });
    expect(c.titular).toBe('¿CONOCÉS A ESTA MASCOTA?');
  });

  it('incluye recompensa solo si tiene valor', () => {
    expect(armarAfiche(pet({ recompensa: '' }), null).recompensa).toBeNull();
    expect(armarAfiche(pet({ recompensa: '$50.000' }), null).recompensa).toBe('$50.000');
  });

  it('toma la primera foto o null', () => {
    expect(armarAfiche(pet({ fotos: ['a.jpg', 'b.jpg'] }), null).foto).toBe('a.jpg');
    expect(armarAfiche(pet({ fotos: [] }), null).foto).toBeNull();
  });

  it('arma waLink desde el teléfono del perfil, o null si no hay', () => {
    expect(armarAfiche(pet({}), { telefono: '+56 9 1234 5678' }).waLink).toBe('https://wa.me/56912345678');
    expect(armarAfiche(pet({}), null).waLink).toBeNull();
  });

  it('url es null si no hay base URL configurada', () => {
    process.env.EXPO_PUBLIC_WEB_URL = '';
    expect(armarAfiche(pet({ id: 'xyz' }), null).url).toBeNull();
  });

  it('url usa EXPO_PUBLIC_WEB_URL cuando está configurada', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://mascotas.app';
    expect(armarAfiche(pet({ id: 'xyz' }), null).url).toBe('https://mascotas.app/mascota/xyz');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- afiche`
Expected: FAIL — `Cannot find module '../../src/lib/afiche'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/afiche.ts`:

```ts
import { Pet } from '../services/pets';
import { Profile } from '../services/profile';
import { petUrl } from './links';

export interface AficheContent {
  titular: string;
  nombre: string | null;
  subtitulo: string;
  senas: string;
  recompensa: string | null;
  zonaTexto: string;
  foto: string | null;
  whatsappDigits: string;
  whatsappDisplay: string;
  waLink: string | null;
  url: string | null;
}

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Deja solo los dígitos del teléfono (formato que usa wa.me).
export function normalizarWhatsapp(telefono: string | null | undefined): string {
  return (telefono ?? '').replace(/\D/g, '');
}

// Un afiche sin WhatsApp pierde fuerza: esto decide si mostrar la guardia
// "cargá tu WhatsApp" antes de generar.
export function faltaWhatsapp(profile: Pick<Profile, 'telefono'> | null | undefined): boolean {
  return normalizarWhatsapp(profile?.telefono).length === 0;
}

export function armarSubtitulo(pet: Pick<Pet, 'especie' | 'raza'>): string {
  const base = especieLabel[pet.especie];
  return pet.raza ? `${base} · ${pet.raza}` : base;
}

export function armarNombreArchivo(pet: Pick<Pet, 'nombre' | 'especie'>): string {
  const raw = (pet.nombre || especieLabel[pet.especie]).toLowerCase();
  const slug =
    raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mascota';
  return `afiche-${slug}.png`;
}

export function armarAfiche(pet: Pet, profile: Pick<Profile, 'telefono'> | null): AficheContent {
  const digits = normalizarWhatsapp(profile?.telefono);
  return {
    titular: pet.estado === 'perdida' ? 'SE BUSCA' : '¿CONOCÉS A ESTA MASCOTA?',
    nombre: pet.nombre || null,
    subtitulo: armarSubtitulo(pet),
    senas: pet.descripcion,
    recompensa: pet.recompensa || null,
    zonaTexto: 'Visto cerca de esta zona',
    foto: pet.fotos?.[0] ?? null,
    whatsappDigits: digits,
    whatsappDisplay: profile?.telefono ?? '',
    waLink: digits ? `https://wa.me/${digits}` : null,
    url: petUrl(pet.id),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- afiche`
Expected: PASS (todos los `describe` de `afiche.test.ts` en verde).

- [ ] **Step 5: Commit**

```bash
git add src/lib/afiche.ts __tests__/lib/afiche.test.ts
git commit -m "feat(afiche): logica pura del contenido del afiche + tests"
```

---

### Task 2: Matriz y componente del QR (`qr.ts` + `QrCode.tsx`)

**Files:**
- Create: `src/lib/qr.ts`
- Create: `src/components/QrCode.tsx`
- Test: `__tests__/lib/qr.test.ts`
- Modify: `package.json` (agrega `qrcode-generator`)

**Interfaces:**
- Consumes: `qrcode-generator` (paquete npm).
- Produces:
  - `qrMatrix(value: string): boolean[][]` (matriz cuadrada; `true` = módulo oscuro)
  - Componente `QrCode({ value, size }: { value: string; size?: number })`

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
npm install qrcode-generator
npm install --save-dev @types/qrcode-generator
```
Expected: se agregan a `package.json` sin errores.

Nota: si `@types/qrcode-generator` no existiera en el registro, crear `src/types/qrcode-generator.d.ts` con:
```ts
declare module 'qrcode-generator' {
  interface QR {
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  }
  function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QR;
  export = qrcode;
}
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/lib/qr.test.ts`:

```ts
import { qrMatrix } from '../../src/lib/qr';

describe('qrMatrix', () => {
  it('devuelve una matriz cuadrada no vacía', () => {
    const m = qrMatrix('https://mascotas.app/mascota/abc');
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((row) => row.length === m.length)).toBe(true);
  });

  it('es determinista para el mismo valor', () => {
    expect(qrMatrix('hola')).toEqual(qrMatrix('hola'));
  });

  it('cambia con valores distintos', () => {
    expect(qrMatrix('a')).not.toEqual(qrMatrix('b'));
  });

  it('contiene módulos oscuros y claros', () => {
    const flat = qrMatrix('test').flat();
    expect(flat).toContain(true);
    expect(flat).toContain(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- qr`
Expected: FAIL — `Cannot find module '../../src/lib/qr'`.

- [ ] **Step 4: Write minimal implementation**

Create `src/lib/qr.ts`:

```ts
import qrcode from 'qrcode-generator';

// Genera la matriz de módulos del QR (true = módulo oscuro). Puro JS, sin red.
export function qrMatrix(value: string): boolean[][] {
  const qr = qrcode(0, 'M'); // typeNumber 0 = tamaño automático; corrección 'M'
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let r = 0; r < count; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < count; c++) {
      row.push(qr.isDark(r, c));
    }
    matrix.push(row);
  }
  return matrix;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- qr`
Expected: PASS.

- [ ] **Step 6: Write the QR component**

Create `src/components/QrCode.tsx`:

```tsx
import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { qrMatrix } from '../lib/qr';

// Dibuja el QR de `value` como SVG (cuadrado de `size` px). Sin red ni API keys.
export default function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const matrix = qrMatrix(value);
  const count = matrix.length;
  const cell = size / count;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        rects.push(
          <Rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#000000" />,
        );
      }
    }
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
      {rects}
    </Svg>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/lib/qr.ts __tests__/lib/qr.test.ts src/components/QrCode.tsx package.json package-lock.json
git commit -m "feat(afiche): generacion de QR (matriz pura + componente SVG)"
```

---

### Task 3: Componente visual del afiche (`AfichePoster.tsx`)

**Files:**
- Create: `src/components/AfichePoster.tsx`

**Interfaces:**
- Consumes: `AficheContent` de `../lib/afiche`, `QrCode` de `./QrCode`, `colors`/`font`/`spacing`/`radius` de `../theme`.
- Produces:
  - `interface AfichePosterProps { content: AficheContent; foto: string | null; onFotoLoad?: () => void; }`
  - Componente `AfichePoster(props: AfichePosterProps)` — una `View` de 816×1056 px (carta a ~96dpi).

- [ ] **Step 1: Write the component**

Create `src/components/AfichePoster.tsx`:

```tsx
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppText } from '../ui';
import { colors, font, radius, spacing } from '../theme';
import QrCode from './QrCode';
import { AficheContent } from '../lib/afiche';

export interface AfichePosterProps {
  content: AficheContent;
  foto: string | null; // uri o data-uri ya resuelta
  onFotoLoad?: () => void; // se dispara cuando la imagen terminó de cargar (para capturar)
}

const WIDTH = 816; // 8.5in * 96dpi
const HEIGHT = 1056; // 11in * 96dpi

export default function AfichePoster({ content, foto, onFotoLoad }: AfichePosterProps) {
  return (
    <View style={styles.page}>
      <AppText style={styles.titular}>{content.titular}</AppText>

      <View style={styles.fotoWrap}>
        {foto ? (
          <Image source={{ uri: foto }} style={styles.foto} onLoad={onFotoLoad} resizeMode="cover" />
        ) : (
          <View style={[styles.foto, styles.fotoPlaceholder]}>
            <AppText size={96}>🐾</AppText>
          </View>
        )}
      </View>

      {content.nombre ? <AppText style={styles.nombre}>{content.nombre}</AppText> : null}
      <AppText style={styles.subtitulo}>{content.subtitulo}</AppText>

      <AppText style={styles.senas}>{content.senas}</AppText>

      {content.recompensa ? (
        <View style={styles.recompensa}>
          <AppText style={styles.recompensaText}>🎁 Recompensa: {content.recompensa}</AppText>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.contacto}>
          <AppText style={styles.contactoLabel}>Contactá por WhatsApp</AppText>
          <AppText style={styles.contactoNumero}>{content.whatsappDisplay}</AppText>
          <AppText style={styles.zona}>{content.zonaTexto}</AppText>
        </View>
        <View style={styles.qrWrap}>
          <QrCode value={content.url ?? 'https://encuentratumascota.app'} size={200} />
          <AppText style={styles.qrText}>Escaneá para ver más</AppText>
        </View>
      </View>

      <AppText style={styles.marca}>Publicado en Encuentra tu Mascota 🐾</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: colors.bg,
    padding: spacing.xxxl,
    justifyContent: 'flex-start',
  },
  titular: {
    fontFamily: font.display,
    fontSize: 72,
    lineHeight: 78,
    color: colors.lost,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  fotoWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  foto: {
    width: WIDTH - spacing.xxxl * 2,
    height: 420,
    borderRadius: radius.lg,
    backgroundColor: colors.sky,
  },
  fotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nombre: {
    fontFamily: font.display,
    fontSize: 46,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitulo: {
    fontFamily: font.bodySemi,
    fontSize: 28,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  senas: {
    fontFamily: font.body,
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  recompensa: {
    alignSelf: 'center',
    backgroundColor: colors.sun,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  recompensaText: {
    fontFamily: font.bodyBold,
    fontSize: 28,
    color: colors.ink,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    borderTopWidth: 2,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  contacto: {
    flexShrink: 1,
    paddingRight: spacing.lg,
  },
  contactoLabel: {
    fontFamily: font.bodySemi,
    fontSize: 24,
    color: colors.brand,
  },
  contactoNumero: {
    fontFamily: font.display,
    fontSize: 44,
    color: colors.ink,
  },
  zona: {
    fontFamily: font.body,
    fontSize: 20,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  qrWrap: {
    alignItems: 'center',
  },
  qrText: {
    fontFamily: font.body,
    fontSize: 16,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  marca: {
    fontFamily: font.bodySemi,
    fontSize: 18,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
```

Nota: `AppText` acepta `style`; se pasan `fontFamily`/`fontSize` por estilo (no por props) para controlar el afiche con precisión. Verificar que `AppText` reenvía `style` (lo hace el resto de la app).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. Si `AppText` no aceptara `onLoad`/props extra, el error saldría acá (no debería: `onLoad` va en `Image`, no en `AppText`).

- [ ] **Step 3: Commit**

```bash
git add src/components/AfichePoster.tsx
git commit -m "feat(afiche): componente visual del afiche (proporcion carta)"
```

---

### Task 4: Captura y entrega del PNG (`aficheImage.ts`)

**Files:**
- Create: `src/lib/aficheImage.ts`
- Modify: `package.json` (agrega `react-native-view-shot`, `expo-sharing`)

**Interfaces:**
- Consumes: `react-native-view-shot` (`captureRef`), `expo-sharing` (carga diferida en nativo), `Platform` de `react-native`.
- Produces:
  - `fotoParaCaptura(uri: string | null): Promise<string | null>` — en web baja la foto a data-uri; en nativo devuelve la uri tal cual.
  - `capturarAfiche(ref: unknown): Promise<string>` — devuelve data-uri (web) o file-uri (nativo) del PNG.
  - `entregarAfiche(pngUri: string, nombreArchivo: string): Promise<void>` — descarga (web) o comparte (nativo).

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
npx expo install react-native-view-shot expo-sharing
```
Expected: Expo fija las versiones compatibles con SDK 57 en `package.json`.

- [ ] **Step 2: Write implementation**

Create `src/lib/aficheImage.ts`:

```ts
import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';

// En web, capturar un canvas con una imagen de otro origen lo "ensucia" y falla
// la exportación. Bajamos la foto a data-uri (mismo origen) antes de renderizar.
// En nativo, view-shot captura la imagen remota sin problema.
export async function fotoParaCaptura(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  if (Platform.OS !== 'web') return uri;
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return uri; // si falla, seguimos con la uri remota
  }
}

// Rasteriza el afiche referenciado a PNG. Web → data-uri; nativo → archivo temporal.
export async function capturarAfiche(ref: unknown): Promise<string> {
  return captureRef(ref as never, {
    format: 'png',
    quality: 1,
    result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
  });
}

// Entrega el PNG: en web dispara una descarga; en nativo abre la hoja de compartir.
export async function entregarAfiche(pngUri: string, nombreArchivo: string): Promise<void> {
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = pngUri;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(pngUri, { mimeType: 'image/png', dialogTitle: 'Compartir afiche' });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/aficheImage.ts package.json package-lock.json
git commit -m "feat(afiche): captura a PNG y entrega (descarga web / compartir nativo)"
```

---

### Task 5: Generador y botón en el detalle (`AficheGenerator.tsx` + `PetDetailScreen.tsx`)

**Files:**
- Create: `src/components/AficheGenerator.tsx`
- Modify: `src/screens/PetDetailScreen.tsx`

**Interfaces:**
- Consumes: `armarAfiche`/`armarNombreArchivo` de `../lib/afiche`, `fotoParaCaptura`/`capturarAfiche`/`entregarAfiche` de `../lib/aficheImage`, `AfichePoster` de `./AfichePoster`, `Pet` de `../services/pets`, `Profile`/`getMyProfile` de `../services/profile`, `faltaWhatsapp` de `../lib/afiche`.
- Produces:
  - `interface AficheGeneratorProps { pet: Pet; profile: Profile; onDone: () => void; onError: (mensaje: string) => void; }`
  - Componente `AficheGenerator(props)` — monta el afiche fuera de pantalla y dispara la captura al cargar la foto.

- [ ] **Step 1: Write the generator component**

Create `src/components/AficheGenerator.tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import AfichePoster from './AfichePoster';
import { armarAfiche, armarNombreArchivo } from '../lib/afiche';
import { capturarAfiche, entregarAfiche, fotoParaCaptura } from '../lib/aficheImage';
import { Pet } from '../services/pets';
import { Profile } from '../services/profile';

export interface AficheGeneratorProps {
  pet: Pet;
  profile: Profile;
  onDone: () => void;
  onError: (mensaje: string) => void;
}

export default function AficheGenerator({ pet, profile, onDone, onError }: AficheGeneratorProps) {
  const posterRef = useRef<View>(null);
  const disparado = useRef(false);
  const content = armarAfiche(pet, profile);
  const [foto, setFoto] = useState<string | null | undefined>(undefined); // undefined = resolviendo

  useEffect(() => {
    let vivo = true;
    fotoParaCaptura(content.foto)
      .then((f) => vivo && setFoto(f))
      .catch(() => vivo && setFoto(content.foto));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capturar = useCallback(async () => {
    if (disparado.current) return;
    disparado.current = true;
    try {
      const png = await capturarAfiche(posterRef.current);
      await entregarAfiche(png, armarNombreArchivo(pet));
      onDone();
    } catch (e: any) {
      onError(e?.message ?? 'No se pudo crear el afiche.');
    }
  }, [pet, onDone, onError]);

  // Si no hay foto, capturamos poco después de montar; si hay, esperamos su onLoad.
  useEffect(() => {
    if (foto === undefined) return; // aún resolviendo
    if (!content.foto) {
      const t = setTimeout(capturar, 400);
      return () => clearTimeout(t);
    }
  }, [foto, content.foto, capturar]);

  if (foto === undefined) return null;

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={posterRef} collapsable={false}>
        <AfichePoster content={content} foto={foto} onFotoLoad={content.foto ? capturar : undefined} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
  },
});
```

- [ ] **Step 2: Wire the button into `PetDetailScreen.tsx`**

En `src/screens/PetDetailScreen.tsx`:

Agregar imports (junto a los existentes):
```tsx
import AficheGenerator from '../components/AficheGenerator';
import { faltaWhatsapp } from '../lib/afiche';
import { getMyProfile, Profile } from '../services/profile';
```

Dentro del componente, junto a los otros `useState`:
```tsx
  const [perfil, setPerfil] = useState<Profile | null>(null);
  const [generandoAfiche, setGenerandoAfiche] = useState(false);
```

Agregar el handler (después de `const esMio = ...`, o cerca de `denunciar`):
```tsx
  const crearAfiche = async () => {
    if (!user) return;
    try {
      let p = perfil;
      if (!p) {
        p = await getMyProfile(user.id);
        setPerfil(p);
      }
      if (faltaWhatsapp(p)) {
        notify('Agregá tu WhatsApp', 'Cargá tu WhatsApp en tu perfil para que puedan contactarte desde el afiche.');
        navigation.navigate('Perfil');
        return;
      }
      setGenerandoAfiche(true);
    } catch (e: any) {
      notify('Error', e?.message ?? 'No se pudo preparar el afiche.');
    }
  };
```

Agregar el botón dentro del `ScrollView`, justo después del botón "Compartir" (`shareButton`) y solo si es del dueño:
```tsx
        {esMio && (
          <Button
            title="Crear afiche"
            variant="secondary"
            icon="print"
            loading={generandoAfiche}
            onPress={crearAfiche}
            style={styles.shareButton}
          />
        )}
```

Agregar el generador (fuera de pantalla) al final del `ScrollView`, justo antes de cerrar `</ScrollView>`, montado solo mientras se genera:
```tsx
        {generandoAfiche && perfil && (
          <AficheGenerator
            pet={pet}
            profile={perfil}
            onDone={() => setGenerandoAfiche(false)}
            onError={(m) => {
              setGenerandoAfiche(false);
              notify('Error', m);
            }}
          />
        )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS — los 58 tests previos + los nuevos de `afiche` y `qr`.

- [ ] **Step 5: Manual verification (web)**

1. `npx expo start --web` → abrir `http://localhost:8091`, iniciar sesión con `probando779@gmail.com` / `probar123456`.
2. Asegurarse de que el perfil de prueba tenga WhatsApp cargado (si no, el botón debe derivar a Perfil — verificar ese camino también).
3. Abrir **un reporte propio** → ver el botón **"Crear afiche"** (no debe aparecer en reportes ajenos).
4. Tocar "Crear afiche" → se descarga un PNG.
5. Abrir el PNG: verificar titular correcto, foto, nombre/especie/raza, señas, recompensa (si hay), número de WhatsApp y QR.
6. Escanear el QR: con la web desplegada abre el reporte correcto; en `localhost` apunta a localhost (esperado — documentado en el spec).

- [ ] **Step 6: Commit**

```bash
git add src/components/AficheGenerator.tsx src/screens/PetDetailScreen.tsx
git commit -m "feat(afiche): boton 'Crear afiche' en el detalle (solo dueno) + generacion"
```

---

## Self-Review (completado al escribir el plan)

- **Cobertura del spec:** botón solo-dueño (Task 5) ✓; guardia de WhatsApp (Task 5) ✓; contenido del afiche —titular/foto/nombre/subtítulo/señas/recompensa/zona/QR/WhatsApp/marca (Task 3) ✓; QR local (Task 2) ✓; rasterizado PNG + entrega web/nativo (Task 4) ✓; mitigación de canvas "tainted" (Task 4, `fotoParaCaptura`) ✓; límite del QR en dev (verificación manual Task 5 + spec) ✓; tests puros (Tasks 1 y 2) ✓; criterios de aceptación cubiertos por Tasks 1–5.
- **Placeholders:** ninguno; todo el código está escrito.
- **Consistencia de tipos:** `AficheContent` (Task 1) se consume igual en `AfichePoster` (Task 3) y `AficheGenerator` (Task 5); `armarAfiche`, `armarNombreArchivo`, `faltaWhatsapp`, `fotoParaCaptura`, `capturarAfiche`, `entregarAfiche`, `qrMatrix` con firmas idénticas donde se declaran y se usan.

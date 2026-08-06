# "Difundir en redes" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Un botón "Difundir en redes" en el reporte propio que arma el texto listo para pegar,
comparte la tarjeta, y sugiere los grupos de Facebook/WhatsApp donde publicarlo.

**Architecture:** Lib pura (`difusionRedes.ts`) + data file curado (`gruposDifusion.ts`) +
componente (`DifundirEnRedes.tsx`) + cableado en PetDetailScreen. Sin migración, sin red nueva.

**Tech Stack:** React Native + react-native-web, TypeScript, jest-expo, expo Clipboard/Linking.

## Global Constraints
- Tono humano, sin gamificar, sin afirmar identidad, sin culpar.
- NUNCA el monto de recompensa (solo "Hay recompensa" vía `tieneRecompensa`); nunca el teléfono.
- Nada de `new Date()` en libs puras — valores por parámetro.
- `.select()` con columnas explícitas (no aplica: sin base).
- Guardas de forma comprobadas contra mutación; verificación final contra el dist compilado.
- Links de grupos: solo URLs verificadas a mano; un link muerto frustra al que más lo necesita.

---

### Task 1: `gruposDifusion.ts` — data file + selector

**Files:**
- Create: `src/data/gruposDifusion.ts`
- Test: `__tests__/data/gruposDifusion.test.ts`

**Interfaces:**
- Produces: `type GrupoDifusion = { nombre: string; url: string; red: 'facebook' | 'whatsapp'; alcance: 'nacional' | string }`;
  `GRUPOS: GrupoDifusion[]`; `gruposSugeridos(comuna: string | null): GrupoDifusion[]`.

- [ ] **Step 1: Failing test**

```ts
import { GRUPOS, gruposSugeridos } from '../../src/data/gruposDifusion';

describe('gruposDifusion', () => {
  it('todos los grupos tienen forma válida (link real, nombre, red)', () => {
    expect(GRUPOS.length).toBeGreaterThan(0);
    for (const g of GRUPOS) {
      expect(g.url).toMatch(/^https:\/\//);
      expect(g.nombre.trim().length).toBeGreaterThan(0);
      expect(['facebook', 'whatsapp']).toContain(g.red);
    }
  });

  it('los de la comuna van primero, después los nacionales', () => {
    const sugeridos = gruposSugeridos('nacional-inexistente');
    expect(sugeridos.every((g) => g.alcance === 'nacional')).toBe(true);
    expect(sugeridos.length).toBe(GRUPOS.filter((g) => g.alcance === 'nacional').length);
  });

  it('sin comuna devuelve solo los nacionales', () => {
    expect(gruposSugeridos(null).every((g) => g.alcance === 'nacional')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx jest __tests__/data/gruposDifusion.test.ts` → módulo no existe.

- [ ] **Step 3: Implement** (URLs reales verificadas en la búsqueda del 6-ago)

```ts
// Grupos públicos grandes de mascotas perdidas en Chile. Es donde se mueven los
// casos de verdad (búsqueda 6-ago), y llevar ahí nuestros reportes ataca el
// arranque en frío. ⚠️ Cada link se verifica A MANO antes de sumarlo: un grupo
// muerto frustra a quien más lo necesita. Nada de scraping ni auto-descubrimiento.
export type GrupoDifusion = {
  nombre: string;
  url: string;
  red: 'facebook' | 'whatsapp';
  alcance: 'nacional' | string; // 'nacional' o el nombre de comuna
};

export const GRUPOS: GrupoDifusion[] = [
  { nombre: 'SOLO MASCOTAS PERDIDAS O ENCONTRADAS (Chile)', url: 'https://www.facebook.com/groups/195675330629289', red: 'facebook', alcance: 'nacional' },
  { nombre: 'Animales Perdidos/Encontrados Chile', url: 'https://www.facebook.com/groups/185121065481026', red: 'facebook', alcance: 'nacional' },
  { nombre: 'Perros Perdidos Santiago - Chile', url: 'https://www.facebook.com/groups/557979667691631', red: 'facebook', alcance: 'nacional' },
  { nombre: 'Chile SOSAFE Mascotas Perdidas', url: 'https://www.facebook.com/groups/403011684354362', red: 'facebook', alcance: 'nacional' },
];

// Los de la comuna primero, después los nacionales. Orden estable dentro de cada
// grupo (el del data file). Sin comuna, solo nacionales.
export function gruposSugeridos(comuna: string | null): GrupoDifusion[] {
  const deComuna = comuna ? GRUPOS.filter((g) => g.alcance === comuna) : [];
  const nacionales = GRUPOS.filter((g) => g.alcance === 'nacional');
  return [...deComuna, ...nacionales];
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(t15): data file de grupos de difusión + selector por comuna`

---

### Task 2: `difusionRedes.ts` — texto listo para pegar

**Files:**
- Create: `src/lib/difusionRedes.ts`
- Test: `__tests__/lib/difusionRedes.test.ts`

**Interfaces:**
- Consumes: `tieneRecompensa` de `src/lib/recompensa.ts`.
- Produces: `armarTextoDifusion(pet: DatosDifusion, url: string): string` donde
  `type DatosDifusion = { nombre?: string | null; especie: string; estado: string; comuna?: string | null; descripcion?: string | null; recompensa?: string | null }`.

- [ ] **Step 1: Failing test**

```ts
import { armarTextoDifusion } from '../../src/lib/difusionRedes';

const base = { especie: 'perro', estado: 'perdida', comuna: 'Ñuñoa',
  nombre: 'Pelusa', descripcion: 'café, collar rojo', recompensa: 'sí' };
const URL = 'https://encuentras-mascota.pages.dev/mascota/abc';

describe('armarTextoDifusion', () => {
  it('incluye nombre, comuna, señas y el link', () => {
    const t = armarTextoDifusion(base, URL);
    expect(t).toContain('Pelusa');
    expect(t).toContain('Ñuñoa');
    expect(t).toContain('café, collar rojo');
    expect(t).toContain(URL);
  });

  it('dice "Hay recompensa" pero NUNCA un monto', () => {
    const t = armarTextoDifusion({ ...base, recompensa: '$50.000' }, URL);
    expect(t).toMatch(/recompensa/i);
    expect(t).not.toContain('50.000');
    expect(t).not.toContain('$');
  });

  it('sin recompensa no la menciona', () => {
    expect(armarTextoDifusion({ ...base, recompensa: null }, URL)).not.toMatch(/recompensa/i);
  });

  it('nunca afirma identidad ni incluye teléfono', () => {
    const t = armarTextoDifusion(base, URL);
    expect(t).not.toMatch(/\+?56\s?9|tel[eé]fono|whatsapp/i);
  });

  it('degrada sin nombre ni comuna sin romper', () => {
    const t = armarTextoDifusion({ especie: 'gato', estado: 'perdida' }, URL);
    expect(t).toContain(URL);
    expect(t).toMatch(/gato/i);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```ts
import { tieneRecompensa } from './recompensa';

// Texto plano listo para pegar en un grupo de Facebook/WhatsApp. Plano a
// propósito: esos grupos no renderizan markdown. NUNCA el monto de recompensa
// (imán de estafas — lib/recompensa.ts) ni el teléfono (privacidad: el contacto
// va por la ficha, con sesión). Sin `new Date()`: no depende del reloj.
export type DatosDifusion = {
  nombre?: string | null;
  especie: string;
  estado: string;
  comuna?: string | null;
  descripcion?: string | null;
  recompensa?: string | null;
};

export function armarTextoDifusion(pet: DatosDifusion, url: string): string {
  const quien = pet.nombre?.trim() ? pet.nombre.trim() : pet.especie;
  const donde = pet.comuna?.trim() ? ` en ${pet.comuna.trim()}` : '';
  const titulo = pet.estado === 'encontrada'
    ? `🐾 Encontré un ${pet.especie}${donde}. ¿Es tuyo o sabés de quién es?`
    : `🚨 Se perdió ${quien}${donde}. Ayudame a encontrarlo.`;
  const senas = pet.descripcion?.trim() ? `\n${pet.descripcion.trim()}` : '';
  const recompensa = tieneRecompensa(pet.recompensa) ? '\nHay recompensa.' : '';
  const cierre = '\n\nMirá la ficha y avisá acá (no hace falta crear cuenta):';
  return `${titulo}${senas}${recompensa}${cierre}\n${url}`;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(t15): armarTextoDifusion — texto listo para pegar, sin monto ni teléfono`

---

### Task 3: `DifundirEnRedes.tsx` — la hoja + cableado en la ficha

**Files:**
- Create: `src/components/DifundirEnRedes.tsx`
- Modify: `src/screens/PetDetailScreen.tsx` (botón "Difundir en redes" junto a "Compartir", `esMio`)
- Test: `__tests__/components/difundirEnRedes.test.tsx` (forma: el componente arma el texto y lista grupos)

**Interfaces:**
- Consumes: `armarTextoDifusion` (Task 2), `gruposSugeridos` (Task 1), `petUrl` de `src/lib/links.ts`,
  `TarjetaGenerador` existente, `Clipboard`/`Linking` de expo.
- Produces: `export default function DifundirEnRedes({ pet, visible, onClose }: Props)`.

- [ ] **Step 1: Failing test** (forma, leyendo el fuente — patrón de vectorFoto.test.ts)

```ts
const fuente = () => require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'src', 'components', 'DifundirEnRedes.tsx'), 'utf8');

it('usa armarTextoDifusion y gruposSugeridos, no reinventa', () => {
  expect(fuente()).toMatch(/armarTextoDifusion/);
  expect(fuente()).toMatch(/gruposSugeridos/);
});
it('abre los grupos con Linking.openURL, no navega adentro', () => {
  expect(fuente()).toMatch(/Linking\.openURL/);
});
it('copia con Clipboard', () => {
  expect(fuente()).toMatch(/Clipboard/);
});

const pantalla = () => require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'src', 'screens', 'PetDetailScreen.tsx'), 'utf8');
it('la ficha propia ofrece Difundir en redes', () => {
  expect(pantalla()).toMatch(/DifundirEnRedes/);
  expect(pantalla()).toMatch(/Difundir en redes/);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** el componente siguiendo el patrón de las hojas existentes
  (Card + Screen/overlay como `TableroDifusion`/afiche). Estructura mínima:
  - `const texto = armarTextoDifusion({ nombre: pet.nombre, especie: pet.especie, estado: pet.estado, comuna: pet.comuna, descripcion: pet.descripcion, recompensa: pet.recompensa }, petUrl(pet.id) ?? '')`
  - Botón **Copiar** → `Clipboard.setStringAsync(texto)` + `notify('Copiado', …)`.
  - Botón **Compartir** → Web Share si hay `navigator.share`, si no, copiar (reusar el patrón de
    `compartirTarjeta` si aplica, o `Linking`/clipboard).
  - Botón **Compartir la tarjeta** → monta `TarjetaGenerador` off-screen (mismo patrón que la ficha).
  - `gruposSugeridos(pet.comuna).map(...)` → fila con nombre + "Abrir grupo" (`Linking.openURL(g.url)`).
  - Línea honesta: "Pegá el texto en el grupo; la foto va aparte con el botón de arriba."
  - `useColors()` + `crearEstilos(colors)` (patrón dinámico del repo).
  En PetDetailScreen: estado `mostrarDifundir`, botón junto a "Compartir" (solo `esMio`), y montar
  `<DifundirEnRedes pet={pet} visible={mostrarDifundir} onClose={() => setMostrarDifundir(false)} />`.

- [ ] **Step 4: Run tests + `npx tsc --noEmit`.**
- [ ] **Step 5: Commit** — `feat(t15): hoja Difundir en redes cableada en la ficha propia`

---

### Task 4: Verificación E2E + cierre

- [ ] **Step 1:** `npx jest` completo, confirmar `PIPESTATUS=0` y conteo.
- [ ] **Step 2:** `npx expo export --platform web`.
- [ ] **Step 3:** E2E Playwright contra el dist (servidor estático o `wrangler@3`): publicar/abrir
      un reporte propio, abrir "Difundir en redes", confirmar que el texto tiene el link y NO un
      monto, que los grupos listan con "Abrir grupo", y 0 errores JS. Limpiar datos de prueba.
- [ ] **Step 4:** Actualizar `ESTADO.md` (nota de brecha: 3/4 áreas ya estaban; T15 = puente FB/WA)
      y memoria. Commit + push.

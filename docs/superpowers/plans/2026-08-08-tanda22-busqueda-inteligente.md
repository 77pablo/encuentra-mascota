# Tanda 22 — Búsqueda inteligente (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los tres huecos reales del spec: refugios/caniles curados a mano en `lugares`, recordatorio del Registro del chip del lado del dueño, y el paso de la trampera en el plan felino.

**Architecture:** Cero migraciones. Pieza 1 = dataset JSON curado en el repo + script de semilla hermano de `semilla-lugares.js` (upsert a la tabla `lugares` existente, que ya admite `categoria='refugio'` y cuyo tablero ya la rotula). Pieza 2 = lib pura + componente chico montado bajo el campo de chip de las DOS pantallas que lo tienen. Pieza 3 = un paso nuevo en `PASOS_PLAN`.

**Tech Stack:** El del repo: Expo/RN-web + TS, jest, scripts node CJS, PostgREST con service_role para semillas.

## Global Constraints

- **Cero migraciones en esta tanda** (spec). La tabla `lugares` (0063) NO se toca: `osm_id` es **bigint** → los ids curados son enteros positivos estables; `fuente` NO viaja a la base (no hay columna): queda en el JSON para auditoría; no existe columna de teléfono (deuda consciente del spec).
- **Regla dura del dataset**: sin `fuente` https verificable, la entrada no entra.
- Tono del repo en todo texto visible: voseo, sin promesas ("seguro lo encontrás" prohibido), sin alarmismo.
- El número de chip NUNCA se muestra, valida contra la red, ni viaja a ningún lado nuevo (el oráculo sigue cerrado).
- Ids existentes de `PASOS_PLAN` y `GUIA_*`: NO se tocan (hay tests que los referencian).
- Cada commit con suite verde: `npx tsc --noEmit` 0 errores y jest exit 0 real.

---

### Task 1: Semilla de refugios — validador, normalizador y script

**Files:**
- Create: `scripts/semilla-refugios.js`
- Create: `data/refugios-curados.json` (esqueleto vacío en esta task; los datos reales son la Task 2)
- Test: `__tests__/lib/semillaRefugios.test.js`

**Interfaces:**
- Consumes: tabla `lugares` de la 0063 (columnas exactas: `osm_tipo text`, `osm_id bigint`, `nombre`, `categoria`, `lat`, `lng`, `direccion?`, `comuna?`; unique `(osm_tipo, osm_id)`).
- Produces: `validarRefugio(r) -> string|null` (motivo de rechazo o null), `aFilas(refugios) -> fila[]` (lanza con TODOS los motivos si algo no valida), `module.exports = { validarRefugio, aFilas }`. La Task 2 depende de que `aFilas` valide el JSON real.

- [ ] **Step 1: Escribir los tests que fallan**

`__tests__/lib/semillaRefugios.test.js`:

```js
const { validarRefugio, aFilas } = require('../../scripts/semilla-refugios');

const valido = {
  id: 1,
  nombre: 'Canil Municipal de Temuco',
  comuna: 'Temuco',
  region: 'Araucanía',
  direccion: 'Av. Los Poetas 01100',
  lat: -38.7359,
  lng: -72.5904,
  fuente: 'https://www.temuco.cl/canil',
};

describe('validarRefugio', () => {
  it('acepta una entrada completa', () => {
    expect(validarRefugio(valido)).toBeNull();
  });
  it('rechaza sin fuente https (la regla dura del spec)', () => {
    expect(validarRefugio({ ...valido, fuente: undefined })).toMatch(/fuente/);
    expect(validarRefugio({ ...valido, fuente: 'http://temuco.cl' })).toMatch(/fuente/);
  });
  it('rechaza coordenadas fuera de Chile', () => {
    expect(validarRefugio({ ...valido, lat: 40.4 })).toMatch(/lat/);
    expect(validarRefugio({ ...valido, lng: -3.7 })).toMatch(/lng/);
  });
  it('rechaza id no entero positivo (osm_id es bigint en la 0063)', () => {
    expect(validarRefugio({ ...valido, id: 'canil-temuco' })).toMatch(/id/);
    expect(validarRefugio({ ...valido, id: 0 })).toMatch(/id/);
  });
  it('rechaza nombre, comuna o region vacíos', () => {
    expect(validarRefugio({ ...valido, nombre: '  ' })).toMatch(/nombre/);
    expect(validarRefugio({ ...valido, comuna: '' })).toMatch(/comuna/);
    expect(validarRefugio({ ...valido, region: '' })).toMatch(/region/);
  });
});

describe('aFilas', () => {
  it('mapea a la forma EXACTA de lugares (sin fuente, sin region, sin nada de más)', () => {
    const filas = aFilas([valido]);
    expect(filas).toHaveLength(1);
    // Igualdad de CONJUNTO de claves (lección D2-t13): ni una columna de más
    // —fuente y region NO viajan a la base— ni una de menos.
    expect(Object.keys(filas[0]).sort()).toEqual(
      ['categoria', 'comuna', 'direccion', 'lat', 'lng', 'nombre', 'osm_id', 'osm_tipo'].sort(),
    );
    expect(filas[0].osm_tipo).toBe('curado');
    expect(filas[0].osm_id).toBe(1);
    expect(filas[0].categoria).toBe('refugio');
  });
  it('direccion vacía degrada a null (como semilla-lugares)', () => {
    expect(aFilas([{ ...valido, direccion: '  ' }])[0].direccion).toBeNull();
  });
  it('lanza con TODOS los motivos si algo no valida (no solo el primero)', () => {
    expect(() => aFilas([{ ...valido, fuente: 'x' }, { ...valido, id: 2, lat: 12 }]))
      .toThrow(/entrada 0[\s\S]*entrada 1/);
  });
  it('lanza ante ids repetidos (el id es la identidad del upsert)', () => {
    expect(() => aFilas([valido, { ...valido }])).toThrow(/repetido/);
  });
});

describe('el dataset real del repo', () => {
  it('valida entero y no está vacío', () => {
    const { refugios } = require('../../data/refugios-curados.json');
    // La Task 2 lo puebla; este test la vigila: >= 1 ya en la task 1 (esqueleto
    // con la primera entrada verificada) y la Task 2 lo sube a >= 10.
    expect(aFilas(refugios).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx jest __tests__/lib/semillaRefugios.test.js 2>&1 | tail -5`
Expected: FAIL — `Cannot find module '../../scripts/semilla-refugios'`.

- [ ] **Step 3: Implementar el script**

`scripts/semilla-refugios.js`:

```js
#!/usr/bin/env node
// SEMILLA DE REFUGIOS Y CANILES — pobla `lugares` (0063) desde
// data/refugios-curados.json. A diferencia de semilla-lugares.js NO consulta
// Overpass: OSM no mapea animal_shelter en Chile de forma util (la semilla del
// 5-ago trajo 301 veterinarias y CERO refugios en toda la RM), asi que el dato
// se cura A MANO y cada entrada lleva su fuente verificable en el JSON.
//
// La tabla no tiene columna `fuente` ni `region`: quedan en el repo para
// auditoria y organizacion, y NO viajan a la base (hay un test de igualdad de
// claves que lo vigila). `osm_tipo='curado'` + id entero estable reusan la
// unique (osm_tipo, osm_id): re-correr ACTUALIZA en vez de duplicar. Un id no
// se recicla jamas: si un refugio cierra, su entrada se borra y su numero se
// retira con el.
//
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/semilla-refugios.js

const LAT_CHILE = [-56, -17];
const LNG_CHILE = [-76, -66];

function validarRefugio(r) {
  if (!r) return 'entrada nula';
  if (!Number.isInteger(r.id) || r.id <= 0) return 'id debe ser un entero positivo estable';
  if (!(r.nombre || '').trim()) return 'nombre vacio';
  if (!(r.comuna || '').trim()) return 'comuna vacia';
  if (!(r.region || '').trim()) return 'region vacia';
  if (typeof r.lat !== 'number' || r.lat < LAT_CHILE[0] || r.lat > LAT_CHILE[1]) return 'lat fuera de Chile';
  if (typeof r.lng !== 'number' || r.lng < LNG_CHILE[0] || r.lng > LNG_CHILE[1]) return 'lng fuera de Chile';
  if (!/^https:\/\/.+/.test(r.fuente || '')) return 'fuente debe ser una URL https verificable';
  return null;
}

function aFilas(refugios) {
  const errores = [];
  const ids = new Set();
  refugios.forEach((r, i) => {
    const motivo = validarRefugio(r);
    if (motivo) errores.push(`entrada ${i}: ${motivo}`);
    else if (ids.has(r.id)) errores.push(`entrada ${i}: id ${r.id} repetido`);
    else ids.add(r.id);
  });
  if (errores.length) throw new Error('Dataset invalido:\n' + errores.join('\n'));
  return refugios.map((r) => ({
    osm_tipo: 'curado',
    osm_id: r.id,
    nombre: r.nombre.trim(),
    categoria: 'refugio',
    lat: r.lat,
    lng: r.lng,
    direccion: (r.direccion || '').trim() || null,
    comuna: r.comuna.trim(),
  }));
}

async function main() {
  const { refugios } = require('../data/refugios-curados.json');
  const filas = aFilas(refugios);
  console.log(`${filas.length} refugios/caniles curados con fuente`);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');

  // Mismo canal que semilla-lugares.js: merge-duplicates + la unique
  // (osm_tipo, osm_id) hacen que re-correr ACTUALICE en vez de duplicar.
  const up = await fetch(`${url}/rest/v1/lugares?on_conflict=osm_tipo,osm_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(filas.map((f) => ({ ...f, actualizado_en: new Date().toISOString() }))),
  });
  if (!up.ok) throw new Error(`Supabase respondió ${up.status}: ${await up.text()}`);
  console.log('Semilla aplicada.');
}

module.exports = { validarRefugio, aFilas };

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
```

`data/refugios-curados.json` (esqueleto con UNA entrada real ya verificada — la
que uses de fixture: buscá el canil o refugio municipal de Temuco con WebSearch,
confirmá nombre/dirección/fuente y geocodificá a mano las coordenadas):

```json
{
  "comentario": "Refugios y caniles curados a mano (tanda 22). Regla dura: sin fuente https verificable, la entrada NO entra. Los ids son estables y no se reciclan. fuente y region no viajan a la base.",
  "refugios": [
    {
      "id": 1,
      "nombre": "<nombre real verificado>",
      "comuna": "Temuco",
      "region": "Araucanía",
      "direccion": "<dirección real o null>",
      "lat": -38.7,
      "lng": -72.6,
      "fuente": "https://<página municipal u oficial que lo nombra>"
    }
  ]
}
```

⚠️ El fixture `valido` del test y esta entrada NO tienen que ser el mismo lugar;
el test del dataset real solo exige que valide y no esté vacío.

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx jest __tests__/lib/semillaRefugios.test.js 2>&1 | tail -5`
Expected: PASS (todos los describe).

- [ ] **Step 5: Suite y commit**

Run: `npx tsc --noEmit && npx jest 2>&1 | tail -3`
Expected: tsc silencioso; jest exit 0.

```bash
git add scripts/semilla-refugios.js data/refugios-curados.json __tests__/lib/semillaRefugios.test.js
git commit -m "t22: semilla de refugios curados (validador + script, sin Overpass)"
```

---

### Task 2: El dataset — recolectar refugios y caniles con fuente (Araucanía + RM)

**Files:**
- Modify: `data/refugios-curados.json`
- Modify: `__tests__/lib/semillaRefugios.test.js` (subir el umbral del dataset real)

**Interfaces:**
- Consumes: `aFilas` de la Task 1 (el validador es el árbitro de qué entra).
- Produces: el JSON con ≥10 entradas válidas; es lo que la corrida de despliegue siembra.

- [ ] **Step 1: Investigar con búsqueda web**

Procedimiento por comuna (empezar: Temuco, Padre Las Casas, y las comunas grandes
de la RM — Santiago, Puente Alto, Maipú, La Florida, Las Condes, San Bernardo…):

1. Buscar `"canil municipal" <comuna>`, `"centro de rescate" municipal <comuna>`,
   `refugio animales <comuna> municipalidad`.
2. Una entrada ENTRA solo si hay página municipal u oficial de la organización
   que la nombre (esa URL es `fuente`). Notas de prensa solas NO alcanzan
   (cierran y se mudan); si solo hay prensa, se descarta.
3. `lat`/`lng`: geocodificar la dirección a mano (OSM/Nominatim en el navegador
   de búsqueda) y anotar con 4 decimales.
4. Ids secuenciales desde el último usado. No reciclar jamás.

Criterio de corte: ≥10 entradas válidas total, con al menos 2 de la Araucanía.
Si una comuna grande no tiene canil verificable, se anota en el comentario del
JSON (es un dato real: muchas comunas NO tienen).

- [ ] **Step 2: Subir el umbral del test del dataset real**

En `__tests__/lib/semillaRefugios.test.js`, el test del dataset queda:

```js
  it('valida entero y cubre el alcance del spec', () => {
    const { refugios } = require('../../data/refugios-curados.json');
    const filas = aFilas(refugios);
    expect(filas.length).toBeGreaterThanOrEqual(10);
    const regiones = new Set(refugios.map((r) => r.region));
    expect(regiones.has('Araucanía')).toBe(true);
    expect(regiones.has('Metropolitana')).toBe(true);
  });
```

- [ ] **Step 3: Correr y ver pasar**

Run: `npx jest __tests__/lib/semillaRefugios.test.js 2>&1 | tail -5`
Expected: PASS con el JSON real.

- [ ] **Step 4: Commit**

```bash
git add data/refugios-curados.json __tests__/lib/semillaRefugios.test.js
git commit -m "t22: dataset curado de refugios y caniles (Araucania + RM, todos con fuente)"
```

---

### Task 3: Recordatorio del Registro del chip (lado del dueño)

**Files:**
- Create: `src/lib/recordatorioRegistro.ts`
- Create: `src/components/RecordatorioRegistroChip.tsx`
- Modify: `src/screens/PublishScreen.tsx` (tras el `<Input>` del chip, ~línea 781)
- Modify: `src/screens/EditPetScreen.tsx` (tras el ternario del chip, ~línea 333)
- Test: `__tests__/lib/recordatorioRegistro.test.ts`, `__tests__/components/recordatorioRegistroChip.test.tsx`

**Interfaces:**
- Consumes: ruta `Microchip` del stack raíz (ya montada; la usa `GuiaEncontrada`); `AppText`/`Button` de `src/ui`; estado `chip: string` de cada pantalla.
- Produces: `debeMostrarRecordatorioRegistro(chip: string): boolean`, `TEXTO_RECORDATORIO_REGISTRO: string`, `LABEL_RECORDATORIO_REGISTRO: string`, componente `<RecordatorioRegistroChip chip={string} />`.

- [ ] **Step 1: Test de la lib (falla)**

`__tests__/lib/recordatorioRegistro.test.ts`:

```ts
import {
  debeMostrarRecordatorioRegistro,
  TEXTO_RECORDATORIO_REGISTRO,
  LABEL_RECORDATORIO_REGISTRO,
} from '../../src/lib/recordatorioRegistro';

describe('debeMostrarRecordatorioRegistro', () => {
  it('solo con contenido real en la casilla', () => {
    expect(debeMostrarRecordatorioRegistro('')).toBe(false);
    expect(debeMostrarRecordatorioRegistro('   ')).toBe(false);
    expect(debeMostrarRecordatorioRegistro('985112003456789')).toBe(true);
    expect(debeMostrarRecordatorioRegistro('AVID123456')).toBe(true);
  });
});

describe('el texto', () => {
  it('dice lo que importa sin alarmar ni prometer', () => {
    expect(TEXTO_RECORDATORIO_REGISTRO).toMatch(/Registro/);
    expect(TEXTO_RECORDATORIO_REGISTRO).toMatch(/al día/);
    // Guardas de tono del repo:
    expect(TEXTO_RECORDATORIO_REGISTRO).not.toMatch(/seguro/i);
    expect(TEXTO_RECORDATORIO_REGISTRO).not.toMatch(/¡/);
    expect(LABEL_RECORDATORIO_REGISTRO.length).toBeLessThan(30);
    // El número de chip no se menciona como algo que haya que mandar a nadie:
    expect(TEXTO_RECORDATORIO_REGISTRO).not.toMatch(/envi|manda/i);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx jest __tests__/lib/recordatorioRegistro.test.ts 2>&1 | tail -3`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: La lib**

`src/lib/recordatorioRegistro.ts`:

```ts
// Recordatorio del REGISTRO del chip, del lado del DUEÑO (tanda 22).
//
// Por qué: el chip duplica los reencuentros en perros y los multiplica ×24 en
// gatos (números en data/registrosChip.ts), pero el chip NO llama a nadie: el
// que llama es el REGISTRO, y un registro con teléfono viejo anula todo. El
// vecino que encuentra ya tiene su pantalla (Microchip); esto es el espejo
// para quien declara un chip al publicar o editar su reporte.
//
// Regla heredada: el número de chip no se muestra, no se valida contra la red
// y no viaja a ningún lado nuevo. Esto es SOLO texto con un link interno.

export function debeMostrarRecordatorioRegistro(chip: string): boolean {
  return chip.trim().length > 0;
}

export const TEXTO_RECORDATORIO_REGISTRO =
  '¿Los datos del chip están al día en el Registro? Un chip con teléfono viejo ' +
  'no le avisa a nadie. Si te mudaste o cambiaste de número, actualizalo: toma minutos.';

export const LABEL_RECORDATORIO_REGISTRO = 'Ver dónde revisarlo';
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx jest __tests__/lib/recordatorioRegistro.test.ts 2>&1 | tail -3`
Expected: PASS.

- [ ] **Step 5: Test del componente (falla)**

`__tests__/components/recordatorioRegistroChip.test.tsx` (mismo patrón de mock de
navegación que los tests de pantalla existentes):

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RecordatorioRegistroChip } from '../../src/components/RecordatorioRegistroChip';

const navigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate }),
}));

describe('RecordatorioRegistroChip', () => {
  beforeEach(() => navigate.mockClear());

  it('sin chip escrito no dibuja nada', () => {
    const { toJSON } = render(<RecordatorioRegistroChip chip="  " />);
    expect(toJSON()).toBeNull();
  });

  it('con chip escrito muestra el texto y navega a Microchip', () => {
    const { getByText } = render(<RecordatorioRegistroChip chip="985112003456789" />);
    expect(getByText(/al día en el Registro/)).toBeTruthy();
    fireEvent.press(getByText('Ver dónde revisarlo'));
    expect(navigate).toHaveBeenCalledWith('Microchip');
  });
});
```

- [ ] **Step 6: El componente**

`src/components/RecordatorioRegistroChip.tsx`:

```tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppText, Button } from '../ui';
import { spacing } from '../theme';
import {
  debeMostrarRecordatorioRegistro,
  LABEL_RECORDATORIO_REGISTRO,
  TEXTO_RECORDATORIO_REGISTRO,
} from '../lib/recordatorioRegistro';

// Aparece SOLO cuando la casilla del chip tiene contenido: quien no tiene chip
// no necesita el sermón del registro. Vive como componente porque lo montan
// DOS pantallas (Publicar y Editar) y el texto tiene guardas de tono en tests.
export function RecordatorioRegistroChip({ chip }: { chip: string }) {
  const navigation = useNavigation<any>();
  if (!debeMostrarRecordatorioRegistro(chip)) return null;
  return (
    <>
      <AppText muted size={12} style={styles.texto}>
        {TEXTO_RECORDATORIO_REGISTRO}
      </AppText>
      <Button
        title={LABEL_RECORDATORIO_REGISTRO}
        variant="ghost"
        icon="open-outline"
        onPress={() => navigation.navigate('Microchip')}
        style={styles.boton}
      />
    </>
  );
}

const styles = StyleSheet.create({
  texto: { marginTop: spacing.xs },
  boton: { alignSelf: 'flex-start' },
});
```

- [ ] **Step 7: Correr y ver pasar**

Run: `npx jest __tests__/components/recordatorioRegistroChip.test.tsx 2>&1 | tail -3`
Expected: PASS.

- [ ] **Step 8: Cablear las dos pantallas + guardián**

En `src/screens/PublishScreen.tsx`, inmediatamente después del `</Input>` del chip
(el `<Input placeholder="Ej: 985112003456789" ...>` que cierra en ~781, ANTES de
los carteles de `precargaChip`):

```tsx
            <RecordatorioRegistroChip chip={chip} />
```

En `src/screens/EditPetScreen.tsx`, después del ternario `{chipLeido === false ? (...) : (<Input .../>)}` (~línea 333):

```tsx
          {chipLeido === false ? null : <RecordatorioRegistroChip chip={chip} />}
```

(en la rama `chipLeido === false` la casilla ni se dibuja: el recordatorio tampoco).

Ambos con su import: `import { RecordatorioRegistroChip } from '../components/RecordatorioRegistroChip';`

Guardián de cableado (lección I1-D de la t14: proteger el CABLEADO, no solo el
helper) — agregar al final de `__tests__/components/recordatorioRegistroChip.test.tsx`:

```tsx
describe('cableado en las pantallas', () => {
  const fs = require('fs');
  it.each(['src/screens/PublishScreen.tsx', 'src/screens/EditPetScreen.tsx'])(
    '%s monta el recordatorio con el estado del chip',
    (ruta) => {
      const fuente = fs.readFileSync(ruta, 'utf8');
      expect(fuente).toMatch(/<RecordatorioRegistroChip chip=\{chip\}/);
    },
  );
});
```

- [ ] **Step 9: Suite entera y commit**

Run: `npx tsc --noEmit && npx jest 2>&1 | tail -3`
Expected: tsc 0, jest exit 0 (las suites de PublishScreen/EditPetScreen existentes
no deben romperse: el componente devuelve null con la casilla vacía, que es el
estado inicial de ambas).

```bash
git add src/lib/recordatorioRegistro.ts src/components/RecordatorioRegistroChip.tsx src/screens/PublishScreen.tsx src/screens/EditPetScreen.tsx __tests__/lib/recordatorioRegistro.test.ts __tests__/components/recordatorioRegistroChip.test.tsx
git commit -m "t22: recordatorio del Registro del chip al publicar/editar (lado del dueno)"
```

---

### Task 4: La trampera del plan felino

**Files:**
- Modify: `src/lib/planBusqueda.ts` (agregar UN paso a `PASOS_PLAN`, sección `dia5`)
- Test: la suite existente de `planBusqueda` (localizarla con `npx jest --listTests | grep -i planBusqueda`); agregar los casos ahí.

**Interfaces:**
- Consumes: `PASOS_PLAN`, `planDeBusqueda(perfil, desde, ahora)` — sin cambio de firma.
- Produces: paso nuevo id `'gato-trampera-prestada'` (ventana `dia5`, `especies: ['gato']`). Ningún id existente cambia.

- [ ] **Step 1: Test que falla**

En la suite existente de planBusqueda, agregar:

```ts
describe('la trampera (tanda 22)', () => {
  const ahora = new Date('2026-08-08T12:00:00Z');
  const hace6dias = new Date('2026-08-02T12:00:00Z');

  function idsDeVentana(especie: 'perro' | 'gato', ventana: string) {
    const plan = planDeBusqueda({ especie }, hace6dias, ahora);
    return plan.ventanas.find((v) => v.id === ventana)!.pasos.map((p) => p.id);
  }

  it('aparece para gatos en dia5', () => {
    expect(idsDeVentana('gato', 'dia5')).toContain('gato-trampera-prestada');
  });
  it('no aparece para perros', () => {
    expect(idsDeVentana('perro', 'dia5')).not.toContain('gato-trampera-prestada');
  });
  it('no promete y no manda a comprar nada', () => {
    const paso = PASOS_PLAN.find((p) => p.id === 'gato-trampera-prestada')!;
    expect(paso.detalle).toMatch(/prestan/);
    expect(paso.detalle).not.toMatch(/comprá|compra/i);
    expect(paso.detalle).not.toMatch(/seguro/i);
  });
});
```

(importar `PASOS_PLAN` si la suite no lo importa ya).

- [ ] **Step 2: Correr y ver fallar**

Run: `npx jest <suite de planBusqueda> 2>&1 | tail -5`
Expected: FAIL — el id no existe.

- [ ] **Step 3: El paso**

En `PASOS_PLAN`, dentro de la sección `── del día 5 en adelante ──`, después de
`'gato-el-hambre-lo-mueve'`:

```ts
  {
    id: 'gato-trampera-prestada',
    ventana: 'dia5',
    especies: ['gato'],
    titulo: 'Si se deja ver pero no agarrar: trampera',
    detalle:
      'Cuando ya sabés dónde anda pero se esconde apenas te acercás, una trampera de ' +
      'captura hace lo que la paciencia sola no puede. Los refugios y las agrupaciones ' +
      'de rescate suelen prestarlas: ponele adentro comida con olor fuerte, revisala ' +
      'seguido —sobre todo de madrugada— y nunca la dejes al sol ni sin agua.',
  },
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx jest <suite de planBusqueda> 2>&1 | tail -3`
Expected: PASS, incluidos los tests preexistentes de ids (no se tocó ninguno).

- [ ] **Step 5: Suite y commit**

Run: `npx tsc --noEmit && npx jest 2>&1 | tail -3`
Expected: verde.

```bash
git add src/lib/planBusqueda.ts <suite de planBusqueda>
git commit -m "t22: paso de la trampera prestada en el plan felino (dia 5)"
```

---

### Task INT: integración, dist y despliegue

**Files:**
- Modify: `ESTADO.md`
- El `dist/` re-exportado (el nudge y la trampera tocan el cliente)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la tanda lista para producción; la corrida de la semilla queda documentada como paso de despliegue (necesita `SUPABASE_SERVICE_ROLE_KEY` de Pablo).

- [ ] **Step 1: Suite final completa**

Run: `npx tsc --noEmit; npx jest 2>&1 | tail -3`
Expected: tsc 0, jest exit 0 real (anotar suites/tests).

- [ ] **Step 2: Exportar el dist**

Run: `npx expo export --platform web` (el comando exacto que use el repo — ver
scripts de package.json). Verificar que el bundle nuevo contiene el texto del
recordatorio: `grep -l "al día en el Registro" dist/_expo/static/js/web/*.js`.

- [ ] **Step 3: E2E contra el dist por el worker real**

`npx --yes wrangler@3 pages dev dist --port 8788 --ip 127.0.0.1` (⚠️ lecciones del
8-ago: `--yes` o npx se cuelga mudo esperando el "Ok to proceed?"; pegarle a
`127.0.0.1`; si el puerto queda tomado, matar los `workerd` zombis). Con
Playwright: entrar a Publicar (requiere sesión de prueba o verificar en la
pantalla de publicación como invitado hasta donde el gate lo permita), tipear un
chip → aparece el recordatorio → toca "Ver dónde revisarlo" → pantalla Microchip.
Si Publicar exige sesión, usar la cuenta de prueba del repo (probando779) y borrar
todo residuo al final.

- [ ] **Step 4: Actualizar ESTADO.md y commitear**

Sección nueva DÓNDE RETOMAR: tanda 22 completa en código; pasos de despliegue
pendientes de Pablo: (1) subir `dist`, (2) correr la semilla de refugios — el
comando exacto: `SUPABASE_URL=https://ywlrcfaybnikaurxsgtj.supabase.co SUPABASE_SERVICE_ROLE_KEY=<suya> node scripts/semilla-refugios.js`,
dos veces (idempotencia: segunda corrida sin duplicados, verificar
`select count(*) from lugares where categoria='refugio'` == entradas del JSON).

```bash
git add ESTADO.md
git commit -m "ESTADO: tanda 22 completa en codigo; despliegue = dist + semilla de refugios"
```

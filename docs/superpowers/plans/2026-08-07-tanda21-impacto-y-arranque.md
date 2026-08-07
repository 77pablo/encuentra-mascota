# Tanda 21 — Impacto (tasa/mediana), /impacto, aviso de multas y kit comunal — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impacto con tasa y mediana (RPC + tarjeta de Inicio), página pública `/impacto` con
desglose por comuna, advertencia de multas en la sección de carteles, y kit de arranque comunal
(afiche imprimible con QR + mensajes copiables).

**Architecture:** Una migración (`0070`) extiende `impacto_comunidad()` y crea
`impacto_por_comuna()`. La app consume los campos nuevos como opcionales (degrada si la RPC es
vieja). `/impacto` es HTML estático self-contained servido por el worker (mismo patrón que
`/widget`). El kit es lógica pura + un afiche de paleta clara fija con el patrón
generador offscreen existente.

**Tech Stack:** Expo/RN-web, Supabase (PostgREST anon), Cloudflare Pages `_worker.js`, jest.

## Global Constraints

- Umbrales de la frase: mostrar solo si `reencuentros >= 3` **y** `perdidasHistoricas >= 5` (spec A).
- `mediana_dias` es `null` en SQL si hay `< 3` reencuentros (spec A).
- Los criterios de `reencuentros`/`buscando` en la 0070 van VERBATIM como en la 0044 (guard de test).
- `/impacto` SIN `noindex` (a diferencia del widget: debe indexarse); todo texto de usuario escapado.
- Afiche comunal en paleta CLARA fija (regla de assets imprimibles).
- La migración `0070` NO se aplica en esta tanda (token revocado): queda lista en la rama; antes
  de aplicarla, traer el cuerpo vivo con `pg_get_functiondef` y comparar contra la 0044.
- Verificar exit codes del comando real (`$?`), nunca del último de una tubería.

---

### Task 1: `lib/impactoFrase.ts` (lógica pura de la frase)

**Files:**
- Create: `src/lib/impactoFrase.ts`
- Test: `__tests__/lib/impactoFrase.test.ts`

**Interfaces:**
- Produces: `fraseImpacto(d: { reencuentros: number; perdidasHistoricas?: number; medianaDias?: number | null }): string | null`, y las constantes `MIN_REENCUENTROS = 3`, `MIN_PERDIDAS = 5`.

- [ ] **Step 1: Test que falla**

```ts
import { fraseImpacto, MIN_PERDIDAS, MIN_REENCUENTROS } from '../../src/lib/impactoFrase';

describe('fraseImpacto', () => {
  it('null si la RPC es vieja (sin perdidasHistoricas)', () => {
    expect(fraseImpacto({ reencuentros: 10 })).toBeNull();
  });

  it('null bajo los umbrales (pocos datos = no decir nada)', () => {
    expect(fraseImpacto({ reencuentros: 2, perdidasHistoricas: 100, medianaDias: 3 })).toBeNull();
    expect(fraseImpacto({ reencuentros: 4, perdidasHistoricas: 4, medianaDias: 3 })).toBeNull();
  });

  it('frase completa con tasa y mediana', () => {
    expect(fraseImpacto({ reencuentros: 6, perdidasHistoricas: 10, medianaDias: 4.4 })).toBe(
      'De cada 10 perdidas, 6 ya volvieron · la mitad vuelve en ~4 días',
    );
  });

  it('sin mediana (null en SQL) muestra solo la tasa', () => {
    expect(fraseImpacto({ reencuentros: 5, perdidasHistoricas: 10, medianaDias: null })).toBe(
      'De cada 10 perdidas, 5 ya volvieron',
    );
  });

  it('con tasa que redondea a 0 muestra solo la mediana (no "0 ya volvieron")', () => {
    expect(fraseImpacto({ reencuentros: 3, perdidasHistoricas: 100, medianaDias: 6 })).toBe(
      'la mitad vuelve en ~6 días',
    );
  });

  it('la mediana nunca baja de ~1 día', () => {
    expect(fraseImpacto({ reencuentros: 5, perdidasHistoricas: 10, medianaDias: 0.2 })).toContain('~1 día');
  });

  it('umbrales exportados (los usa también /impacto)', () => {
    expect(MIN_REENCUENTROS).toBe(3);
    expect(MIN_PERDIDAS).toBe(5);
  });
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `npx jest __tests__/lib/impactoFrase.test.ts --silent`
Expected: FAIL (module not found).

- [ ] **Step 3: Implementación mínima**

```ts
// Frase humana de la tarjeta "Lo que logramos juntos" (Tanda 21).
//
// Regla de oro: con pocos datos NO se dice nada. "100% en 0 días" con un solo
// caso miente más que callar. Los umbrales los comparte la página /impacto
// (public/impacto/index.html los espeja; hay guard de test de ese espejo).
export const MIN_REENCUENTROS = 3;
export const MIN_PERDIDAS = 5;

export interface DatosImpactoFrase {
  reencuentros: number;
  /** Total histórico de perdidas visibles. `undefined` = RPC vieja (pre-0070). */
  perdidasHistoricas?: number;
  /** Mediana de días hasta el reencuentro. `null` = la RPC decidió callar (<3). */
  medianaDias?: number | null;
}

export function fraseImpacto(d: DatosImpactoFrase): string | null {
  if (d.perdidasHistoricas === undefined) return null; // RPC vieja: degradar mudo
  if (d.reencuentros < MIN_REENCUENTROS || d.perdidasHistoricas < MIN_PERDIDAS) return null;

  const partes: string[] = [];
  const deCada10 = Math.round((10 * d.reencuentros) / d.perdidasHistoricas);
  // Una tasa que redondea a 0 no es un logro para mostrar: se omite y queda
  // la mediana (si hay). Honesto sin ser desmoralizante.
  if (deCada10 >= 1) partes.push(`De cada 10 perdidas, ${Math.min(deCada10, 10)} ya volvieron`);
  if (d.medianaDias !== null && d.medianaDias !== undefined) {
    const dias = Math.max(1, Math.round(d.medianaDias));
    partes.push(`la mitad vuelve en ~${dias} ${dias === 1 ? 'día' : 'días'}`);
  }
  return partes.length ? partes.join(' · ') : null;
}
```

- [ ] **Step 4: Correr y ver verde**

Run: `npx jest __tests__/lib/impactoFrase.test.ts --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/impactoFrase.ts __tests__/lib/impactoFrase.test.ts
git commit -m "t21: fraseImpacto pura con umbrales de datos minimos"
```

---

### Task 2: campos nuevos opcionales en `services/impacto.ts`

**Files:**
- Modify: `src/services/impacto.ts`
- Test: `__tests__/services/impacto.test.ts` (crear si no existe; si existe, EXTENDER)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `Impacto` con `perdidasHistoricas?: number` y `medianaDias?: number | null`.

- [ ] **Step 1: Test que falla** (mock del rpc, patrón del repo: `jest.mock('../../src/lib/supabase')`)

```ts
import { getImpacto } from '../../src/services/impacto';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));
const rpc = supabase.rpc as jest.Mock;

describe('getImpacto con la RPC 0070', () => {
  it('mapea perdidas_historicas y mediana_dias', async () => {
    rpc.mockResolvedValue({
      data: [{ reencuentros: 4, buscando: 2, adopciones: 1, aportes: 9, perdidas_historicas: 10, mediana_dias: '4.5' }],
      error: null,
    });
    const r = await getImpacto();
    expect(r?.perdidasHistoricas).toBe(10);
    expect(r?.medianaDias).toBe(4.5);
  });

  it('RPC vieja (sin columnas nuevas) => undefined, no 0', async () => {
    rpc.mockResolvedValue({
      data: [{ reencuentros: 4, buscando: 2, adopciones: 1, aportes: 9 }],
      error: null,
    });
    const r = await getImpacto();
    expect(r?.perdidasHistoricas).toBeUndefined();
    expect(r?.medianaDias).toBeUndefined();
  });

  it('mediana_dias null (menos de 3 reencuentros) queda null, no NaN', async () => {
    rpc.mockResolvedValue({
      data: [{ reencuentros: 2, buscando: 0, adopciones: 0, aportes: 0, perdidas_historicas: 3, mediana_dias: null }],
      error: null,
    });
    const r = await getImpacto();
    expect(r?.medianaDias).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver el fallo** — `npx jest __tests__/services/impacto.test.ts --silent` → FAIL.

- [ ] **Step 3: Implementación** — en `src/services/impacto.ts`:

```ts
export interface Impacto {
  reencuentros: number;
  buscando: number;
  adopciones: number;
  aportes: number;
  /** Solo con la RPC 0070; `undefined` con la vieja (la tarjeta degrada sola). */
  perdidasHistoricas?: number;
  /** `null` = la RPC calló a propósito (<3 reencuentros). */
  medianaDias?: number | null;
}
```

y en el `return` de `getImpacto()`:

```ts
  return {
    reencuentros: Number(r.reencuentros ?? 0),
    buscando: Number(r.buscando ?? 0),
    adopciones: Number(r.adopciones ?? 0),
    aportes: Number(r.aportes ?? 0),
    perdidasHistoricas: r.perdidas_historicas == null ? undefined : Number(r.perdidas_historicas),
    medianaDias:
      r.mediana_dias === undefined ? undefined : r.mediana_dias === null ? null : Number(r.mediana_dias),
  };
```

OJO: `perdidas_historicas == null` (doble igual) colapsa `undefined` y `null` a `undefined` a
propósito: un conteo no puede ser null en la 0070, solo faltar. `mediana_dias` sí distingue.

- [ ] **Step 4: Verde** — `npx jest __tests__/services/impacto.test.ts --silent` → PASS.
- [ ] **Step 5: Commit** — `git add src/services/impacto.ts __tests__/services/impacto.test.ts && git commit -m "t21: getImpacto lee perdidas_historicas y mediana_dias opcionales"`

---

### Task 3: la frase en la tarjeta de Inicio

**Files:**
- Modify: `src/screens/HomeScreen.tsx` (tarjeta "Lo que logramos juntos", ~línea 470)
- Test: `__tests__/screens/impactoFraseEnInicio.test.ts`

**Interfaces:**
- Consumes: `fraseImpacto` (Task 1), `Impacto` (Task 2).

- [ ] **Step 1: Test que falla** (patrón del repo: leer el archivo, sin montar)

```ts
const leer = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'screens', 'HomeScreen.tsx'),
    'utf8',
  );

describe('frase de impacto en Inicio', () => {
  it('la tarjeta usa fraseImpacto (no arma el texto a mano)', () => {
    expect(leer()).toMatch(/fraseImpacto\(/);
    expect(leer()).toMatch(/from '\.\.\/lib\/impactoFrase'/);
  });
  it('se renderiza condicional (null = no mostrar nada)', () => {
    expect(leer()).toMatch(/fraseImpactoTexto\s*\?/);
  });
});
```

- [ ] **Step 2: FAIL** — `npx jest __tests__/screens/impactoFraseEnInicio.test.ts --silent`

- [ ] **Step 3: Implementación** — en `HomeScreen.tsx`:

Import: `import { fraseImpacto } from '../lib/impactoFrase';`

Cerca de `hasImpacto` (~línea 216):

```tsx
  const fraseImpactoTexto = impacto ? fraseImpacto(impacto) : null;
```

Dentro de la Card de impacto, DESPUÉS del cierre de `impactoGrid` (`</View>`):

```tsx
            {/* Tasa y mediana (mig. 0070). `fraseImpacto` calla con pocos
                datos o con la RPC vieja: acá solo se muestra lo que llega. */}
            {fraseImpactoTexto ? (
              <AppText muted size={12} style={styles.impactoFrase}>
                {fraseImpactoTexto}
              </AppText>
            ) : null}
```

En `crearEstilos`, junto a los estilos `impacto*`:

```ts
  impactoFrase: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
```

- [ ] **Step 4: Verde** — el test de la Task + `npx tsc --noEmit; echo "TSC=$?"` → `TSC=0`.
- [ ] **Step 5: Commit** — `git add src/screens/HomeScreen.tsx __tests__/screens/impactoFraseEnInicio.test.ts && git commit -m "t21: la tarjeta de Inicio muestra tasa y mediana cuando hay datos"`

---

### Task 4: migración `0070` (SIN aplicar) + guard de test

**Files:**
- Create: `supabase/migrations/0070_impacto_tasa_mediana.sql`
- Test: `__tests__/db/migracion0070.test.ts`

**Interfaces:**
- Produces: RPC `impacto_comunidad()` con `+perdidas_historicas bigint, +mediana_dias numeric`; RPC nueva `impacto_por_comuna() → (comuna text, reencuentros bigint, buscando bigint)`.

- [ ] **Step 1: Test que falla** (lee los DOS archivos SQL; los criterios compartidos deben ser VERBATIM los de la 0044)

```ts
const fs = require('fs');
const path = require('path');
const leer = (n: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', n), 'utf8');

describe('migración 0070', () => {
  const sql = () => leer('0070_impacto_tasa_mediana.sql');

  it('drop + create en el mismo archivo (una transacción)', () => {
    expect(sql()).toMatch(/drop function public\.impacto_comunidad\(\);/);
    expect(sql().indexOf('drop function')).toBeLessThan(sql().indexOf('create function public.impacto_comunidad'));
  });

  it('las columnas nuevas van AL FINAL de la firma (la app vieja ignora extras)', () => {
    expect(sql()).toMatch(
      /returns table \(reencuentros bigint, buscando bigint, adopciones bigint, aportes bigint, perdidas_historicas bigint, mediana_dias numeric\)/,
    );
  });

  it('reencuentros y buscando VERBATIM como la 0044 (que Inicio no se contradiga)', () => {
    const v0044 = leer('0044_impacto_buscando.sql');
    const criterioReencuentros = 'reunida_en is not null and oculto = false';
    const criterioBuscando = "activo = true and oculto = false and estado = 'perdida'";
    expect(v0044).toContain(criterioReencuentros);
    expect(v0044).toContain(criterioBuscando);
    expect(sql()).toContain(criterioReencuentros);
    expect(sql()).toContain(criterioBuscando);
  });

  it('la mediana calla con menos de 3 reencuentros', () => {
    expect(sql()).toMatch(/case when count\(\*\) >= 3/);
    expect(sql()).toMatch(/percentile_cont\(0\.5\)/);
  });

  it('impacto_por_comuna: solo comunas con datos, tope 50, grants como la global', () => {
    expect(sql()).toMatch(/create function public\.impacto_por_comuna\(\)/);
    expect(sql()).toMatch(/having/);
    expect(sql()).toMatch(/limit 50/);
    const grants = sql().match(/grant execute on function public\.impacto_(comunidad|por_comuna)\(\) to anon, authenticated;/g);
    expect(grants).toHaveLength(2);
  });

  it('las dos son security definer con search_path fijado', () => {
    const m = sql().match(/security definer set search_path = public, pg_temp stable/g);
    expect(m).toHaveLength(2);
  });
});
```

- [ ] **Step 2: FAIL** — `npx jest __tests__/db/migracion0070.test.ts --silent`

- [ ] **Step 3: Escribir la migración**

```sql
-- 0070_impacto_tasa_mediana.sql — Tanda 21
--
-- Dos cosas:
--  1) `impacto_comunidad()` suma `perdidas_historicas` (denominador de la
--     tasa) y `mediana_dias` (mediana de reunida_en − creado_en). Cambiar el
--     `returns table` EXIGE drop + create: van en el MISMO archivo y la API
--     de administración lo corre en una transacción, así que no hay ventana.
--     Las columnas nuevas van AL FINAL: la app vieja ignora campos extra.
--  2) `impacto_por_comuna()` para la página pública /impacto: desglose por
--     comuna, SOLO comunas con al menos un dato (nada de filas en cero).
--
-- ⚠️ ANTES DE APLICAR: traer el cuerpo vivo con
--   select pg_get_functiondef('public.impacto_comunidad()'::regprocedure);
-- y comparar contra la 0044. Los criterios de `reencuentros` y `buscando`
-- están VERBATIM (hay guard de test): si el vivo difiere, PARAR y mirar.
--
-- `mediana_dias` es null con < 3 reencuentros: "0 días" con un caso miente.
-- El guard `reunida_en >= creado_en` descarta relojes torcidos (una resta
-- negativa arruinaría la mediana en silencio).

drop function public.impacto_comunidad();
create function public.impacto_comunidad()
returns table (reencuentros bigint, buscando bigint, adopciones bigint, aportes bigint, perdidas_historicas bigint, mediana_dias numeric)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    (select count(*) from public.pets where reunida_en is not null and oculto = false),
    (select count(*) from public.pets where activo = true and oculto = false and estado = 'perdida'),
    (select count(*) from public.adoptions where adoptada_en is not null),
    (select (select count(*) from public.sightings) + (select count(*) from public.pet_tips)),
    (select count(*) from public.pets where estado = 'perdida' and oculto = false),
    (select case when count(*) >= 3
       then round((percentile_cont(0.5) within group (
              order by extract(epoch from (reunida_en - creado_en)) / 86400.0))::numeric, 1)
     end
     from public.pets
     where reunida_en is not null and oculto = false and reunida_en >= creado_en)
$$;
revoke all on function public.impacto_comunidad() from public;
grant execute on function public.impacto_comunidad() to anon, authenticated;

create function public.impacto_por_comuna()
returns table (comuna text, reencuentros bigint, buscando bigint)
language sql security definer set search_path = public, pg_temp stable
as $$
  select
    comuna,
    count(*) filter (where reunida_en is not null),
    count(*) filter (where activo = true and estado = 'perdida')
  from public.pets
  where comuna is not null and oculto = false
  group by comuna
  having count(*) filter (where reunida_en is not null) > 0
      or count(*) filter (where activo = true and estado = 'perdida') > 0
  order by 2 desc, 1
  limit 50
$$;
revoke all on function public.impacto_por_comuna() from public;
grant execute on function public.impacto_por_comuna() to anon, authenticated;
```

- [ ] **Step 4: Verde** — `npx jest __tests__/db/migracion0070.test.ts --silent` → PASS.
- [ ] **Step 5: Commit** — `git add supabase/migrations/0070_impacto_tasa_mediana.sql __tests__/db/migracion0070.test.ts && git commit -m "t21: migracion 0070 (tasa/mediana + impacto_por_comuna), SIN aplicar"`

---

### Task 5: aviso de multas en `PuntosCartel`

**Files:**
- Modify: `src/components/PuntosCartel.tsx`
- Test: `__tests__/components/puntosCartelMultas.test.ts`

- [ ] **Step 1: Test que falla**

```ts
const leer = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'PuntosCartel.tsx'),
    'utf8',
  );

describe('aviso de multas en la sección de carteles', () => {
  it('advierte la multa y da la salida (comercios / municipalidad)', () => {
    const s = leer();
    expect(s).toMatch(/multa/);
    expect(s).toMatch(/comercio/i);
    expect(s).toMatch(/municipalidad/i);
  });
  it('el aviso vive FUERA de las ramas éxito/error (se ve siempre)', () => {
    // El texto debe renderizarse incondicional: si Overpass falla, el consejo
    // genérico sigue empujando a pegar carteles y la advertencia igual aplica.
    const s = leer();
    const idx = s.indexOf('multa');
    expect(idx).toBeGreaterThan(-1);
    expect(s.slice(0, idx)).toMatch(/avisoMultas/); // estilo/const declarado arriba del uso
  });
});
```

- [ ] **Step 2: FAIL** — `npx jest __tests__/components/puntosCartelMultas.test.ts --silent`

- [ ] **Step 3: Implementación** — en `PuntosCartel.tsx`, debajo del intro (fuera del ternario
  éxito/consejo), agregar:

```tsx
      {/* Advertencia SIEMPRE visible (Tanda 21): varias comunas multan pegar
          carteles en postes/mobiliario público. La sugerencia de esquinas sin
          esto empujaba al usuario a una infracción sin saberlo. */}
      <AppText muted size={12} style={styles.avisoMultas}>
        Ojo: en varias comunas pegar carteles en postes o mobiliario público puede tener multa.
        Pedí permiso en comercios de la esquina (una vitrina se ve igual de bien) o consultá en tu
        municipalidad.
      </AppText>
```

y en los estilos del componente:

```ts
  avisoMultas: {
    lineHeight: 17,
    marginTop: spacing.xs,
  },
```

(Nota para el implementador: la const de estilos de `PuntosCartel` se llama como en el archivo —
mirar `crearEstilos`/`styles` existente y sumar la clave ahí; el test solo exige que exista
`avisoMultas` antes del uso.)

- [ ] **Step 4: Verde** — test de la Task + `npx tsc --noEmit; echo "TSC=$?"` → `TSC=0`.
- [ ] **Step 5: Commit** — `git add src/components/PuntosCartel.tsx __tests__/components/puntosCartelMultas.test.ts && git commit -m "t21: aviso de multas al sugerir donde pegar carteles"`

---

### Task 6: página pública `/impacto` + pase en el worker

**Files:**
- Create: `public/impacto/index.html`
- Modify: `public/_worker.js:204` (lista `ESTATICOS_SIN_EXTENSION`)
- Test: `__tests__/worker/ogWorker.test.ts` (EXTENDER, patrón de los tests `/widget` de la t20)
- Test: `__tests__/paginas/impactoHtml.test.ts`

**Interfaces:**
- Consumes: RPCs `impacto_comunidad()` / `impacto_por_comuna()` (Task 4) vía PostgREST anon.

- [ ] **Step 1: Tests que fallan**

En `__tests__/worker/ogWorker.test.ts`, junto a los tests de `/widget`:

```ts
  // Página pública de impacto (Tanda 21): estática, servida por ASSETS.
  it.each(['/impacto', '/impacto/'])(
    '%s pasa a env.ASSETS.fetch, no al fallback SPA',
    async (ruta) => {
      const env = {
        ASSETS: {
          fetch: jest.fn(async (req: Request) => {
            const u = new URL(req.url);
            if (u.pathname.startsWith('/impacto')) {
              return new Response('<html>impacto estático</html>', {
                headers: { 'content-type': 'text/html; charset=utf-8' },
              });
            }
            return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
          }),
        },
      };
      const res = await worker.fetch(new Request('https://x.cl' + ruta), env);
      expect(await res.text()).toBe('<html>impacto estático</html>');
    },
  );

  it('/impactos-x NO se toma como estático (no se escapa del SPA)', async () => {
    const env = envAssetsFalso();
    const res = await worker.fetch(new Request('https://x.cl/impactos-x'), env);
    expect(await res.text()).toContain('<div id="root">');
  });
```

Nuevo `__tests__/paginas/impactoHtml.test.ts` (guardas de forma del HTML):

```ts
const leer = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'public', 'impacto', 'index.html'),
    'utf8',
  );

describe('public/impacto/index.html', () => {
  it('NO lleva noindex (es material de prensa; el widget SÍ lo lleva)', () => {
    expect(leer()).not.toMatch(/noindex/);
    expect(leer()).toMatch(/<title>/);
    expect(leer()).toMatch(/og:title/);
  });
  it('escapa el texto de usuario (comuna) antes de inyectarlo', () => {
    expect(leer()).toMatch(/function escapar\(/);
    expect(leer()).toMatch(/escapar\(f\.comuna\)/);
  });
  it('espeja los umbrales de lib/impactoFrase (guard del espejo)', () => {
    const { MIN_PERDIDAS, MIN_REENCUENTROS } = require('../../src/lib/impactoFrase');
    expect(leer()).toContain(`var MIN_REENCUENTROS = ${MIN_REENCUENTROS};`);
    expect(leer()).toContain(`var MIN_PERDIDAS = ${MIN_PERDIDAS};`);
  });
  it('llama a las DOS RPCs como anon', () => {
    expect(leer()).toMatch(/rpc\/impacto_comunidad/);
    expect(leer()).toMatch(/rpc\/impacto_por_comuna/);
  });
});
```

- [ ] **Step 2: FAIL** — `npx jest __tests__/worker/ogWorker.test.ts __tests__/paginas/impactoHtml.test.ts --silent`

- [ ] **Step 3: Implementación**

En `public/_worker.js` línea 204 (con su comentario, como `/widget`):

```js
//   /impacto        → página pública de impacto (Tanda 21): números agregados
//                     de la comunidad + desglose por comuna. Material de
//                     prensa/convenio; SÍ se indexa. Es public/impacto/index.html.
const ESTATICOS_SIN_EXTENSION = ['/borrar-cuenta', '/privacidad', '/terminos', '/widget', '/impacto'];
```

`public/impacto/index.html` completo:

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>El impacto de Encuentra tu Mascota</title>
  <meta name="description" content="Cuántas mascotas perdidas vuelven a casa gracias a la comunidad, y en cuánto tiempo. Datos reales, comuna por comuna." />
  <meta property="og:title" content="El impacto de Encuentra tu Mascota" />
  <meta property="og:description" content="Cuántas mascotas vuelven a casa gracias a la comunidad, con datos reales por comuna." />
  <meta property="og:type" content="website" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937; background: #fffaf5; font-size: 15px; line-height: 1.5;
    }
    .wrap { max-width: 640px; margin: 0 auto; padding: 28px 16px 40px; }
    h1 { font-size: 24px; margin: 0 0 4px; color: #b91c1c; }
    .sub { color: #6b7280; margin: 0 0 20px; }
    .estado { color: #6b7280; padding: 32px 8px; text-align: center; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .celda { background: #fff; border: 1px solid #f1e4d8; border-radius: 14px; padding: 14px; text-align: center; }
    .num { font-size: 26px; font-weight: 800; }
    .rot { color: #6b7280; font-size: 13px; }
    .frase { text-align: center; color: #374151; margin: 16px 0 0; font-weight: 600; }
    h2 { font-size: 16px; margin: 28px 0 8px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #f1e4d8; border-radius: 12px; overflow: hidden; }
    th, td { text-align: left; padding: 8px 12px; font-size: 14px; border-top: 1px solid #f6ede4; }
    th { background: #fdf3ea; border-top: none; color: #6b7280; font-size: 12px; }
    td.n { text-align: right; font-variant-numeric: tabular-nums; }
    footer { margin-top: 28px; text-align: center; font-size: 13px; color: #6b7280; }
    footer a { color: #b91c1c; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Lo que logramos juntos</h1>
    <p class="sub">Datos reales de la comunidad de Encuentra tu Mascota, actualizados al momento de abrir esta página.</p>
    <div id="contenido" class="estado">Cargando…</div>
    <footer>Hecho por la comunidad de <a id="masLink" href="/">Encuentra tu Mascota</a> — publicar y avisar es gratis, sin trámite.</footer>
  </div>

  <script>
    // Mismas credenciales PÚBLICAS que el widget y el bundle (la RLS protege).
    var SUPABASE_URL = 'https://ywlrcfaybnikaurxsgtj.supabase.co';
    var ANON = 'sb_publishable_K1UXXganPME34mfGqvt9vA_DOrcbwr6';
    // Espejo de src/lib/impactoFrase.ts (guard de test compara los dos archivos).
    var MIN_REENCUENTROS = 3;
    var MIN_PERDIDAS = 5;

    function escapar(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function rpc(nombre) {
      return fetch(SUPABASE_URL + '/rest/v1/rpc/' + nombre, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
        body: '{}',
      }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }

    document.getElementById('masLink').href = location.origin + '/';
    var cont = document.getElementById('contenido');

    Promise.all([rpc('impacto_comunidad'), rpc('impacto_por_comuna').catch(function () { return []; })])
      .then(function (res) {
        var g = (res[0] || [])[0];
        var filas = res[1] || [];
        if (!g) { cont.textContent = 'Todavía no hay datos para mostrar.'; return; }
        var html = '<div class="grid">'
          + '<div class="celda"><div class="num">' + Number(g.reencuentros || 0) + '</div><div class="rot">reencuentros</div></div>'
          + '<div class="celda"><div class="num">' + Number(g.buscando || 0) + '</div><div class="rot">mascotas buscando</div></div>'
          + '<div class="celda"><div class="num">' + Number(g.adopciones || 0) + '</div><div class="rot">encontraron familia</div></div>'
          + '<div class="celda"><div class="num">' + Number(g.aportes || 0) + '</div><div class="rot">aportes de vecinos</div></div>'
          + '</div>';
        var re = Number(g.reencuentros || 0);
        var perdidas = g.perdidas_historicas == null ? null : Number(g.perdidas_historicas);
        var mediana = g.mediana_dias == null ? null : Number(g.mediana_dias);
        if (perdidas !== null && re >= MIN_REENCUENTROS && perdidas >= MIN_PERDIDAS) {
          var partes = [];
          var deCada10 = Math.round((10 * re) / perdidas);
          if (deCada10 >= 1) partes.push('De cada 10 perdidas, ' + Math.min(deCada10, 10) + ' ya volvieron');
          if (mediana !== null) {
            var dias = Math.max(1, Math.round(mediana));
            partes.push('la mitad vuelve en ~' + dias + (dias === 1 ? ' día' : ' días'));
          }
          if (partes.length) html += '<p class="frase">' + partes.join(' · ') + '</p>';
        }
        if (filas.length) {
          html += '<h2>Por comuna</h2><table><tr><th>Comuna</th><th style="text-align:right">Reencuentros</th><th style="text-align:right">Buscando</th></tr>';
          filas.forEach(function (f) {
            html += '<tr><td>' + escapar(f.comuna) + '</td><td class="n">' + Number(f.reencuentros || 0) + '</td><td class="n">' + Number(f.buscando || 0) + '</td></tr>';
          });
          html += '</table>';
        }
        cont.className = '';
        cont.innerHTML = html;
      })
      .catch(function () {
        cont.textContent = 'No pudimos cargar los datos ahora. Probá de nuevo en un rato.';
      });
  </script>
</body>
</html>
```

- [ ] **Step 4: Verde** — `npx jest __tests__/worker/ogWorker.test.ts __tests__/paginas/impactoHtml.test.ts --silent` → PASS.
- [ ] **Step 5: Commit** — `git add public/impacto/index.html public/_worker.js __tests__/worker/ogWorker.test.ts __tests__/paginas/impactoHtml.test.ts && git commit -m "t21: pagina publica /impacto (global + por comuna) servida por el worker"`

---

### Task 7: `lib/kitComunal.ts` (textos + URL del sitio)

**Files:**
- Create: `src/lib/kitComunal.ts`
- Test: `__tests__/lib/kitComunal.test.ts`

**Interfaces:**
- Consumes: `RESPALDO_WEB` de `src/lib/afiche.ts`.
- Produces: `urlSitio(): string`, `mensajesKit(url?: string): MensajeKit[]` con `MensajeKit = { id: 'vecinos' | 'facebook' | 'veterinaria'; titulo: string; texto: string }`.

- [ ] **Step 1: Test que falla**

```ts
import { mensajesKit, urlSitio } from '../../src/lib/kitComunal';

describe('kit comunal', () => {
  it('urlSitio usa EXPO_PUBLIC_WEB_URL o el respaldo NUESTRO', () => {
    expect(urlSitio()).toMatch(/^https:\/\//);
    expect(urlSitio()).not.toContain('encuentratumascota.app'); // dominio ajeno, ya nos mordió
  });

  it('tres mensajes, cada uno con la URL y sin pedir plata ni cuenta', () => {
    const msgs = mensajesKit('https://ejemplo.cl');
    expect(msgs.map((m) => m.id).sort()).toEqual(['facebook', 'vecinos', 'veterinaria']);
    for (const m of msgs) {
      expect(m.texto).toContain('https://ejemplo.cl');
      expect(m.texto.toLowerCase()).toContain('gratis');
      expect(m.texto).not.toMatch(/\$|precio|pago/i);
    }
  });

  it('el mensaje de veterinaria menciona el widget (la pieza institucional)', () => {
    const vet = mensajesKit('https://ejemplo.cl').find((m) => m.id === 'veterinaria')!;
    expect(vet.texto).toContain('/widget');
  });
});
```

- [ ] **Step 2: FAIL** — `npx jest __tests__/lib/kitComunal.test.ts --silent`

- [ ] **Step 3: Implementación**

```ts
import { RESPALDO_WEB } from './afiche';

// Kit de arranque comunal (Tanda 21): lo que una persona necesita para traer
// la app a su comuna — textos listos para pegar. Ataca el problema real de
// hoy: el arranque en frío. Tono cálido, sin humo, sin pedir nada.

// Metro solo inlinea `process.env.EXPO_PUBLIC_X` escrito LITERAL (lección de
// producción del 18-jul): no pasar `process.env` entero ni indexar dinámico.
export function urlSitio(): string {
  return process.env.EXPO_PUBLIC_WEB_URL || RESPALDO_WEB;
}

export interface MensajeKit {
  id: 'vecinos' | 'facebook' | 'veterinaria';
  titulo: string;
  texto: string;
}

export function mensajesKit(url: string = urlSitio()): MensajeKit[] {
  return [
    {
      id: 'vecinos',
      titulo: 'Para tu junta de vecinos o grupo del barrio',
      texto:
        `Vecinos: cuando se pierde una mascota en el barrio, ahora hay un lugar para avisar y buscar juntos: ${url}\n\n` +
        'Se publica gratis, cualquiera puede avisar que la vio SIN crear cuenta, y a los vecinos ' +
        'que quieran les llegan alertas de la zona. Mientras más seamos acá, más rápido vuelven a casa.',
    },
    {
      id: 'facebook',
      titulo: 'Para el grupo de Facebook de tu comuna',
      texto:
        `🐾 Si se te perdió tu mascota (o encontraste una), publicala acá: ${url}\n\n` +
        'Es gratis, hecho en Chile y no hace falta cuenta para avisar que la viste. Los avisos ' +
        'llegan a los vecinos de la misma zona, con mapa y afiche listo para imprimir.',
    },
    {
      id: 'veterinaria',
      titulo: 'Para dejar en una veterinaria o refugio',
      texto:
        `Hola: somos Encuentra tu Mascota (${url}), una app comunitaria y gratuita para reunir ` +
        'mascotas perdidas con su familia. Si les sirve, pueden mostrar las mascotas perdidas de la ' +
        `comuna en su propio sitio web con un widget gratis: ${url}/widget/ — y si llega alguien con ` +
        'una mascota encontrada, en la app puede avisar sin crear cuenta.',
    },
  ];
}
```

- [ ] **Step 4: Verde** — `npx jest __tests__/lib/kitComunal.test.ts --silent` → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/kitComunal.ts __tests__/lib/kitComunal.test.ts && git commit -m "t21: textos del kit de arranque comunal"`

---

### Task 8: afiche comunal + pantalla del kit + cableado

**Files:**
- Create: `src/components/AficheComunal.tsx`
- Create: `src/components/AficheComunalGenerador.tsx`
- Create: `src/screens/KitComunalScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx` (registrar `KitComunal`)
- Modify: `src/screens/AyudaScreen.tsx` (Fila nueva)
- Modify: `src/screens/ProfileScreen.tsx` (entrada en la rama de invitado Y en la de sesión)
- Test: `__tests__/screens/kitComunal.test.tsx`

**Interfaces:**
- Consumes: `mensajesKit`/`urlSitio` (Task 7), `qrMatrix` vía el componente existente `src/components/QrCode.tsx`, `capturarAfiche`/`entregarAfiche` de `src/lib/aficheImage.ts`, `mensajeDeErrorDb` de `src/lib/dbErrors.ts`.

- [ ] **Step 1: Test que falla**

```tsx
const leer = (rel: string) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', rel), 'utf8');

describe('kit comunal — pantalla y cableado', () => {
  it('la pantalla usa los textos de lib/kitComunal (no los duplica)', () => {
    const s = leer('screens/KitComunalScreen.tsx');
    expect(s).toMatch(/mensajesKit/);
    expect(s).toMatch(/clipboard|writeText/);
  });

  it('el afiche comunal usa paleta CLARA fija (regla de assets imprimibles)', () => {
    const s = leer('components/AficheComunal.tsx');
    expect(s).toMatch(/lightColors/);
    expect(s).not.toMatch(/useColors\(/);
  });

  it('KitComunal está en el stack raíz', () => {
    const nav = leer('navigation/RootNavigator.tsx');
    expect(nav).toMatch(/name="KitComunal"/);
    expect(nav).toMatch(/KitComunalScreen/);
  });

  it('se llega desde Ayuda', () => {
    expect(leer('screens/AyudaScreen.tsx')).toMatch(/navigate\('KitComunal'\)/);
  });

  it('se llega desde Perfil TAMBIÉN como invitado (lección de la T20)', () => {
    const entradas = leer('screens/ProfileScreen.tsx').match(/navigate\('KitComunal'\)/g) ?? [];
    expect(entradas.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: FAIL** — `npx jest __tests__/screens/kitComunal.test.tsx --silent`

- [ ] **Step 3: Implementación**

`src/components/AficheComunal.tsx` (vista pura, paleta clara FIJA — un afiche impreso no puede
salir oscuro; mirar los imports exactos de paleta en `AfichePoster.tsx` y usar los mismos):

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../ui';
import { lightColors, spacing } from '../theme';
import QrCode from './QrCode';
import { urlSitio } from '../lib/kitComunal';

// Afiche GENÉRICO del kit comunal (Tanda 21): no es de una mascota, es de la
// app — para diarios murales, veterinarias y negocios del barrio. Paleta
// clara fija como AfichePoster/CollarTag (se imprime).
export const AFICHE_COMUNAL_ANCHO = 640;

export default function AficheComunal() {
  const url = urlSitio();
  return (
    <View style={styles.hoja}>
      <AppText weight="bold" size={34} style={styles.titular}>
        ¿SE TE PERDIÓ TU MASCOTA?
      </AppText>
      <AppText size={20} style={styles.sub}>
        Tu comuna ya tiene dónde buscarla
      </AppText>
      <View style={styles.bullets}>
        <AppText size={16} style={styles.bullet}>• Publicá su ficha gratis, con foto y mapa</AppText>
        <AppText size={16} style={styles.bullet}>• ¿La viste? Avisá sin crear cuenta</AppText>
        <AppText size={16} style={styles.bullet}>• Los vecinos de la zona reciben la alerta</AppText>
      </View>
      <View style={styles.qrZona}>
        <QrCode value={url} size={200} />
        <AppText size={14} style={styles.qrTexto}>
          Escaneá para entrar. Gratis y sin trámite.
        </AppText>
        <AppText weight="bold" size={16} style={styles.url}>
          {url.replace(/^https?:\/\//, '')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hoja: {
    width: AFICHE_COMUNAL_ANCHO,
    backgroundColor: '#ffffff',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  titular: { color: lightColors.danger, textAlign: 'center' },
  sub: { color: lightColors.ink, textAlign: 'center' },
  bullets: { alignSelf: 'stretch', gap: spacing.xs, marginVertical: spacing.md },
  bullet: { color: lightColors.ink },
  qrZona: { alignItems: 'center', gap: spacing.xs },
  qrTexto: { color: lightColors.muted, textAlign: 'center' },
  url: { color: lightColors.brandDark },
});
```

(Nota: verificar los NOMBRES reales de la paleta — `danger`/`ink`/`muted`/`brandDark` — contra
`src/theme` y `AfichePoster.tsx`; si difieren, usar los del tema real.)

`src/components/AficheComunalGenerador.tsx` (patrón AficheGenerator sin foto):

```tsx
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import AficheComunal from './AficheComunal';
import { capturarAfiche, entregarAfiche } from '../lib/aficheImage';
import { mensajeDeErrorDb } from '../lib/dbErrors';

export interface AficheComunalGeneradorProps {
  onDone: () => void;
  onError: (mensaje: string) => void;
}

// Render offscreen + captura, como AficheGenerator pero sin foto remota:
// alcanza el margen fijo para que asiente el layout.
export default function AficheComunalGenerador({ onDone, onError }: AficheComunalGeneradorProps) {
  const ref = useRef<View>(null);
  const disparado = useRef(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (disparado.current) return;
      disparado.current = true;
      try {
        const png = await capturarAfiche(ref.current);
        await entregarAfiche(png, 'trae-la-app-a-tu-comuna.png');
        onDone();
      } catch (e: any) {
        onError(mensajeDeErrorDb(e));
      }
    }, 400);
    return () => clearTimeout(t);
  }, [onDone, onError]);

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={ref} collapsable={false}>
        <AficheComunal />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
});
```

`src/screens/KitComunalScreen.tsx` (patrón de copiar de `WidgetInstitucionScreen`):

```tsx
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Screen, Title } from '../ui';
import { spacing, type Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import AficheComunalGenerador from '../components/AficheComunalGenerador';
import { mensajesKit } from '../lib/kitComunal';
import { notify } from '../lib/notify';

const MS_FEEDBACK = 2000;

// Kit de arranque comunal (Tanda 21): afiche imprimible + mensajes listos
// para pegar. Para quien quiere traer la app a su comuna — puede no tener
// cuenta (misma lección que el widget), así que no hay ningún gate.
export default function KitComunalScreen() {
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const mensajes = useMemo(() => mensajesKit(), []);

  const copiar = async (id: string, texto: string) => {
    const clipboard = Platform.OS === 'web' ? globalThis.navigator?.clipboard : undefined;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(texto);
        setCopiado(id);
        setTimeout(() => setCopiado(null), MS_FEEDBACK);
        return;
      } catch (e) {
        console.warn('no se pudo copiar el mensaje del kit', e);
      }
    }
    Share.share({ message: texto });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title size={22}>Traé la app a tu comuna</Title>
        <AppText muted size={14} style={styles.intro}>
          Mientras más vecinos la conozcan, más rápido vuelven las mascotas a casa. Acá tenés un
          afiche para imprimir y mensajes listos para compartir.
        </AppText>

        <Card style={styles.card}>
          <AppText weight="semi" size={14}>Afiche para el diario mural o la vitrina</AppText>
          <Button
            title={generando ? 'Generando…' : 'Descargar el afiche'}
            variant="secondary"
            icon="download-outline"
            onPress={() => setGenerando(true)}
            disabled={generando}
            style={styles.boton}
          />
        </Card>

        {mensajes.map((m) => (
          <Card key={m.id} style={styles.card}>
            <AppText weight="semi" size={14}>{m.titulo}</AppText>
            <View style={styles.mensajeCaja}>
              <AppText size={13} style={styles.mensajeTexto}>{m.texto}</AppText>
            </View>
            <Button
              title={copiado === m.id ? '¡Copiado!' : 'Copiar'}
              variant="secondary"
              icon={copiado === m.id ? 'checkmark' : 'copy-outline'}
              onPress={() => copiar(m.id, m.texto)}
              style={styles.boton}
            />
          </Card>
        ))}
      </ScrollView>

      {generando ? (
        <AficheComunalGenerador
          onDone={() => setGenerando(false)}
          onError={(msj) => {
            setGenerando(false);
            notify('No pudimos generar el afiche', msj);
          }}
        />
      ) : null}
    </Screen>
  );
}

function crearEstilos(colors: Colors) {
  return StyleSheet.create({
    content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
    intro: { lineHeight: 20 },
    card: { gap: spacing.sm },
    boton: { alignSelf: 'flex-start' },
    mensajeCaja: {
      backgroundColor: colors.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.sm,
    },
    mensajeTexto: { lineHeight: 19 },
  });
}
```

(Notas: verificar la firma real de `notify` en `src/lib/notify.ts` — si es `notify(titulo, cuerpo)`
o un solo string — y ajustar; `radius` del tema para `borderRadius` si el repo no usa números
pelados; nombres de paleta contra `src/theme`.)

Cableado — `RootNavigator.tsx` (junto a `WidgetInstitucion`):

```tsx
        {/* Kit de arranque comunal (Tanda 21): afiche + mensajes para traer
            la app a una comuna. Stack raíz, sin gate (invitado incluido). */}
        <Stack.Screen
          name="KitComunal"
          component={KitComunalScreen}
          options={{ headerShown: true, title: 'Traé la app a tu comuna' }}
        />
```

`AyudaScreen.tsx` (Fila nueva, después de la del widget):

```tsx
        <Fila
          icono="megaphone"
          titulo="Traé la app a tu comuna"
          sub="Afiche imprimible y mensajes listos para compartir"
          externo={false}
          onPress={() => navigation.navigate('KitComunal')}
        />
```

`ProfileScreen.tsx` — en la rama de INVITADO (debajo del botón del widget):

```tsx
          <Button
            title="Traé la app a tu comuna"
            variant="ghost"
            icon="megaphone-outline"
            onPress={() => navigation.navigate('KitComunal')}
            style={styles.invitadoBoton}
          />
```

y en la sección con sesión (debajo de "Widget para tu sitio"):

```tsx
        <Button
          title="Traé la app a tu comuna"
          variant="ghost"
          icon="megaphone-outline"
          onPress={() => navigation.navigate('KitComunal')}
        />
```

- [ ] **Step 4: Verde** — `npx jest __tests__/screens/kitComunal.test.tsx --silent` + `npx tsc --noEmit; echo "TSC=$?"` → `TSC=0`.
- [ ] **Step 5: Commit** — `git add src/components/AficheComunal.tsx src/components/AficheComunalGenerador.tsx src/screens/KitComunalScreen.tsx src/navigation/RootNavigator.tsx src/screens/AyudaScreen.tsx src/screens/ProfileScreen.tsx __tests__/screens/kitComunal.test.tsx && git commit -m "t21: kit de arranque comunal (afiche con QR + mensajes copiables)"`

---

### Task 9: verificación integrada (suite, dist, wrangler, E2E) y cierre

**Files:**
- Modify: `ESTADO.md` (sección DÓNDE RETOMAR)

- [ ] **Step 1: Suite completa y tsc** — `npx tsc --noEmit; echo "TSC=$?"` → 0; `npm test --silent > "$LOG" 2>&1; echo "JEST=$?"` → 0 (leer `$?` del jest, no del tail).
- [ ] **Step 2: Exportar** — `npx expo export --platform web` → existe `dist/impacto/index.html`.
- [ ] **Step 3: Runtime real** — `npx wrangler@3 pages dev dist --port 8788` y verificar con curl:
  `/impacto/` → HTML propio (contiene "Lo que logramos juntos"); `/impactos-x` → SPA (`id="root"`);
  `/widget/` sigue andando (no se rompió el vecino).
- [ ] **Step 4: E2E con Playwright contra el dist** (patrón de la t20, `PYTHONIOENCODING=utf-8`):
  - `/impacto/` con la base actual: la RPC 0070 NO está aplicada → la global vieja responde igual
    (4 números) y `impacto_por_comuna` da 404 → el `.catch` lo tapa → página con los 4 números en 0
    y SIN tabla por comuna, SIN frase. Eso ES el resultado esperado pre-migración.
  - Pantalla del kit como invitado: Perfil → "Traé la app a tu comuna" → copiar un mensaje →
    clipboard contiene la URL del sitio. Descargar el afiche dispara la descarga (en headless:
    esperar el evento `download` de Playwright).
  - Inicio NO muestra la frase (base casi vacía + RPC vieja): comprobar que la tarjeta de impacto
    no tiene "De cada 10".
- [ ] **Step 5: ESTADO.md + commit + push** — actualizar DÓNDE RETOMAR (t21 en la rama; la 0070
  queda SIN aplicar, esperando token; el dist nuevo reemplaza al de la t20 como pendiente de
  subida) y `git push origin feat/t13`.

---

## Self-Review

- **Cobertura del spec:** A → Tasks 1-4; B1 → Task 5; B2 → Task 6; B4 (por comuna) → Tasks 4+6;
  B3 → Tasks 7-8; despliegue/verificación → Task 9. Sin huecos.
- **Placeholders:** ninguno; todo el código está inline. Las "Notas para el implementador" piden
  VERIFICAR nombres reales (paleta, `notify`, `radius`) — es adaptación al codebase, no un TBD.
- **Consistencia de tipos:** `fraseImpacto` (T1) consume el shape que produce `getImpacto` (T2);
  los umbrales de T1 los espeja T6 con guard; `mensajesKit` (T7) es lo que consume T8.

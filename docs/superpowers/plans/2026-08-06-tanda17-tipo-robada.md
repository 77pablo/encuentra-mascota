# Tipo "robada" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Marcar un reporte perdido como "robada" (marca booleana, no estado nuevo), con badge en
todos lados y una guía propia.

**Architecture:** `pets.robada boolean` + recrear `buscar_reportes` desde su cuerpo VIVO sumando la
columna. Cliente: `robada` en el tipo `Pet` (llega por cast del RPC y por select('*')), casilla en
Publicar, badge en ficha/feed/afiche/compartir, pantalla `GuiaRobada`.

**Tech Stack:** React Native + react-native-web, TS, jest-expo; Supabase (Management API + PAT).

## Global Constraints
- MARCA booleana, jamás un tercer estado (rompería ~25 ternarios `perdida?lost:found`).
- Recrear `buscar_reportes` desde el CUERPO VIVO (16 params con `p_color`/`p_tamano`), no desde 0028;
  solo cambia la lista de columnas; WHERE/cursor/order verbatim.
- `robada` en el grupo OPCIONAL del insert (la web publica aunque la base no tenga la columna).
- Migración ensayada en `begin…rollback` con asserts + CONTROLES; recrear función desde cuerpo vivo.
- Tono sin culpar; nunca el monto; navegación anidada absoluta (`GuiaRobada` como `PublicPetScreen`).
- Guardas de forma contra mutación; verificación final contra el dist compilado.

---

### Task 1: Migración `0068` — columna + recrear buscar_reportes

**Files:** Create `supabase/migrations/0068_tipo_robada.sql`; ensayo/aplicación vía Management API.

- [ ] **Step 1:** Escribir `0068_tipo_robada.sql`: (a) `alter table public.pets add column if not
  exists robada boolean not null default false;` (b) `drop function if exists
  public.buscar_reportes(<16 tipos>)` seguido de `create function ...` con el **cuerpo vivo verbatim**
  (guardado en scratchpad/buscar_reportes_vivo.json), agregando `robada boolean` al RETURNS, `p.robada`
  al select de `calc` y `calc.robada` al select final. Comentario que explique por qué se recrea desde
  el cuerpo vivo (los 16 params de señas).
- [ ] **Step 2:** Ensayo en `begin…rollback` (Management API + PAT en scratchpad): asserts — columna
  existe; `buscar_reportes(...)` devuelve `robada`; un pet marcado `robada=true` sale con la marca;
  CONTROLES — la RPC sigue devolviendo filas con cursor, `p_color`/`p_tamano` siguen filtrando. Rollback.
- [ ] **Step 3:** Aplicar (sin transacción) con los mismos asserts.
- [ ] **Step 4:** Ataques/controles por HTTP: `robada` legible para `anon` en un reporte público (es
  dato público, como estado); la RPC anon sigue funcionando. Commit del `.sql`.

---

### Task 2: `robada` en el tipo `Pet` + persistencia opcional en createPet/updatePet

**Files:** Modify `src/services/pets.ts`; Test `__tests__/services/petsRobada.test.ts` (forma).

**Interfaces:** Produces: `Pet.robada: boolean`; `PetInput.robada?: boolean`.

- [ ] **Step 1: Failing test** (forma: robada en el tipo y en el grupo opcional)

```ts
const fuente = () => require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'src', 'services', 'pets.ts'), 'utf8');
it('Pet declara robada', () => { expect(fuente()).toMatch(/robada\s*:\s*boolean/); });
it('robada viaja en el grupo opcional del insert (la web publica sin la columna)', () => {
  expect(fuente()).toMatch(/extras\.robada|GRUPOS_OPCIONALES[\s\S]*robada/);
});
```

- [ ] **Step 2:** Run, verify fail.
- [ ] **Step 3:** En `pets.ts`: agregar `robada: boolean` a `Pet` y `robada?: boolean` a `PetInput`;
  en `opcionalesDe`, `if (input.robada) extras.robada = true;`; sumar `['robada']` a
  `GRUPOS_OPCIONALES` (mirar la estructura real) para que `grupoFaltante` lo pueda soltar si la base no
  tiene la columna. Verificar que `updatePet`/whitelist de edición incluya `robada`.
- [ ] **Step 4:** Run tests + `npx tsc --noEmit`.
- [ ] **Step 5:** Commit — `feat(t17): robada en el tipo Pet, persistido como opcional`

---

### Task 3: Casilla "Me la robaron" en Publicar/Editar

**Files:** Modify `src/screens/PublishScreen.tsx`; Test `__tests__/screens/publishRobada.test.tsx` (forma).

- [ ] **Step 1: Failing test**

```ts
const p = () => require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'src', 'screens', 'PublishScreen.tsx'), 'utf8');
it('ofrece la casilla solo cuando es perdida', () => {
  expect(p()).toMatch(/Me la robaron/);
  expect(p()).toMatch(/robada/);
});
it("estado sigue siendo 'perdida' | 'encontrada' (robada no es estado)", () => {
  expect(p()).toMatch(/'perdida'\s*\|\s*'encontrada'/);
});
```

- [ ] **Step 2:** Run, verify fail.
- [ ] **Step 3:** Estado `const [robada, setRobada] = useState(false)`; cuando `estado==='perdida'`,
  renderizar una casilla "Me la robaron" (patrón del checkbox de recompensa, `recompensaRow`); incluir
  `robada` en el payload que va a `createPet` (dentro de `parsed.data` o el input). Al marcarla, ofrecer
  `navigation.navigate('App', { screen:..., ... })` → o abrir `GuiaRobada` (Task 5). Al cambiar a
  `encontrada`, forzar `robada=false`.
- [ ] **Step 4:** Run tests + tsc.
- [ ] **Step 5:** Commit — `feat(t17): casilla "Me la robaron" en Publicar (solo perdida)`

---

### Task 4: Badge "ROBADA" en ficha, feed, afiche y textos de compartir

**Files:** Modify `PetDetailScreen.tsx`, `PetCard.tsx`, `lib/afiche.ts`, `lib/share.ts`,
`lib/difusionRedes.ts`, `ReportesMapa.tsx`; Tests: extender `difusionRedes.test.ts` +
`__tests__/lib/aflicheRobada.test.ts` + guardas de forma.

- [ ] **Step 1: Failing tests** — `armarTextoDifusion` de un robada dice "ROBADA" y no "Se perdió";
  `buildShareText` de un robada dice "ROBADA"; `afiche` titular suma "ROBADA".

```ts
// difusionRedes.test.ts (añadir)
it('un reporte robado dice ROBADA en vez de "Se perdió"', () => {
  const t = armarTextoDifusion({ especie: 'perro', estado: 'perdida', robada: true }, 'u');
  expect(t).toMatch(/ROBAD/i);
  expect(t).not.toMatch(/Se perdió/);
});
```

- [ ] **Step 2:** Run, verify fail.
- [ ] **Step 3:** Implementar:
  - `difusionRedes.ts`: `DatosDifusion` suma `robada?: boolean`; el título usa "🚨 ROBARON a `quien`…"
    cuando `robada`.
  - `share.ts` `buildShareText`: `robada` → base "🚨 ROBADA" en vez de "🔴 PERDIDA".
  - `afiche.ts`: titular perdida → `robada ? 'SE BUSCA · ROBADA' : 'SE BUSCA'`.
  - `PetCard.tsx`: si `pet.robada`, `<Badge label="ROBADA" color={colors.lost} />` junto al de estado.
  - `PetDetailScreen.tsx`: mismo badge junto al estado; y un botón/enlace "Qué hacer si te la
    robaron" → `GuiaRobada` (Task 5) cuando `esMio && pet.robada`.
  - `ReportesMapa.tsx`: popup title suma " (robada)" cuando `p.robada` (color sin cambios).
- [ ] **Step 4:** Run tests + tsc.
- [ ] **Step 5:** Commit — `feat(t17): badge ROBADA en ficha, feed, afiche y textos de compartir`

---

### Task 5: Pantalla `GuiaRobada` + registro + enlaces

**Files:** Create `src/screens/GuiaRobadaScreen.tsx`; Modify `src/navigation/RootNavigator.tsx`;
Test `__tests__/screens/guiaRobada.test.tsx` (forma + navegación no tautológica).

- [ ] **Step 1: Failing test** — la pantalla existe, está registrada en el stack raíz con header, y
  la ficha la navega con navegación anidada absoluta (no por nombre pelado).

```ts
const nav = () => require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'src', 'navigation', 'RootNavigator.tsx'), 'utf8');
it('GuiaRobada registrada en el stack raíz con header', () => {
  expect(nav()).toMatch(/name="GuiaRobada"/);
  expect(nav()).toMatch(/GuiaRobadaScreen/);
});
```

- [ ] **Step 2:** Run, verify fail.
- [ ] **Step 3:** Crear `GuiaRobadaScreen` espejo de `GuiaPerdidaScreen` (mismo layout, `useColors`,
  header con volver) con los 5 pasos del spec (Carabineros, no negociar/pagar, pruebas de propiedad,
  difundir con ROBADA, registro + grupos) reusando `AvisoEstafa`. Registrar `<Stack.Screen
  name="GuiaRobada" component={GuiaRobadaScreen} options={{ headerShown: true, title: 'Te la robaron' }} />`
  en RootNavigator. Los CTA internos navegan como `PublicPetScreen` (anidado absoluto).
- [ ] **Step 4:** Run tests + tsc.
- [ ] **Step 5:** Commit — `feat(t17): guía "Te la robaron" (Carabineros, no negociar, pruebas)`

---

### Task 6: Suite + export + E2E + cierre

- [ ] **Step 1:** `npx jest` completo, confirmar `PIPESTATUS=0` y conteo; `npx tsc --noEmit`.
- [ ] **Step 2:** `npx expo export --platform web`.
- [ ] **Step 3:** E2E contra el dist: publicar un reporte marcando "Me la robaron", confirmar badge
  ROBADA en ficha y feed, texto de difusión con "ROBADA" sin monto, guía accesible; limpiar datos.
- [ ] **Step 4:** ESTADO.md + memoria. Commit + push.

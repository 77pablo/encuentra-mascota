import { readdirSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');
const DIR = join(RAIZ, 'supabase', 'migrations');

// ───────────────────────────────────────────────────────────────────────────
// Este guardrail viaja SIEMPRE con la migracion mas nueva del repo. Su gracia
// es ponerse rojo cuando aparece otra sin que nadie revise el orden de
// aplicacion. Si se agrega una migracion nueva, hay que MOVERLO (no
// duplicarlo): en la tanda 10, tres agentes lo copiaron a la vez y quedaron
// tres copias afirmando numeros distintos, dos de ellas rojas para siempre.
// Venia de `__tests__/db/migracion0058.test.ts`.
// ───────────────────────────────────────────────────────────────────────────
describe('0062 es la ultima migracion del repo', () => {
  it('no hay ninguna migracion con numero mayor', () => {
    const numeros = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n));
    expect(Math.max(...numeros)).toBe(62);
  });
});

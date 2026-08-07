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
//
// TANDA 14: este guardian se mueve CON CADA migracion nueva, no de una vez al
// final: 0063 (A1) -> 0064 (B2) -> 0065 (B4) -> 0066 (C3). Ponerlo en 66 desde
// el principio lo dejaria rojo toda la tanda, y un rojo conocido y tolerado es
// como se cuelan los rojos nuevos.
// Venia de 0066 (tanda 14, C3). La 0067 no estaba en el plan: salio del
// hallazgo colateral de la revision de C3 (pet_tips deanonimizaba igual que
// sightings) y Pablo decidio corregirlo en el despliegue, no arrastrarlo.
// TANDA 17: se mueve a 0068 (tipo "robada": pets.robada + buscar_reportes
// recreada desde su cuerpo vivo para devolver la columna al feed).
// TANDA 19: se mueve a 0069 (modo emergencia: tabla `eventos`, RLS de solo
// lectura de activos, sembrada por admin).
// ───────────────────────────────────────────────────────────────────────────
describe('0069 es la ultima migracion del repo', () => {
  it('no hay ninguna migracion con numero mayor', () => {
    const numeros = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n));
    expect(Math.max(...numeros)).toBe(69);
  });
});

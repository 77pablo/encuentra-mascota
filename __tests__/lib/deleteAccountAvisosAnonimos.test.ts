import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de `delete-account/index.ts` (F13, revisión adversarial
// final de la tanda 13). Mismo criterio que
// __tests__/lib/avisosBloqueoEdge.test.ts: `index.ts` usa `Deno.serve` y
// especificadores `jsr:`, así que no se puede importar desde jest.
//
// Antes de este fix, delete-account limpiaba `pet-photos` pero nunca las
// fotos anónimas de los reportes del usuario (bucket privado `avisos-anonimos`,
// D4/D5, migración 0062): quedaban huérfanas para siempre tras borrar la
// cuenta, porque Storage no está atado a la base por ninguna FK.
//
// D3 (tanda 14) sumó el paginado: `storage.list` devuelve como máximo 100
// filas por llamada, y sin paginar un reporte con más de 100 fotos de aviso
// anónimo dejaba huérfanas las que excedían la primera página.
const codigo = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'functions', 'delete-account', 'index.ts'),
  'utf8',
);

describe('F13: delete-account limpia el bucket avisos-anonimos', () => {
  it('lista y borra avisos-anonimos/<pet_id> por cada reporte del usuario, mismo patrón que deletePet', () => {
    expect(codigo).toContain("from('pets')");
    expect(codigo).toContain(".eq('user_id', userId)");
    expect(codigo).toMatch(/listarTodoElPrefijo\('avisos-anonimos',\s*petId\)/);
    expect(codigo).toMatch(/\.storage\s*\n?\s*\.from\('avisos-anonimos'\)\s*\n?\s*\.remove\(/);
  });

  // D3: el listado no puede ser un `list(prefijo)` pelado — tiene que pedir
  // `limit`/`offset` y girar hasta que una página venga incompleta. Mismo
  // guardián de forma que el resto de este archivo (regex sobre texto, no
  // import: `index.ts` usa `Deno.serve` y especificadores `jsr:`).
  it('pagina el listado (D3): límite 100 y offset por vuelta, no un list() sin paginar', () => {
    expect(codigo).toMatch(/async function listarTodoElPrefijo\(/);
    expect(codigo).toMatch(/list\(prefijo,\s*\{\s*limit:\s*TAM,\s*offset:\s*pagina \* TAM\s*\}\)/);
    expect(codigo).toMatch(/if \(lote\.length < TAM\) return todos;/);
  });

  it('limpia avisos-anonimos ANTES de anonimizar_mi_cuenta (que borra las filas de pets)', () => {
    const iAvisos = codigo.indexOf("from('avisos-anonimos')");
    const iAnonimizar = codigo.indexOf("rpc('anonimizar_mi_cuenta')");
    expect(iAvisos).toBeGreaterThanOrEqual(0);
    expect(iAnonimizar).toBeGreaterThan(iAvisos);
  });

  it('un fallo al listar o borrar avisos-anonimos se avisa (console.warn) y NO aborta el borrado de cuenta', () => {
    const i = codigo.indexOf("from('pets')\n      .select('id')");
    const fin = codigo.indexOf("// 3. Anonimizar", i);
    const bloque = codigo.slice(i, fin);
    expect(bloque).toContain('console.warn');
    expect(bloque).not.toMatch(/throw new Error/);
  });
});

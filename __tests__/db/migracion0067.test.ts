import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0067_pistas_sin_deanonimizar.sql'), 'utf8');

// El cliente que consume esta migracion. Misma leccion que la 0066: mirar solo
// el SQL no alcanza — si el grant de columna esta bien pero el service igual
// pide `user_id` sin sesion, PostgREST devuelve 42501 y `listarTips` degrada a
// lista vacia: las pistas DESAPARECEN de la ficha publica en silencio.
const clienteTips = readFileSync(
  join(__dirname, '..', '..', 'src', 'services', 'tips.ts'), 'utf8');

// Saca los comentarios de linea antes de una asercion NEGATIVA: sin esto, un
// `not.toMatch` se vuelve verde escribiendo el patron prohibido dentro de un
// comentario. Esta migracion tiene parrafos largos que citan `user_id`,
// `perfil_publico` y `authenticated` como explicacion, no como codigo.
function sinComentarios(fuente: string): string {
  return fuente
    .split('\n')
    .map((linea) => {
      const i = linea.indexOf('--');
      return i === -1 ? linea : linea.slice(0, i);
    })
    .join('\n');
}

const codigo = sinComentarios(sql);

describe('0067: las pistas dejan de deanonimizar al autor', () => {
  it('revoca fail-closed: nombra `public` ademas de `anon`', () => {
    // La leccion de la 0018, repetida por 0064 y 0066. Un `revoke ... from
    // anon` a secas seria un no-op silencioso si existiera un grant a public.
    expect(codigo).toMatch(/revoke\s+all\s+on\s+public\.pet_tips\s+from\s+public\s*,\s*anon/i);
  });

  it('revoca `all`, no solo `select`', () => {
    // Sin esto, anon conserva INSERT/UPDATE/DELETE de tabla (hoy letra muerta
    // por falta de policy) esperando a que alguien agregue una por error.
    expect(codigo).not.toMatch(/revoke\s+select\s+on\s+public\.pet_tips/i);
  });

  it('el grant a anon es POR COLUMNA y NO incluye user_id', () => {
    const grant = codigo.match(/grant\s+select\s*\(([^)]*)\)\s*\n?\s*on\s+public\.pet_tips\s+to\s+anon/i);
    expect(grant).not.toBeNull();
    const columnas = (grant as RegExpMatchArray)[1].split(',').map((c) => c.trim());
    expect(columnas.sort()).toEqual(['creado_en', 'id', 'pet_id', 'texto']);
    // El agujero exacto que esta migracion cierra.
    expect(columnas).not.toContain('user_id');
  });

  it('NO toca a authenticated (la ficha con sesion necesita user_id)', () => {
    // Si el revoke nombrara `authenticated`, el sintoma seria mudo: las pistas
    // de gente bloqueada volverian a aparecer y las firmas caerian a "Un
    // vecino", sin ningun error visible.
    expect(codigo).not.toMatch(/revoke[^;]*\bauthenticated\b/i);
  });

  it('NO toca las policies de la 0012 (solo cambia privilegios)', () => {
    expect(codigo).not.toMatch(/drop\s+policy/i);
    expect(codigo).not.toMatch(/create\s+policy/i);
  });

  it('el cliente pide un escalon PUBLICO sin user_id, y lo usa', () => {
    // Las dos mitades: que la constante exista sin user_id…
    const publico = clienteTips.match(/const SELECT_PUBLICO = '([^']*)'/);
    expect(publico).not.toBeNull();
    expect((publico as RegExpMatchArray)[1]).not.toMatch(/user_id/);
    // …y que la funcion la CONSUMA (una constante declarada y nunca usada
    // dejaria la ficha publica sin pistas igual que antes del fix).
    expect(clienteTips).toMatch(/consulta\(SELECT_PUBLICO\)/);
  });

  it('el escalon publico es el ULTIMO, despues del que pide user_id', () => {
    // El orden importa: con sesion hay que seguir pidiendo user_id (bloqueos).
    // Si el publico fuera primero, nadie leeria nunca al autor.
    const iSinAutor = clienteTips.indexOf('consulta(SELECT_SIN_AUTOR)');
    const iPublico = clienteTips.indexOf('consulta(SELECT_PUBLICO)');
    expect(iSinAutor).toBeGreaterThan(-1);
    expect(iPublico).toBeGreaterThan(iSinAutor);
  });
});

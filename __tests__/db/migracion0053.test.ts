// `readdirSync` se fue con el guardrail de "ultima migracion" (ver el final
// del archivo): hoy vive en `__tests__/db/migracion0057.test.ts`.
import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la 0053 — el perfil publico cuenta lo que se PUEDE VER.
//
// Por que existe: la 0052 sumo la cuenta de adopciones al perfil publico y, en
// la MISMA migracion, le puso vigencia al feed. Las dos mitades contaban cosas
// distintas: un refugio con 40 publicaciones sin renovar mostraba "40 · En
// adopcion" mientras el feed no mostraba ninguna. Es el mismo problema de "dos
// piezas con dos numeros" que ya habia aparecido con el radio de busqueda.
//
// Lo mas valioso de este archivo es el ultimo test: no comprueba que el SQL
// diga una frase, sino que las DOS expresiones de vigencia (la del feed y la
// del perfil) sean la misma. Un test que solo mirara el texto de la 0053 se
// quedaria verde el dia que alguien cambie el intervalo del feed.
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

// Normalizado a LF: sin .gitattributes y con core.autocrlf=true, un checkout
// limpio trae CRLF y cualquier comparacion multilinea se rompe para todos menos
// para quien escribio el archivo. Ya paso en `legales.test.js` y en la 0052.
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
const sql53 = leer('0053_perfil_adopciones_vigentes.sql');
const sql52 = leer('0052_adopcion_paridad.sql');

const codigo53 = sql53.replace(/--[^\n]*/g, '');
const codigo52 = sql52.replace(/--[^\n]*/g, '');

/** La expresion de vigencia que use un archivo, normalizada a un solo espacio. */
function vigenciaDe(codigo: string): string | null {
  const m = codigo.match(
    /coalesce\(\s*\w+\.renovado_en\s*,\s*\w+\.creado_en\s*\)\s*>=\s*now\(\)\s*-\s*interval\s*'[^']+'/,
  );
  return m ? m[0].replace(/\s+/g, ' ').replace(/\b\w+\./g, '') : null;
}

describe('el parser encuentra lo que dice buscar (si no, todo pasa por vacio)', () => {
  it('las dos migraciones tienen una expresion de vigencia', () => {
    expect(vigenciaDe(codigo53)).not.toBeNull();
    expect(vigenciaDe(codigo52)).not.toBeNull();
  });
});

describe('0053 recrea perfil_publico sin romper nada', () => {
  it('mantiene el mismo tipo de retorno, asi que alcanza con create or replace', () => {
    // Cambiar el tipo de retorno obligaria a un `drop function` con la firma
    // exacta; como no cambia, no hace falta y la migracion es mas segura.
    expect(codigo53).toContain('create or replace function public.perfil_publico(p_user_id uuid)');
    expect(codigo53).not.toContain('drop function');
    expect(codigo53).toContain('adopciones bigint');
  });

  it('conserva las cuatro cuentas, no solo la que cambia', () => {
    // Recrear una funcion y perder de paso una de sus columnas es como se
    // revierten arreglos sin que nadie se entere.
    for (const trozo of ['reencuentros', 'reportes', 'aportes', 'adopciones']) {
      expect(codigo53).toContain(trozo);
    }
    expect(codigo53).toContain('pe.reunida_en is not null');
    expect(codigo53).toContain('public.sightings');
    expect(codigo53).toContain('public.pet_tips');
  });

  it('sigue sin exponer las cuentas eliminadas', () => {
    expect(codigo53).toContain('p.eliminado_en is null');
  });

  it('no toca tablas, policies ni datos', () => {
    expect(codigo53).not.toMatch(/\balter table\b/i);
    expect(codigo53).not.toMatch(/\bcreate policy\b/i);
    expect(codigo53).not.toMatch(/\bdelete from\b/i);
    expect(codigo53).not.toMatch(/\bupdate public\./i);
  });

  it('se sigue pudiendo leer sin cuenta (es un perfil PUBLICO)', () => {
    expect(codigo53).toContain('grant execute on function public.perfil_publico(uuid) to anon;');
  });
});

describe('el numero del perfil y el del feed cuentan LO MISMO', () => {
  it('la condicion de vigencia es identica a la de buscar_adopciones', () => {
    // ESTE es el test que importa. No compara contra una frase escrita a mano
    // acá: compara las dos expresiones ENTRE SI. Si alguien cambia el intervalo
    // del feed a 60 dias y se olvida del perfil, esto se pone rojo — que es
    // justo el descuido que produjo el bug.
    expect(vigenciaDe(codigo53)).toBe(vigenciaDe(codigo52));
  });

  it('la cuenta de adopciones filtra ademas activo, oculto y adoptada', () => {
    const cuenta = codigo53.slice(codigo53.indexOf('from public.adoptions ad'));
    expect(cuenta).toContain('ad.activo = true');
    expect(cuenta).toContain('ad.oculto = false');
    expect(cuenta).toContain('ad.adoptada_en is null');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// EL GUARDRAIL DE "ULTIMA MIGRACION" SE MUDO DE ACA.
//
// Vivia en este archivo con `toBe(53)` y ahora esta en
// `__tests__/db/migracion0057.test.ts` con `toBe(57)` (tanda 12, cuentas
// institucionales). Viaja SIEMPRE con la migracion mas nueva del repo: su
// gracia es ponerse rojo cuando aparece otra sin que nadie revise el orden de
// aplicacion. Se MUEVE, no se duplica — en la tanda 10, tres agentes lo
// copiaron a la vez y quedaron tres copias afirmando numeros distintos, dos de
// ellas rojas para siempre.
//
// Todo lo de arriba SIGUE VIGENTE: la 0053 es un archivo historico y su
// contenido no cambia. Una aclaracion, eso si: la definicion VIVA de
// `perfil_publico` ya no la escribe la 0053 sino la 0057, que la recreo
// partiendo de esta version para sumarle las columnas de institucion. La
// comparacion de vigencia 0053↔0052 de mas arriba queda como registro de lo que
// hizo esta migracion; el guardrail que protege la definicion VIVA (0057↔0052)
// esta en el test de la 0057.
// ───────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0044 (M-4: «mascotas buscando» contaba
// perdidas + encontradas).
//
// La migracion no esta aplicada a Supabase todavia, asi que esto no prueba la
// base real. Lo que si ata, y es lo que se rompe de verdad, son las tres cosas
// que tienen que moverse juntas o no moverse:
//   1) el filtro de `buscando` en el SQL,
//   2) la etiqueta que lee la persona en Inicio,
//   3) `reencuentros` en el SQL vs. `countReunidas()` en el servicio (fix I-1
//      de la tanda 8: si se desalinean, Inicio se contradice a si misma).
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql0039 = readFileSync(join(DIR, '0039_impacto_comunidad.sql'), 'utf8');
const sql0044 = readFileSync(join(DIR, '0044_impacto_buscando.sql'), 'utf8');
const home = readFileSync(
  join(__dirname, '..', '..', 'src', 'screens', 'HomeScreen.tsx'),
  'utf8',
);
const servicioPets = readFileSync(
  join(__dirname, '..', '..', 'src', 'services', 'pets.ts'),
  'utf8',
);

// Las aserciones corren sobre el CODIGO, no sobre los comentarios: los dos .sql
// EXPLICAN en prosa lo mismo que se verifica acá (el 0044 nombra 'encontrada' y
// `drop function` justo para decir que no los usa), asi que buscar sobre el
// archivo crudo da falsos positivos.
const sinComentariosSql = (s: string) => s.replace(/--[^\n]*/g, '');
const codigo0039 = sinComentariosSql(sql0039);
const codigo0044 = sinComentariosSql(sql0044);

// El cuerpo entre `as $$` y el `$$;` de cierre.
function cuerpo(fuente: string): string {
  const abre = fuente.indexOf('as $$');
  expect(abre).toBeGreaterThanOrEqual(0);
  const cierra = fuente.indexOf('$$;', abre + 5);
  expect(cierra).toBeGreaterThan(abre);
  return fuente.slice(abre + 5, cierra);
}

// El parentesis del `returns table (...)`, normalizado.
function firmaDeRetorno(fuente: string): string {
  const idx = fuente.indexOf('returns table');
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = fuente.indexOf('(', idx);
  const cierra = fuente.indexOf(')', abre);
  return fuente.slice(abre + 1, cierra).replace(/\s+/g, ' ').trim().toLowerCase();
}

const cuerpo0044 = cuerpo(codigo0044);

describe('0044 arregla `buscando`: solo mascotas perdidas', () => {
  it('el sub-select de `buscando` filtra por estado = perdida', () => {
    expect(cuerpo0044).toContain(
      "from public.pets where activo = true and oculto = false and estado = 'perdida'",
    );
  });

  it('ya no queda el conteo viejo (todos los reportes vivos, sin mirar el estado)', () => {
    // El de la 0039, textual. Si vuelve, el numero se vuelve a inflar.
    expect(cuerpo(codigo0039)).toContain('from public.pets where activo = true and oculto = false)');
    expect(cuerpo0044).not.toContain('from public.pets where activo = true and oculto = false)');
  });

  it("no cuenta 'encontrada' en ningun lado", () => {
    expect(cuerpo0044).not.toContain('encontrada');
  });
});

describe('0044 se puede aplicar sin ventana sin RPC', () => {
  it('la firma de retorno es IDENTICA a la de la 0039', () => {
    // `create or replace` NO puede cambiar el `returns table (...)` de una
    // funcion: si algun dia se agrega o saca una columna hay que hacer
    // `drop function` antes, y eso deja un hueco en el que la RPC no existe
    // para nadie. Mientras la firma no cambie, esta migracion es un no-evento.
    expect(firmaDeRetorno(codigo0044)).toBe(firmaDeRetorno(codigo0039));
    expect(firmaDeRetorno(codigo0044)).toBe(
      'reencuentros bigint, buscando bigint, adopciones bigint, aportes bigint',
    );
  });

  it('usa `create or replace` y NO dropea la funcion', () => {
    expect(codigo0044).toContain('create or replace function public.impacto_comunidad()');
    expect(codigo0044).not.toMatch(/\bdrop\b/i);
  });

  it('conserva security definer con search_path fijado y los mismos grants', () => {
    expect(codigo0044).toContain('security definer');
    expect(codigo0044).toMatch(/set search_path\s*=\s*public/);
    expect(codigo0044).toContain('revoke all on function public.impacto_comunidad() from public;');
    expect(codigo0044).toContain(
      'grant execute on function public.impacto_comunidad() to anon, authenticated;',
    );
  });

  it('no toca ninguna tabla, policy ni dato', () => {
    expect(codigo0044).not.toContain('create policy');
    expect(codigo0044).not.toContain('drop policy');
    expect(codigo0044).not.toMatch(/\balter table\b/i);
    expect(codigo0044).not.toMatch(/\bdelete from\b/i);
  });
});

describe('`reencuentros` sigue alineado con countReunidas() (fix I-1)', () => {
  const CRITERIO = 'from public.pets where reunida_en is not null and oculto = false';

  it('la 0044 conserva el sub-select de reencuentros VERBATIM de la 0039', () => {
    expect(cuerpo(codigo0039)).toContain(CRITERIO);
    expect(cuerpo0044).toContain(CRITERIO);
  });

  it('countReunidas() usa el mismo criterio (reunida_en no nulo + no oculto)', () => {
    const desde = servicioPets.indexOf('export async function countReunidas');
    expect(desde).toBeGreaterThanOrEqual(0);
    const fn = servicioPets.slice(desde, servicioPets.indexOf('\n}', desde));
    expect(fn).toContain(".not('reunida_en', 'is', null)");
    expect(fn).toContain(".eq('oculto', false)");
    // El criterio viejo (`activo = false` a secas) contaba reportes cerrados
    // por otros motivos y chocaba con la tarjeta en la MISMA pantalla.
    expect(fn).not.toContain("eq('activo', false)");
  });
});

describe('el numero y la etiqueta que ve la persona dicen lo mismo', () => {
  it('Inicio sigue rotulando ese numero como «mascotas buscando»', () => {
    // Si alguien cambia esta etiqueta tiene que revisar el filtro de la RPC con
    // ella, y al reves. Es el par que M-4 encontro roto.
    expect(home).toContain('mascotas buscando');
    expect(home).toContain('{impacto!.buscando}');
  });
});

// Este guardrail viaja SIEMPRE con la ultima migracion del repo (venia en
// migracion0042.test.ts). Su sentido es avisar cuando aparece una migracion
// nueva sin que se revise el orden de aplicacion.
describe('0044 es la ultima migracion del repo', () => {
  it('no hay ninguna migracion con numero mayor', () => {
    const numeros = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n));
    expect(Math.max(...numeros)).toBe(44);
  });
});
